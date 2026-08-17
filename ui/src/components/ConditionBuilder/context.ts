import { computed, customRef, inject } from "vue";
import type { ComputedRef, InjectionKey, Ref } from "vue";
import type { FilterField } from "../Filter/types";
import type {
  ConditionBorders,
  ConditionBuilderLabels,
  ConditionColumns,
  ConditionConjunctionMode,
  ConditionPath,
} from "./types";

/**
 * Shared by every node in the recursive tree. Mutations are reported by path so
 * `ConditionGroup` never relays events up through its own recursion.
 */
export interface ConditionBuilderContext {
  /**
   * Identifies this builder's rows in the document. Focus moves by querying for
   * a path, and the nested-group dialog teleports its rows out of this subtree,
   * so the query cannot be scoped by containment.
   */
  builderId: ComputedRef<string>;

  fields: ComputedRef<FilterField[]>;

  /**
   * While the doctype's Meta is in flight a fieldname missing from `fields`
   * means "not loaded" rather than "not a field any more", and the two get
   * opposite treatments in the leaf.
   */
  fieldsLoading: ComputedRef<boolean>;

  /**
   * The Meta request's error, if it failed. A failed request leaves the field
   * list unknowable, which is not the same as the doctype having no fields, and
   * the leaf has to tell those apart.
   */
  fieldsError: ComputedRef<unknown>;

  /** Re-run the Meta request. */
  reloadFields: () => void;

  columns: ComputedRef<Required<ConditionColumns>>;
  labels: Ref<ConditionBuilderLabels>;
  bordered: ComputedRef<ConditionBorders>;
  maxDepth: ComputedRef<number>;
  modalDepth: ComputedRef<number>;
  disabled: ComputedRef<boolean>;
  readonly: ComputedRef<boolean>;
  conjunctionMode: ComputedRef<ConditionConjunctionMode>;

  addCondition: (groupPath: ConditionPath) => void;
  addGroup: (groupPath: ConditionPath) => void;
  remove: (path: ConditionPath) => void;
  update: (path: ConditionPath, leaf: unknown) => void;
  turnIntoGroup: (path: ConditionPath) => void;
  ungroup: (path: ConditionPath) => void;
  /** Flip one gap. `gap` indexes `conjunctions`, i.e. the row index minus one. */
  toggleConjunction: (groupPath: ConditionPath, gap: number) => void;

  /** Put a message in the builder's live region. */
  announce: (message: string) => void;

  /**
   * Path of the last edit that took a node out of its parent, sequenced so two
   * removals at one path stay two events. Rows are keyed by index, so a removal
   * re-points the instances that rendered the later siblings; a group closes an
   * open nested dialog when one lands at or above its own path.
   */
  lastRemoval: ComputedRef<{ path: ConditionPath; seq: number } | null>;
}

export const conditionBuilderKey: InjectionKey<ConditionBuilderContext> =
  Symbol("conditionBuilder");

/**
 * Grid tracks for the leaf's three editable cells, sized once per group so the
 * cells line up row to row. `minmax(0, …fr)` rather than a bare `fr`: a bare
 * `fr` floors at min-content, so one long label pushes its row out of step.
 */
export const DEFAULT_COLUMNS: Required<ConditionColumns> = {
  // The operator track sizes to its own labels, with a floor so an empty row
  // still shows a usable control; field and value split the remaining slack.
  field: "minmax(0, 1fr)",
  operator: "minmax(100px, max-content)",
  value: "minmax(0, 1fr)",
};

/** Deepest nesting level offered. The root group is depth 0. */
export const DEFAULT_MAX_DEPTH = 4;

/** One period of the dialog escape: this many levels inline, then a dialog. */
export const DEFAULT_MODAL_DEPTH = 2;

export const DEFAULT_BORDERS: ConditionBorders = "all";

/** Per-gap operators. `uniform` — one operator per group — is opt-in. */
export const DEFAULT_CONJUNCTION_MODE: ConditionConjunctionMode = "mixed";

/**
 * The host's translation function, read off the global at call time: this
 * package has no i18n of its own, and a host that installs none still renders.
 * Anything carrying a value uses a `{0}` placeholder — a sentence glued from
 * separately translated halves only reads correctly in English.
 */
function t(message: string, replace?: unknown[]): string {
  const translate = (
    globalThis as { __?: (m: string, r?: unknown[]) => string }
  ).__;
  if (typeof translate === "function") return translate(message, replace);
  if (!replace) return message;
  // The fallback substitutes too: a literal `{0}` would otherwise be read out to
  // a screen reader on any host without a translation plugin.
  return message.replace(/\{(\d+)\}/g, (match, index) => {
    const value = replace[Number(index)];
    return value === undefined ? match : String(value);
  });
}

/**
 * The built-in UI strings, translated through the host's `__`. A function and
 * not a const: a module-level object is built while the import graph resolves,
 * before the host installs its translations, which would freeze every label as
 * English for the life of the page.
 */
export function defaultLabels(): ConditionBuilderLabels {
  return {
    where: t("Where"),
    and: t("and"),
    or: t("or"),
    matchAll: t("Match all of the following"),
    matchAny: t("Match any of the following"),
    matchMixed: t("Match a combination of the following"),
    conjunctionHint: t("Changes how every condition in this group is combined"),
    addCondition: t("Add Condition"),
    addGroup: t("Add Condition Group"),
    turnIntoGroup: t("Turn into a Group"),
    ungroup: t("Ungroup Conditions"),
    remove: t("Remove"),
    removeGroup: t("Remove Group"),
    empty: t("Add a Condition"),
    openNested: t("Open Nested Conditions"),
    nestedTitle: t("Nested Conditions"),
    rowActions: t("Condition actions"),
    groupActions: t("Group actions"),
    field: t("Field"),
    operator: t("Operator"),
    value: t("Value"),
    unknownField: t("Unknown field"),
    fieldsError: t("Could not load this doctype's fields."),
    retryFields: t("Retry"),
    removed: (remaining, groupRemoved) =>
      [
        t("Condition removed."),
        groupRemoved ? t("Its group was left empty and was removed too.") : "",
        t("{0} remaining.", [remaining]),
      ]
        .filter(Boolean)
        .join(" "),
  };
}

/**
 * Labels that re-read on every access and invalidate their readers once the
 * host's messages land. A `computed` caches, freezing whatever it read first;
 * a bare `{ get value() }` object is not a ref, so a template never unwraps it.
 */
export function uncachedLabels(
  read: () => ConditionBuilderLabels
): Ref<ConditionBuilderLabels> {
  let probe = t("Where");
  return customRef((track, trigger) => ({
    get() {
      track();
      const current = t("Where");
      if (current !== probe) {
        probe = current;
        queueMicrotask(trigger);
      }
      return read();
    },
    set() {},
  }));
}

/**
 * Overlay a consumer's partial labels onto the defaults, key by key. Not a
 * spread: an object literal built from a host's optional strings carries the
 * missing ones as explicit `undefined` keys, which a spread copies over the
 * defaults and leaves the UI with an empty string where a label should be.
 */
export function mergeLabels(
  overrides?: Partial<ConditionBuilderLabels>
): ConditionBuilderLabels {
  const merged: ConditionBuilderLabels = defaultLabels();
  if (!overrides) return merged;
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined || !(key in merged)) continue;
    (merged as Record<string, unknown>)[key] = value;
  }
  return merged;
}

/** The same key-by-key overlay for the column widths. */
export function mergeColumns(
  overrides?: ConditionColumns
): Required<ConditionColumns> {
  const merged: Required<ConditionColumns> = { ...DEFAULT_COLUMNS };
  if (!overrides) return merged;
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined || !(key in DEFAULT_COLUMNS)) continue;
    (merged as Record<string, string>)[key] = value;
  }
  return merged;
}

/**
 * A complete, inert context for a node mounted with no builder above it, so call
 * sites can write `context.readonly.value` with no optional chaining. Its
 * mutators are no-ops: there is no tree to change, and silently doing nothing
 * beats throwing inside a render.
 */
const FALLBACK_CONTEXT: ConditionBuilderContext = {
  builderId: computed(() => ""),
  fields: computed(() => []),
  fieldsLoading: computed(() => false),
  fieldsError: computed(() => null),
  reloadFields: () => {},
  columns: computed(() => DEFAULT_COLUMNS),
  labels: uncachedLabels(defaultLabels),
  bordered: computed<ConditionBorders>(() => DEFAULT_BORDERS),
  maxDepth: computed(() => DEFAULT_MAX_DEPTH),
  modalDepth: computed(() => DEFAULT_MODAL_DEPTH),
  disabled: computed(() => false),
  readonly: computed(() => false),
  conjunctionMode: computed<ConditionConjunctionMode>(() => DEFAULT_CONJUNCTION_MODE),

  addCondition: () => {},
  addGroup: () => {},
  remove: () => {},
  update: () => {},
  turnIntoGroup: () => {},
  ungroup: () => {},
  toggleConjunction: () => {},
  announce: () => {},
  lastRemoval: computed(() => null),
};

/** Read the shared context, falling back to the inert one. */
export function useConditionBuilderContext(): ConditionBuilderContext {
  return inject(conditionBuilderKey, FALLBACK_CONTEXT);
}
