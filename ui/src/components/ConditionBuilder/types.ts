import type { FilterField, FilterOperator, FilterValue } from "../Filter/types";

export type Conjunction = "and" | "or";

/**
 * `'mixed'` gives every gap its own control, so one level can read
 * `A and B or C`; `'uniform'` gives the whole group one operator, live on the
 * second row and locked below. Storage is per-gap either way, so a tree
 * authored in one mode is readable in the other.
 */
export type ConditionConjunctionMode = "mixed" | "uniform";

/** Child indices from the root group. `[]` addresses the root itself. */
export type ConditionPath = number[];

/**
 * A condition's value: `Filter`'s own `FilterValue`, widened by the two shapes
 * the shared `Fields` controls emit and it does not cover — a `Rating` number,
 * and the `null` a date holds before anything is picked.
 */
export type ConditionValue = FilterValue | number | null;

/**
 * The leaf shape used by the built-in editor: a `Filter` condition without the
 * resolved Meta. The field is looked up in `fields` by `fieldname` on every
 * render rather than stored, so a tree stays serializable as JSON.
 */
export interface FieldConditionValue {
  fieldname: string;
  operator: FilterOperator;
  value: ConditionValue;
}

/**
 * `conjunctions[i]` joins `conditions[i]` to `conditions[i + 1]`, so it holds
 * exactly `max(0, conditions.length - 1)` entries and every splice keeps it in
 * step; carrying both arrays is what tells a group from a leaf. `and` binds
 * tighter than `or`, as in the Python these compile to — nest to override.
 */
export interface ConditionGroup<TLeaf = FieldConditionValue> {
  conjunctions: Conjunction[];
  conditions: ConditionNode<TLeaf>[];
}

export type ConditionNode<TLeaf = FieldConditionValue> =
  | TLeaf
  | ConditionGroup<TLeaf>;

/**
 * Widths for the built-in leaf's three editable cells, as CSS grid track sizes.
 * One grid governs a whole group, so the cells line up across its rows; `1fr`
 * shares the row's slack rather than sizing a cell to its own content.
 */
export interface ConditionColumns {
  field?: string;
  operator?: string;
  value?: string;
}

/**
 * `'all'` borders the root and every nested group, `'root'` only the outer card
 * so nesting reads from indentation alone, `'none'` draws no card at all.
 */
export type ConditionBorders = "all" | "root" | "none";

export interface ConditionBuilderLabels {
  where: string;
  and: string;
  or: string;

  /** Names the root `<fieldset>` and every nested `role="group"`. */
  matchAll: string;
  matchAny: string;

  /**
   * Name for a group whose gaps are not all the same operator, which `matchAll`
   * and `matchAny` would both misstate. Only reachable in `mixed` mode.
   */
  matchMixed: string;

  /** Describes what the and/or button does. Never rendered as visible text. */
  conjunctionHint: string;

  addCondition: string;
  addGroup: string;
  turnIntoGroup: string;
  ungroup: string;
  remove: string;
  removeGroup: string;
  empty: string;
  openNested: string;
  nestedTitle: string;

  /** Accessible name for a row's overflow menu. Never rendered as text. */
  rowActions: string;

  /** Accessible name for a group's overflow menu. Never rendered as text. */
  groupActions: string;

  /** Names for the three cells of the built-in leaf. Never rendered as text. */
  field: string;
  operator: string;
  value: string;

  /** Shown in the field cell of a condition whose fieldname is not in `fields`. */
  unknownField: string;

  /** Shown when the doctype's fields could not be loaded. */
  fieldsError: string;
  retryFields: string;

  /**
   * Announced after a row or group is removed. A function so the sentence is
   * built in the host's language rather than assembled here from English
   * fragments, and because a cascade lands focus at a depth the user never
   * asked to delete in.
   */
  removed: (remaining: number, groupRemoved: boolean) => string;
}

export interface ConditionBuilderProps<TLeaf = FieldConditionValue> {
  /**
   * The condition tree. Use with v-model. `null` is an empty tree rather than
   * "uncontrolled" — a nullable backend field bound straight to `v-model`
   * arrives as `null`. Only `undefined` means uncontrolled.
   */
  modelValue?: ConditionGroup<TLeaf> | null;

  /**
   * Doctype whose Meta drives the fields offered by the built-in leaf and the
   * operators each one gets. Ignored when `fields` is supplied, and unused
   * when `#condition` replaces the leaf entirely.
   */
  doctype?: string;

  /**
   * Fields offered by the built-in leaf, overriding the ones derived from
   * `doctype`. Ignored when `#condition` is used.
   */
  fields?: FilterField[];

  /** Cell widths for the built-in leaf. Ignored when #condition is used. */
  columns?: ConditionColumns;

  /**
   * Maximum group nesting depth. The root group is depth 0. Once reached,
   * "Add Condition Group" and "Turn into a Group" stop being offered.
   * Defaults to 4 — past that, rows have too little width left to stay usable.
   */
  maxDepth?: number;

  /**
   * Depth past which a group collapses to a button that opens it in a dialog, so
   * deep nesting stops eating row width. A group at exactly this depth is still
   * inline; the first one deeper is not. `Infinity` keeps every level inline.
   */
  modalDepth?: number;

  /** Factory for a new leaf. Defaults to an empty fieldname/operator/value. */
  newCondition?: () => TLeaf;

  /**
   * Blocks adding conditions and groups — including turning a leaf into a group
   * — while existing rows stay editable: removing a row or ungrouping a group
   * adds no node. Intended for while the surrounding form is failing validation.
   */
  disabled?: boolean;

  /**
   * Renders the tree non-interactive: no add buttons, no overflow menus, every
   * control read-only. Read-only, not disabled — the rows keep their tab stops
   * and stay reachable, so the tree can still be read with a screen reader.
   */
  readonly?: boolean;

  /**
   * Overridable UI strings. The defaults already go through the host's `__`, so
   * this is for changing the wording, not for translating it; an override is
   * taken as given and is the app's own to translate.
   */
  labels?: Partial<ConditionBuilderLabels>;

  /** Which groups draw a card. Defaults to 'all'. */
  bordered?: ConditionBorders;

  /**
   * Whether each gap in a group carries its own and/or, or the whole group
   * shares one. Defaults to `'mixed'`.
   */
  conjunctionMode?: ConditionConjunctionMode;
}

export interface ConditionSlotProps<TLeaf = FieldConditionValue> {
  /** The leaf being rendered. */
  condition: TLeaf;

  /** Child indices from the root, addressing this leaf. */
  path: ConditionPath;

  /** Nesting depth of this leaf. */
  depth: number;

  /** True while the builder blocks adding new conditions. */
  disabled: boolean;

  /** True when the builder is read-only; the slot must not mutate the tree. */
  readonly: boolean;

  /** Replace this leaf with a new one. */
  update: (leaf: TLeaf) => void;
}

export interface ValueSlotProps {
  /** The matched field's Meta, or undefined when the fieldname is unknown. */
  field: FilterField | undefined;

  /** The condition's current operator. */
  operator: FilterOperator;

  /** The condition's current value. */
  modelValue: ConditionValue;

  /** True when the builder is read-only; the slot must not mutate the tree. */
  readonly: boolean;

  /** Write a new value back to the condition. */
  update: (value: ConditionValue) => void;
}

/** Props for `#where`, the leading cell of a group's first row. */
export interface WhereSlotProps {
  /** Path of the group this row belongs to. */
  groupPath: ConditionPath;

  /**
   * The operator joining the first two rows, which is the group's only one in
   * `uniform` mode. Undefined in a group with fewer than two children, which
   * has no gap to carry one.
   */
  conjunction: Conjunction | undefined;
}

/** Props for `#conjunction`, the and/or cell on every row after the first. */
export interface ConjunctionSlotProps {
  /** The operator joining this row to the one above it. */
  conjunction: Conjunction;

  /** This row's index within its group. Always 1 or greater. */
  index: number;

  /** Index into the group's `conjunctions`, which is `index - 1`. */
  gap: number;

  /** Path of the group this gap belongs to. */
  groupPath: ConditionPath;

  /** Flip this gap — or, in `uniform` mode, the whole group. */
  toggle: () => void;

  /**
   * Whether this cell's control is live: every row after the first in `mixed`
   * mode, only the second row in `uniform`, where the group has one operator.
   * False while readonly.
   */
  canToggle: boolean;
}

/** Props for `#actions`, the per-row overflow menu. */
export interface ActionsSlotProps {
  /** Path of the row or group these actions apply to. */
  path: ConditionPath;

  /** True when this row is a nested group rather than a leaf. */
  isGroup: boolean;

  /** True while the builder blocks adding new conditions. */
  disabled: boolean;

  /** True when the builder is read-only. */
  readonly: boolean;

  /** False when nesting here would exceed `maxDepth`. */
  canGroup: boolean;

  /** Wrap this leaf in a new group. */
  turnIntoGroup: () => void;

  /** Splice this group's children into its parent. */
  ungroup: () => void;

  /** Delete this row or group. */
  remove: () => void;
}

/** Props for `#add-condition`, a group's add affordance. */
export interface AddConditionSlotProps {
  /** Path of the group to add into. */
  groupPath: ConditionPath;

  /** Append an empty leaf. */
  addCondition: () => void;

  /** Append a new group holding one empty leaf. */
  addGroup: () => void;

  /** False when a new group here would exceed `maxDepth`. */
  canAddGroup: boolean;

  /** True while the builder blocks adding. */
  disabled: boolean;
}

export interface ConditionBuilderSlots<TLeaf = FieldConditionValue> {
  /** Replaces the entire leaf row. */
  condition?: (props: ConditionSlotProps<TLeaf>) => unknown;

  /** Replaces only the value control inside the built-in leaf. */
  value?: (props: ValueSlotProps) => unknown;

  /** Replaces the empty-state content. */
  empty?: () => unknown;

  /** Replaces the "Where" cell. Supply an empty template to remove it. */
  where?: (props: WhereSlotProps) => unknown;

  /** Replaces the and/or cell. Supply an empty template to remove it. */
  conjunction?: (props: ConjunctionSlotProps) => unknown;

  /** Replaces the row's overflow menu. Supply an empty template to remove it. */
  actions?: (props: ActionsSlotProps) => unknown;

  /** Replaces the add affordance. Supply an empty template to remove it. */
  addCondition?: (props: AddConditionSlotProps) => unknown;
}
