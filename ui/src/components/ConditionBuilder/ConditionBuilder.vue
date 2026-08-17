<!--
  ConditionBuilder — a controlled editor for a nested and/or condition tree. Its
  `v-model` is the tree; it owns no data resource and never calls an app endpoint
  (FP2). The built-in leaf's fields come from the doctype's Meta (FP3) or from an
  explicit `fields` array. It also owns the two singular things: the live region,
  mounted once and unconditionally, and focus.
-->
<template>
	<div ref="rootRef" data-slot="condition-builder" class="w-full">
		<!-- `aria-live` is load-bearing beyond the role: `hideOthers` exempts nodes
		by that literal attribute, so without it this region is hidden — and silent —
		for as long as a nested-group dialog is open. -->
		<div role="status" aria-live="polite" aria-atomic="true" class="sr-only">
			{{ announcement }}
		</div>

		<!-- Above the branch below so it shows whether or not the tree has rows: a
		failed Meta request leaves every row naming a field the builder cannot find.
		Not a live region of its own — the message goes through `announce`, which
		re-announces a second failure that a static node mutating to the same string
		would not. -->
		<div
			v-if="fieldsError"
			data-slot="condition-fields-error"
			class="mb-4 flex items-center gap-2 rounded-md bg-surface-red-2 p-2 text-p-sm text-ink-red-6"
		>
			<span :id="fieldsErrorId" class="min-w-0 flex-1">{{ labels.fieldsError }}</span>
			<Button
				:label="labels.retryFields"
				:aria-labelledby="`${retryId} ${fieldsErrorId}`"
				@click="reloadFields"
			/>
			<span :id="retryId" class="sr-only">{{ labels.retryFields }}</span>
		</div>

		<button
			v-if="isEmpty && !readonly && !disabled"
			type="button"
			data-slot="condition-empty"
			class="flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-outline-gray-2 p-4 text-p-sm text-ink-gray-5"
			@click="addToRoot"
		>
			<slot name="empty">
				<span class="lucide-plus size-4" aria-hidden="true" />
				{{ labels.empty }}
			</slot>
		</button>

		<div
			v-else-if="isEmpty"
			data-slot="condition-empty"
			tabindex="-1"
			class="flex w-full items-center justify-center gap-2 rounded-md border border-outline-gray-2 p-4 text-p-sm text-ink-gray-5"
		>
			<slot name="empty">
				<span class="lucide-plus size-4" aria-hidden="true" />
				{{ labels.empty }}
			</slot>
		</div>

		<div
			v-else
			class="flex w-full flex-col gap-4"
			:class="bordered !== 'none' && 'rounded-lg border border-outline-gray-2 p-3'"
		>
			<ConditionGroup :group="tree" :path="[]">
				<template v-if="$slots.condition" #condition="slotProps">
					<slot name="condition" v-bind="asConditionSlotProps(slotProps)" />
				</template>
				<template v-if="$slots.value" #value="valueProps">
					<slot name="value" v-bind="valueProps" />
				</template>
				<template v-if="$slots.where" #where="whereSlot">
					<slot name="where" v-bind="whereSlot" />
				</template>
				<template v-if="$slots.conjunction" #conjunction="conjSlot">
					<slot name="conjunction" v-bind="conjSlot" />
				</template>
				<template v-if="$slots.actions" #actions="actionsSlot">
					<slot name="actions" v-bind="actionsSlot" />
				</template>
				<template v-if="$slots.addCondition" #addCondition="addSlot">
					<slot name="addCondition" v-bind="addSlot" />
				</template>
			</ConditionGroup>
		</div>
	</div>
</template>

<script lang="ts">
// Module-local so the sequence is monotonic for the life of the page: a builder
// unmounted and remounted cannot hand a stale number to a group watching it.
let removalSeq = 0;
</script>

<script setup lang="ts" generic="TLeaf = FieldConditionValue">
import { computed, nextTick, provide, ref, shallowRef, useId, watch } from "vue";
import { Button } from "frappe-ui";
import { useDoctypeMeta } from "../../composables/useDoctypeMeta";
import { getFilterableFields } from "../Filter/getFilterableFields";
import type { FilterField } from "../Filter/types";
import ConditionGroup from "./ConditionGroup.vue";
import { conditionBuilderKey, mergeColumns, mergeLabels, uncachedLabels } from "./context";
import {
	addCondition as addConditionAt,
	addGroup as addGroupAt,
	emptyTree,
	getNode,
	isGroup,
	removeNode,
	setGroupConjunction,
	toggleConjunction as toggleConjunctionAt,
	turnIntoGroup as turnIntoGroupAt,
	ungroup as ungroupAt,
	updateLeaf,
} from "./tree";
import type {
	ConditionBuilderProps,
	ConditionBuilderSlots,
	ConditionGroup as ConditionGroupType,
	ConditionPath,
	ConditionSlotProps,
	FieldConditionValue,
} from "./types";

// Declared explicitly: the slots are forwarded down the tree rather than
// rendered here, so vue-component-meta cannot infer them for the docs table.
// Each is then forwarded by name below rather than through a `v-for` over
// `$slots`, because a dynamic slot name erases the payload's type at the
// boundary and re-renders the whole subtree on every parent update.
defineSlots<ConditionBuilderSlots<TLeaf>>();

// ConditionGroup is not generic over TLeaf — it types its own #condition slot as
// ConditionSlotProps<unknown> to break a self-recursive inference cycle — so
// re-forwarding that slot here needs an explicit cast back.
function asConditionSlotProps(slotProps: ConditionSlotProps<unknown>): ConditionSlotProps<TLeaf> {
	return slotProps as ConditionSlotProps<TLeaf>;
}

const props = withDefaults(defineProps<ConditionBuilderProps<TLeaf>>(), {
	maxDepth: 4,
	modalDepth: 2,
	bordered: "all",
	disabled: false,
	readonly: false,
	conjunctionMode: "mixed",
});

const emit = defineEmits<{
	"update:modelValue": [value: ConditionGroupType<TLeaf>];
}>();

const rootRef = ref<HTMLElement | null>(null);
const id = useId();
const fieldsErrorId = useId();
const retryId = useId();

// Backs uncontrolled mode: with no `modelValue`, nothing else holds the tree
// between clicks. `shallowRef` skips Vue's deep UnwrapRef on the generic `TLeaf`.
// Only `undefined` means uncontrolled; a `null` — what a nullable backend field
// bound straight to `v-model` gives — is a controlled value that happens to be
// empty, so it is written through as `emptyTree()`.
const internalValue = shallowRef<ConditionGroupType<TLeaf>>(
	props.modelValue ?? emptyTree<TLeaf>()
);

watch(
	() => props.modelValue,
	(value) => {
		if (value !== undefined) internalValue.value = value ?? emptyTree<TLeaf>();
	}
);

// `internalValue` is seeded and rewritten through `emptyTree()`, so it is never
// null; only `modelValue` needs the fallback.
const tree = computed<ConditionGroupType<TLeaf>>(() => props.modelValue ?? internalValue.value);

// Not a `computed`: with nothing reactive to depend on it would cache its first
// evaluation and freeze the labels in whatever language was current during the
// first render. A bare getter object is not a ref, so the template would not unwrap it.
const labels = uncachedLabels(() => mergeLabels(props.labels));
const columns = computed(() => mergeColumns(props.columns));
const isEmpty = computed(() => tree.value.conditions.length === 0);

// Meta is fetched only when the host asked for a doctype and did not supply the
// fields itself. Read once at setup: `useDoctypeMeta` starts a request, so a host
// that switches doctype remounts with `:key` rather than fetching each one.
const doctype = props.fields ? "" : props.doctype ?? "";
const meta = doctype ? useDoctypeMeta(doctype) : null;

const fields = computed<FilterField[]>(() => {
	if (props.fields) return props.fields;
	const loaded = meta?.meta.value;
	if (!loaded) return [];
	return getFilterableFields(loaded.fields ?? [], doctype);
});

const fieldsLoading = computed(() => Boolean(meta && meta.loading.value && !meta.meta.value));

// A failed request leaves `fields` empty with nothing loading, which every row
// reads as its field having been deleted. The alert says otherwise, and offers
// the way back.
const fieldsError = computed<unknown>(() => (meta ? meta.error.value : null));

function reloadFields() {
	meta?.reload();
}

const announcement = ref("");
let pending: string[] = [];

// Cleared first so the same message twice in a row is still a change. Messages
// raised in one tick are joined rather than overwriting each other: a removal
// that prunes a group announces from two places in the same flush.
function announce(message: string) {
	pending.push(message);
	announcement.value = "";
	nextTick(() => {
		if (pending.length === 0) return;
		announcement.value = pending.join(" ");
		pending = [];
	});
}

// Announced rather than rendered live, so a second failure after a retry is
// announced too.
watch(fieldsError, (error) => {
	if (error) announce(labels.value.fieldsError);
});

// Rows are keyed by index, so taking a node out of its parent re-points the
// component instances that rendered its later siblings at whatever slid in.
const lastRemoval = shallowRef<{ path: ConditionPath; seq: number } | null>(null);

function newLeaf(): TLeaf {
	if (props.newCondition) return props.newCondition();
	return { fieldname: "", operator: "equals", value: "" } as TLeaf;
}

function commit(next: ConditionGroupType<TLeaf>) {
	internalValue.value = next;
	emit("update:modelValue", next);
}

/** How many conditions the tree holds, at any depth. Groups are not counted. */
function countConditions(group: ConditionGroupType<TLeaf>): number {
	return group.conditions.reduce<number>(
		(total, node) => total + (isGroup(node) ? countConditions(node) : 1),
		0
	);
}

/**
 * How many groups the tree holds below the root, at any depth. Comparing the
 * count before and after tells whether a removal cascaded, where inspecting the
 * removed node's parent cannot — a sibling group can shift into the index the
 * pruned one occupied and read as if nothing was pruned.
 */
function countGroups(group: ConditionGroupType<TLeaf>): number {
	return group.conditions.reduce<number>(
		(total, node) => total + (isGroup(node) ? 1 + countGroups(node) : 0),
		0
	);
}

/**
 * Where focus should go after an edit: onto a row, or onto a group's add
 * affordance when the group it would have gone to is now empty.
 */
type FocusTarget =
	| { kind: "row"; path: ConditionPath }
	| { kind: "add"; groupPath: ConditionPath };

/**
 * Where focus goes after the node at `removed` is deleted: the row that slid
 * into its place, or the one before it for the last row. Without this the button
 * that ran the deletion goes with it and focus falls back to `<body>`. A group
 * pruned along with it asks the same question one level up.
 */
function focusAfterRemove(root: ConditionGroupType<TLeaf>, removed: ConditionPath): FocusTarget {
	let path = removed;

	while (path.length > 0) {
		const groupPath = path.slice(0, -1);
		const node = getNode(root, groupPath);

		if (node !== undefined && isGroup(node)) {
			const count = node.conditions.length;
			if (count === 0) return { kind: "add", groupPath };
			const index = Math.min(path[path.length - 1], count - 1);
			return { kind: "row", path: [...groupPath, index] };
		}

		// That group was pruned too — ask the same question about its own row.
		path = groupPath;
	}

	return { kind: "add", groupPath: [] };
}

/** The row just appended to `groupPath`, so the next thing typed goes into it. */
function focusAfterAdd(root: ConditionGroupType<TLeaf>, groupPath: ConditionPath): FocusTarget {
	const node = getNode(root, groupPath);
	if (node === undefined || !isGroup(node) || node.conditions.length === 0) {
		return { kind: "add", groupPath };
	}
	return { kind: "row", path: [...groupPath, node.conditions.length - 1] };
}

/**
 * The condition inside a freshly added group, rather than the group's own row —
 * whose first focusable is the and/or toggle, so typing would flip a conjunction
 * instead of naming a field.
 */
function focusAfterAddGroup(
	root: ConditionGroupType<TLeaf>,
	groupPath: ConditionPath
): FocusTarget {
	const target = focusAfterAdd(root, groupPath);
	if (target.kind !== "row") return target;
	const added = getNode(root, target.path);
	if (added === undefined || !isGroup(added) || added.conditions.length === 0) return target;
	return { kind: "row", path: [...target.path, 0] };
}

/**
 * Move focus onto the element the edit left behind, once it has rendered. Rows
 * are addressed by path rather than held as refs: the dialog teleports its rows
 * out of this subtree, and after a cascade the target is a row the group the
 * edit started in never rendered.
 */
function moveFocus(target: FocusTarget, after: "add" | "remove") {
	nextTick(() => {
		const scope = `[data-condition-builder="${id}"]`;

		if (target.kind === "row") {
			const preferred = after === "remove" ? ROW_ACTIONS : ROW_ENTRY;
			// A group past `modalDepth` renders as a button, so a row inside it is not
			// in the document; its parent row holds the button that opens the dialog.
			for (const path of [target.path, target.path.slice(0, -1)]) {
				const row = document.querySelector<HTMLElement>(
					`${scope}[data-condition-path="${path.join(".")}"]`
				);
				const element = ownElement(row, preferred) ?? ownElement(row, FOCUSABLE);
				if (element) {
					element.focus();
					return;
				}
			}
			return;
		}

		// Not path-scoped: the add cell sits outside any row, and it holds only its
		// own button — a nested group's add cell lives inside the <ul>, not here.
		const add = firstEnabled(
			document.querySelector<HTMLElement>(
				`${scope}[data-add-group="${target.groupPath.join(".")}"]`
			),
			"button"
		);
		// Nothing is left to add into: the builder is showing its empty state, which
		// carries tabindex="-1" so it can take focus even when the host has disabled
		// adding and the button branch is not rendered.
		const empty = rootRef.value?.querySelector<HTMLElement>('[data-slot="condition-empty"]');
		(add ?? empty)?.focus();
	});
}

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** Where the user was standing when a row was removed. */
const ROW_ACTIONS = '[data-slot="condition-actions"] button';

/** Where the user is going when a row is added, or the dialog holding it. */
const ROW_ENTRY =
	'[data-slot="condition-field"] button, [data-slot="condition-field"] input, [data-slot="open-nested"]';

/**
 * The first match inside `row` that belongs to `row` itself. A row holding a
 * nested group contains that whole subtree and renders it before its own actions
 * cell, so a plain `querySelector` would land a level deeper than the highlight
 * suggests. Disabled elements are skipped: `focus()` on one is a no-op.
 */
function ownElement(row: HTMLElement | null, selector: string): HTMLElement | null {
	if (!row) return null;
	for (const element of row.querySelectorAll<HTMLElement>(selector)) {
		if (element.closest("[data-condition-path]") !== row) continue;
		if (element.hasAttribute("disabled")) continue;
		return element;
	}
	return null;
}

/** The first match that can actually take focus. */
function firstEnabled(root: HTMLElement | null, selector: string): HTMLElement | null {
	if (!root) return null;
	for (const element of root.querySelectorAll<HTMLElement>(selector)) {
		if (!element.hasAttribute("disabled")) return element;
	}
	return null;
}

function addToRoot() {
	const next = addConditionAt(tree.value, [], newLeaf());
	commit(next);
	moveFocus(focusAfterAdd(next, []), "add");
}

provide(conditionBuilderKey, {
	builderId: computed(() => id),
	fields,
	fieldsLoading,
	fieldsError,
	reloadFields,
	columns,
	labels,
	bordered: computed(() => props.bordered),
	maxDepth: computed(() => props.maxDepth),
	modalDepth: computed(() => props.modalDepth),
	disabled: computed(() => props.disabled),
	readonly: computed(() => props.readonly),
	conjunctionMode: computed(() => props.conjunctionMode),

	addCondition: (path: ConditionPath) => {
		const next = addConditionAt(tree.value, path, newLeaf());
		commit(next);
		moveFocus(focusAfterAdd(next, path), "add");
	},
	addGroup: (path: ConditionPath) => {
		const next = addGroupAt(tree.value, path, newLeaf());
		commit(next);
		moveFocus(focusAfterAddGroup(next, path), "add");
	},
	remove: (path: ConditionPath) => {
		const removed = getNode(tree.value, path);
		const groupsBefore = countGroups(tree.value);
		const next = removeNode(tree.value, path);
		commit(next);
		lastRemoval.value = { path, seq: (removalSeq += 1) };
		// Focus movement explains the row going. It cannot explain the group going
		// with it — and only a removed *condition* counts, since removing a group is
		// meant to take one.
		const cascaded =
			removed !== undefined && !isGroup(removed) && countGroups(next) < groupsBefore;
		announce(labels.value.removed(countConditions(next), cascaded));
		moveFocus(focusAfterRemove(next, path), "remove");
	},
	update: (path: ConditionPath, leaf: unknown) =>
		commit(updateLeaf(tree.value, path, leaf as TLeaf)),
	turnIntoGroup: (path: ConditionPath) => commit(turnIntoGroupAt(tree.value, path)),
	// The group's own row goes, and with it the menu that ran this — so focus is
	// placed the same way a removal places it: on the row that took its place,
	// which here is the first child spliced into the gap.
	ungroup: (path: ConditionPath) => {
		const next = ungroupAt(tree.value, path);
		commit(next);
		lastRemoval.value = { path, seq: (removalSeq += 1) };
		moveFocus(focusAfterRemove(next, path), "remove");
	},
	// `uniform`: the group carries one operator, so a toggle rewrites every gap
	// rather than the one that was clicked.
	toggleConjunction: (path: ConditionPath, gap: number) => {
		if (props.conjunctionMode === "mixed") {
			commit(toggleConjunctionAt(tree.value, path, gap));
			return;
		}
		const group = getNode(tree.value, path);
		if (group === undefined || !isGroup(group)) return;
		const current = group.conjunctions[gap] ?? "and";
		commit(setGroupConjunction(tree.value, path, current === "and" ? "or" : "and"));
	},
	announce,
	lastRemoval: computed(() => lastRemoval.value),
});
</script>
