<!--
  The leading cell of a condition row: "Where" on the first row of a group, and
  on every row after it the operator joining that row to the one above. A locked
  gap renders as a disabled button, which is not a tab stop; a read-only tree
  renders the word as text. `Button` overwrites a fallthrough `aria-label` with
  its `label`, so what the control does goes on `aria-describedby`.
-->
<template>
	<div class="min-w-[66px] text-start text-p-base text-ink-gray-5">
		<div v-if="index === 0">{{ labels.where }}</div>
		<template v-else-if="!context.readonly.value">
			<Button
				variant="subtle"
				class="w-max"
				iconRight="lucide-refresh-cw"
				:label="word"
				:disabled="!canToggle"
				:aria-describedby="canToggle ? hintId : undefined"
				@click="canToggle && context.toggleConjunction(groupPath, index - 1)"
			/>
			<span v-if="canToggle" :id="hintId" class="sr-only">
				{{ labels.conjunctionHint }}
			</span>
		</template>
		<div v-else>{{ word }}</div>
	</div>
</template>

<script setup lang="ts">
import { computed, useId } from "vue";
import { Button } from "frappe-ui";
import { useConditionBuilderContext } from "./context";
import type { ConditionPath, Conjunction } from "./types";

const props = defineProps<{
	index: number;
	conjunction: Conjunction;
	groupPath: ConditionPath;

	/** Whether this gap's control is live. Decided by the group, not here. */
	canToggle?: boolean;
}>();

const context = useConditionBuilderContext();
const labels = context.labels;
const hintId = useId();

const word = computed(() => (props.conjunction === "and" ? labels.value.and : labels.value.or));
</script>
