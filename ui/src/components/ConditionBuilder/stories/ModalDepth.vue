<!--
  Past `modalDepth` a nested group opens in a dialog rather than inline, handing
  back the width nesting eats. The budget restarts inside the dialog, so the
  escape is periodic.
-->
<template>
	<div class="w-full max-w-3xl">
		<ConditionBuilder
			v-model="conditions"
			:fields="sampleFields"
			:max-depth="4"
			:modal-depth="modalDepth"
		/>

		<div class="mt-3 flex items-center gap-2 text-xs text-ink-gray-5">
			<span class="shrink-0">modalDepth</span>
			<Select v-model="modalDepth" :options="depthOptions" class="w-20" />
			<span>groups deeper than this open in a dialog</span>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { Select } from "frappe-ui";
import { ConditionBuilder } from "../index";
import type { ConditionGroup } from "../index";
import { sampleFields } from "./fields";

const depthOptions = [0, 1, 2, 3, 4].map((d) => ({ label: String(d), value: d }));
const modalDepth = ref(1);

const conditions = ref<ConditionGroup>({
	conjunctions: ["and"],
	conditions: [
		{ fieldname: "status", operator: "equals", value: "Open" },
		{
			conjunctions: ["or"],
			conditions: [
				{ fieldname: "priority", operator: "equals", value: "High" },
				{
					conjunctions: ["and"],
					conditions: [
						{ fieldname: "subject", operator: "like", value: "urgent" },
						{ fieldname: "subject", operator: "like", value: "refund" },
					],
				},
			],
		},
	],
});
</script>
