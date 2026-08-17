// ConditionBuilder — a controlled editor for a nested and/or condition tree,
// built over the same operator and value-control rules as `Filter` so the two
// cannot drift. Hosts that persist Frappe's interleaved condition array convert
// with `fromFrappeConditions` / `toFrappeConditions`.
export { default as ConditionBuilder } from "./ConditionBuilder.vue";
export { fromFrappeConditions, toFrappeConditions } from "./adapters";
export { emptyTree, isGroup } from "./tree";
export type {
  ConditionBorders,
  ConditionBuilderLabels,
  ConditionBuilderProps,
  ConditionColumns,
  ConditionGroup,
  ConditionNode,
  ConditionPath,
  ConditionValue,
  Conjunction,
  FieldConditionValue,
} from "./types";
// The field shape the built-in leaf takes, so a consumer supplying `fields`
// need not also import from the Filter subpath.
export type { FilterField } from "../Filter/types";
