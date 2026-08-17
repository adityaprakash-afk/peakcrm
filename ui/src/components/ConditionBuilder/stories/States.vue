<!--
  Every state the builder survives: empty and `null` models, read-only, disabled,
  every value control, and entries the parser cannot model kept under `__raw`.
-->
<template>
	<div class="grid w-full max-w-3xl gap-8">
		<section v-for="c in cases" :key="c.title" class="grid gap-2">
			<h4 class="font-mono text-xs uppercase tracking-wide text-ink-gray-5">
				{{ c.title }}
			</h4>
			<ConditionBuilder v-model="c.model.value" :fields="sampleFields" v-bind="c.props" />
		</section>
	</div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { ConditionBuilder, fromFrappeConditions } from "../index";
import type { ConditionGroup } from "../index";
import { sampleFields } from "./fields";

const filled: ConditionGroup = {
	conjunctions: [],
	conditions: [{ fieldname: "status", operator: "equals", value: "Open" }],
};

const empty = ref<ConditionGroup>({ conjunctions: [], conditions: [] });
const nullish = ref<ConditionGroup | null>(null);
const readonlyTree = ref<ConditionGroup>(structuredClone(filled));
const disabledTree = ref<ConditionGroup>(structuredClone(filled));

// Every value control the dispatch can pick, so each one renders.
const allTypes = ref<ConditionGroup>({
	conjunctions: ["and", "and", "and", "and", "and", "and"],
	conditions: [
		{ fieldname: "subject", operator: "like", value: "urgent" },
		{ fieldname: "creation", operator: "between", value: "" },
		{ fieldname: "rating", operator: ">=", value: 3 },
		{ fieldname: "resolved", operator: "equals", value: "Yes" },
		{ fieldname: "status", operator: "is", value: "set" },
		{ fieldname: "owner", operator: "in", value: [] },
		{ fieldname: "_assign", operator: "like", value: "john" },
	],
});

// A doctype-qualified filter the parser cannot model as a leaf, plus a condition
// naming a field that is not in `fields` at all.
const preserved = ref<ConditionGroup>(
	fromFrappeConditions([
		["ToDo", "status", "==", "Open"],
		"and",
		["deleted_field", "equals", "Open"],
	])
);

const cases = [
	{ title: "Empty", model: empty, props: {} },
	{ title: "modelValue = null", model: nullish, props: {} },
	{ title: "Read-only", model: readonlyTree, props: { readonly: true } },
	{
		title: "Disabled (adding blocked)",
		model: disabledTree,
		props: { disabled: true },
	},
	{ title: "Every value control", model: allTypes, props: {} },
	{ title: "Preserved and unknown entries", model: preserved, props: {} },
];
</script>
