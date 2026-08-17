<!--
  One group of conditions, rendering its children and itself again for a nested
  group. The root is a `<fieldset>` with a hidden `<legend>`; nested groups use
  `role="group"`, announced on entry rather than before every control inside.
  `role="list"` stays explicit: WebKit drops list semantics under
  `list-style: none`, taking the item count with it.
-->
<template>
	<component
		:is="rootTag"
		data-slot="condition-group"
		:data-depth="path.length"
		:role="rootTag === 'fieldset' ? undefined : 'group'"
		:aria-label="rootTag === 'fieldset' ? undefined : groupName"
		class="flex w-full min-w-0 flex-col gap-4"
		:class="hasCard && 'rounded-lg border border-outline-gray-2 bg-surface-white p-3'"
	>
		<legend v-if="rootTag === 'fieldset'" class="sr-only">
			{{ groupName }}
		</legend>

		<!-- Rows are subgrids of this grid, so the columns line up across rows.
		`display: contents` matches them too but drops the row's role and name. -->
		<ul
			v-if="group.conditions.length"
			role="list"
			class="grid w-full min-w-0 list-none items-center gap-x-2 gap-y-4"
			:style="{ gridTemplateColumns: trackList }"
		>
			<li
				v-for="(condition, index) in group.conditions"
				:key="index"
				class="grid items-center gap-x-2"
				style="grid-template-columns: subgrid; grid-column: 1 / -1"
				:data-condition-path="[...path, index].join('.')"
				:data-condition-builder="context.builderId.value"
			>
				<slot v-if="index === 0" name="where" v-bind="whereProps()">
					<ConjunctionCell
						:index="index"
						:conjunction="conjunctionAt(index)"
						:can-toggle="canToggleAt(index)"
						:group-path="path"
					/>
				</slot>
				<slot v-else name="conjunction" v-bind="conjunctionProps(index)">
					<ConjunctionCell
						:index="index"
						:conjunction="conjunctionAt(index)"
						:can-toggle="canToggleAt(index)"
						:group-path="path"
					/>
				</slot>

				<template v-if="isGroup(condition)">
					<div class="min-w-0" style="grid-column: span 3">
						<Button
							v-if="childIsModal()"
							data-slot="open-nested"
							variant="outline"
							class="w-max"
							:label="context.labels.value.openNested"
							aria-haspopup="dialog"
							:aria-expanded="nestedOpen === index"
							@click="nestedOpen = index"
						/>
						<ConditionGroup
							v-else
							:group="asGroup(condition)"
							:path="[...path, index]"
							:base-depth="baseDepth"
						>
							<template v-if="$slots.condition" #condition="slotProps">
								<slot name="condition" v-bind="slotProps" />
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
				</template>

				<ConditionRow
					v-else
					:condition="condition"
					:path="[...path, index]"
					:field-label-id="rowFieldId(index)"
				>
					<template v-if="$slots.condition" #condition="slotProps">
						<slot name="condition" v-bind="slotProps" />
					</template>
					<template v-if="$slots.value" #value="valueProps">
						<slot name="value" v-bind="valueProps" />
					</template>
				</ConditionRow>

				<slot name="actions" v-bind="actionsProps(index, isGroup(condition))">
					<ConditionActions
						:path="[...path, index]"
						:is-group="isGroup(condition)"
						:field-label-id="rowFieldId(index)"
					/>
				</slot>

				<span :id="rowFieldId(index)" class="sr-only">
					{{ leafFieldLabel(condition, context.fields.value) }}
				</span>
			</li>
		</ul>

		<div
			v-if="!context.readonly.value"
			class="flex"
			:data-add-group="path.join('.')"
			:data-condition-builder="context.builderId.value"
		>
			<slot name="addCondition" v-bind="addConditionProps()">
				<Dropdown v-slot="{ open }" :options="addOptions">
					<Button
						data-slot="add-condition"
						:disabled="context.disabled.value"
						:label="context.labels.value.addCondition"
						icon-left="lucide-plus"
						:icon-right="open ? 'lucide-chevron-up' : 'lucide-chevron-down'"
					/>
				</Dropdown>
			</slot>
		</div>

		<Dialog
			:model-value="nestedGroup !== undefined"
			:title="context.labels.value.nestedTitle"
			size="3xl"
			@update:model-value="onNestedOpenChange"
		>
			<template #default>
				<ConditionGroup
					v-if="nestedGroup !== undefined && nestedOpen !== null"
					:group="nestedGroup"
					:path="[...path, nestedOpen]"
					:base-depth="path.length + 1"
				>
					<template v-if="$slots.condition" #condition="slotProps">
						<slot name="condition" v-bind="slotProps" />
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
			</template>
		</Dialog>
	</component>
</template>

<script setup lang="ts">
import { computed, ref, useId, watch } from "vue";
import { Button, Dialog, Dropdown } from "frappe-ui";
import type { FilterField } from "../Filter/types";
import ConditionActions from "./ConditionActions.vue";
import ConditionRow from "./ConditionRow.vue";
import ConjunctionCell from "./ConjunctionCell.vue";
import { useConditionBuilderContext } from "./context";
import { canNest, isGroup } from "./tree";
import type {
	ActionsSlotProps,
	AddConditionSlotProps,
	ConditionGroup as ConditionGroupType,
	ConditionPath,
	ConditionSlotProps,
	ConjunctionSlotProps,
	Conjunction,
	FieldConditionValue,
	ValueSlotProps,
	WhereSlotProps,
} from "./types";

defineOptions({ name: "ConditionGroup" });

const props = withDefaults(
	defineProps<{
		group: ConditionGroupType<unknown>;
		path: ConditionPath;

		/**
		 * Depth at which the current inline run started. A dialog hands back the
		 * width nesting had eaten, so it resets this to the group's own depth and
		 * `modalDepth` is measured from here rather than from the root.
		 */
		baseDepth?: number;
	}>(),
	{ baseDepth: 0 }
);

// Explicit slot types break the inference cycle self-recursion creates: the
// template passes this component's own slots back into itself.
interface GroupSlots {
	condition?(props: ConditionSlotProps<unknown>): any;
	value?(props: ValueSlotProps): any;
	where?(props: WhereSlotProps): any;
	conjunction?(props: ConjunctionSlotProps): any;
	actions?(props: ActionsSlotProps): any;
	addCondition?(props: AddConditionSlotProps): any;
}

defineSlots<GroupSlots>();

const context = useConditionBuilderContext();
const rowIdPrefix = useId();

interface AddItem {
	label: string;
	onClick: () => void;
}

const canAddGroup = computed(() => canNest(props.path, context.maxDepth.value));

const addOptions = computed<AddItem[]>(() => {
	const labels = context.labels.value;

	const items: AddItem[] = [
		{
			label: labels.addCondition,
			onClick: () => context.addCondition(props.path),
		},
	];

	if (canAddGroup.value) {
		items.push({
			label: labels.addGroup,
			onClick: () => context.addGroup(props.path),
		});
	}

	return items;
});

// Only nested groups draw their own card; the root's border is the builder's.
// `bordered: 'root'` drops these, so depth reads from indentation alone.
const isNested = computed(() => props.path.length > 0);
const hasCard = computed(() => isNested.value && context.bordered.value === "all");

// A `<fieldset>` groups form controls, so a read-only tree — which has none —
// uses the same `role="group"` as the nested levels.
const rootTag = computed(() => (!isNested.value && !context.readonly.value ? "fieldset" : "div"));

// A group is described by its conjunction, which is otherwise conveyed only by a
// button between rows — reached after the first condition, not before it. Mixed
// operators are neither "match all" nor "match any", so they get their own name.
const groupName = computed(() => {
	const labels = context.labels.value;
	const gaps = props.group.conjunctions;
	if (gaps.length === 0 || gaps.every((c) => c === "and")) return labels.matchAll;
	if (gaps.every((c) => c === "or")) return labels.matchAny;
	return labels.matchMixed;
});

/** The operator above row `index`, i.e. the gap that row's cell edits. */
function conjunctionAt(index: number): Conjunction {
	return props.group.conjunctions[index - 1] ?? "and";
}

/**
 * Whether row `index`'s cell is live. `mixed` gives every gap its own control;
 * in `uniform` the group carries one operator, so only the second row's control
 * is live and every row below it is locked.
 */
function canToggleAt(index: number): boolean {
	if (index < 1 || context.readonly.value) return false;
	return context.conjunctionMode.value === "mixed" || index === 1;
}

const trackList = computed(() => {
	const columns = context.columns.value;
	return [
		"minmax(66px, max-content)",
		columns.field,
		columns.operator,
		columns.value,
		"max-content",
	].join(" ");
});

/** Id of the span holding a row's field label, which names its controls. */
function rowFieldId(index: number): string {
	return `${rowIdPrefix}-${index}`;
}

/**
 * The field a leaf names, as text. Every control in a row is named after it, so
 * eight operator selects are told apart by more than the word "operator". A
 * fieldname with no Meta behind it shows as itself, since removing the row is the
 * only way to fix it; duck-typing on `fieldname` labels a custom leaf shape too.
 */
function leafFieldLabel(node: unknown, fields: FilterField[]): string {
	if (node === null || typeof node !== "object") return "";
	const fieldname = (node as Partial<FieldConditionValue>).fieldname;
	if (typeof fieldname !== "string" || fieldname === "") return "";
	return fields.find((f) => f.fieldname === fieldname)?.label ?? fieldname;
}

function whereProps(): WhereSlotProps {
	return { groupPath: props.path, conjunction: props.group.conjunctions[0] };
}

function conjunctionProps(index: number): ConjunctionSlotProps {
	return {
		conjunction: conjunctionAt(index),
		index,
		gap: index - 1,
		groupPath: props.path,
		toggle: () => context.toggleConjunction(props.path, index - 1),
		canToggle: canToggleAt(index),
	};
}

function actionsProps(index: number, group: boolean): ActionsSlotProps {
	const path = [...props.path, index];
	return {
		path,
		isGroup: group,
		disabled: context.disabled.value,
		readonly: context.readonly.value,
		canGroup: canNest(props.path, context.maxDepth.value),
		turnIntoGroup: () => context.turnIntoGroup(path),
		ungroup: () => context.ungroup(path),
		remove: () => context.remove(path),
	};
}

function addConditionProps(): AddConditionSlotProps {
	return {
		groupPath: props.path,
		addCondition: () => context.addCondition(props.path),
		addGroup: () => context.addGroup(props.path),
		canAddGroup: canAddGroup.value,
		disabled: context.disabled.value,
	};
}

const nestedOpen = ref<number | null>(null);

// Past `modalDepth` a child stops rendering inline: each level costs a card's
// border and padding, so deep trees run out of width. Depth counts from
// `baseDepth`, so the budget restarts inside each dialog — N levels inline, a
// dialog, N more inline — making the escape periodic rather than a fixed list.
function childIsModal(): boolean {
	return props.path.length + 1 - props.baseDepth > context.modalDepth.value;
}

/**
 * The open dialog's subject, resolved every render rather than captured on open:
 * emptying the group the dialog shows prunes it, leaving the index addressing
 * whatever moved into its place or nothing at all. Resolving each time closes the
 * dialog once its subject stops existing.
 */
const nestedGroup = computed<ConditionGroupType<unknown> | undefined>(() => {
	if (nestedOpen.value === null) return undefined;
	const node = props.group.conditions[nestedOpen.value];
	return node !== undefined && isGroup(node) ? node : undefined;
});

// The dialog is addressed by child index, and an index is only stable while this
// group's children are. Edits inside the open nested group leave the count here
// alone, so the dialog stays open for its own work and closes exactly when its
// subject may have moved. This also clears an index left set by a prune that
// closed the dialog without emitting `update:model-value`.
watch(
	() => props.group.conditions.length,
	() => {
		nestedOpen.value = null;
	}
);

// A removal at or above this group's path re-points the instances that rendered
// the later siblings, so this one may now be showing a different group with the
// same child count. A deeper removal — including one inside the open dialog —
// leaves it alone.
watch(
	() => context.lastRemoval.value,
	(removal) => {
		if (removal && isAtOrAbove(removal.path, props.path)) nestedOpen.value = null;
	}
);

/** Whether `edit` addresses this group or one of its ancestors. */
function isAtOrAbove(edit: ConditionPath, own: ConditionPath): boolean {
	return edit.length <= own.length && edit.every((index, depth) => index === own[depth]);
}

function onNestedOpenChange(open: boolean) {
	if (!open) nestedOpen.value = null;
}

// `v-if="isGroup(...)"` does not narrow the union for vue-tsc, hence the cast.
function asGroup(node: unknown) {
	return node as ConditionGroupType<unknown>;
}
</script>
