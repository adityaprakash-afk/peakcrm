import { getOperators } from "../Filter/operators";
import type { OperatorOption } from "../Filter/operators";
import type { FilterOperator } from "../Filter/types";
import { isGroup } from "./tree";
import type {
  ConditionGroup,
  ConditionNode,
  ConditionValue,
  Conjunction,
  FieldConditionValue,
} from "./types";

type Leaf = FieldConditionValue;
type Node = ConditionNode<Leaf>;

const UNWRITABLE_OPERATORS: FilterOperator[] = ["timespan"];
const IS_NOT: OperatorOption = { label: "Is not", value: "is not" };

/**
 * The operators this component can write. The host's compiler implements
 * `is not`, and has no rule for `timespan` — which would raise when the rule
 * runs. `getOperators` returns a fresh array, so it is safe to reshape.
 */
export function conditionOperators(
  fieldtype: string,
  fieldname?: string
): OperatorOption[] {
  const offered = getOperators(fieldtype, fieldname).filter(
    (option) => !UNWRITABLE_OPERATORS.includes(option.value)
  );
  const is = offered.findIndex((option) => option.value === "is");
  if (is !== -1) offered.splice(is + 1, 0, IS_NOT);
  return offered;
}

/**
 * Operators accepted on the way in, mapped to the vocabulary the tree stores.
 * The host's compiler treats `equals`, `=` and `==` alike, so Python's own
 * tokens read as aliases. An unlisted operator is preserved as a `RawLeaf`.
 */
const READ_OPERATOR: Record<string, FilterOperator> = {
  "==": "equals",
  "=": "equals",
  equals: "equals",
  "!=": "not equals",
  "not equals": "not equals",
  like: "like",
  "not like": "not like",
  in: "in",
  "not in": "not in",
  is: "is",
  "is not": "is not",
  "<": "<",
  ">": ">",
  "<=": "<=",
  ">=": ">=",
  between: "between",
  timespan: "timespan",
};

/**
 * An entry this parser can't model as a fieldname/operator/value leaf — a
 * doctype-qualified filter, or one on an unlisted operator — is preserved under
 * `__raw` so the next save doesn't delete it, and its row renders as text.
 */
export interface RawLeaf extends FieldConditionValue {
  /**
   * The entry exactly as stored. Presence of the key marks the leaf raw, so a
   * preserved `undefined` still round-trips.
   */
  __raw: unknown;
}

export function isRawLeaf(node: Leaf): node is RawLeaf {
  return node !== null && typeof node === "object" && "__raw" in node;
}

/**
 * Convert a tree to the interleaved array that Frappe's Assignment Rule and
 * SLA condition fields persist. One gap, one token, in order — the array is
 * per-gap too, so a mixed level needs no flattening in either direction.
 */
export function toFrappeConditions(tree: ConditionGroup<Leaf>): unknown[] {
  const out: unknown[] = [];
  let written = 0;

  tree.conditions.forEach((node, index) => {
    // A row with no field holds no condition, so dropping it is lossless. A
    // `RawLeaf` carries an empty fieldname too, but its `__raw` is the entry it
    // exists to round-trip.
    if (!isGroup(node) && !isRawLeaf(node) && !node.fieldname) return;

    const encoded = nodeToFrappe(node);

    // The host's compiler destructures a field/operator/value out of every
    // entry, so a group that encodes to nothing is dropped rather than written
    // as `[]`. `removeNode` prunes them, so only a hand-written record gets here.
    if (isGroup(node) && Array.isArray(encoded) && encoded.length === 0) return;

    // `written`, not `index`, so a skipped entry cannot leave the array starting
    // on a conjunction. Each survivor keeps the token that sat above it.
    if (written > 0) out.push(tree.conjunctions[index - 1] ?? "and");
    out.push(encoded);
    written += 1;
  });

  return out;
}

function nodeToFrappe(node: Node): unknown {
  if (isGroup(node)) return toFrappeConditions(node);
  if (isRawLeaf(node)) return node.__raw;
  return [node.fieldname, node.operator, node.value];
}

/**
 * Parse the interleaved array back into a tree. An unrecognised entry is
 * preserved verbatim (see `RawLeaf`). A mixed level stays flat, one token per
 * gap: `safe_eval` binds `and` tighter than `or`, so nesting adds nothing.
 */
export function fromFrappeConditions(
  conditions: unknown
): ConditionGroup<Leaf> {
  if (!Array.isArray(conditions) || conditions.length === 0) {
    return { conjunctions: [], conditions: [] };
  }

  const nodes: Node[] = [];
  const seps: Conjunction[] = [];
  let pendingSep: Conjunction | null = null;

  for (const item of conditions) {
    const sep = asConjunction(item);
    if (sep !== null) {
      pendingSep = sep;
      continue;
    }
    // Never `continue` past an operand: dropping one both deletes it on the
    // next save and re-joins its neighbours on a conjunction nobody wrote.
    if (nodes.length > 0) seps.push(pendingSep ?? "and");
    nodes.push(frappeToNode(item));
    pendingSep = null;
  }

  return { conjunctions: seps, conditions: nodes };
}

/**
 * The separator tokens, case-insensitively. Frappe writes them lowercase, but a
 * record hand-edited or produced by another tool can carry `"OR"` — matched
 * here, since sending it down the operand path would invert the rule.
 */
function asConjunction(item: unknown): Conjunction | null {
  if (typeof item !== "string") return null;
  const token = item.trim().toLowerCase();
  return token === "and" || token === "or" ? token : null;
}

function frappeToNode(item: unknown): Node {
  if (Array.isArray(item)) {
    // A new, still-empty group is persisted as `[]`; read it back as an empty group.
    if (item.length === 0) return { conjunctions: [], conditions: [] };

    // A group's first element is itself an array; a leaf's is a fieldname.
    if (Array.isArray(item[0])) return fromFrappeConditions(item);
  }

  if (Array.isArray(item) && item.length === 3 && typeof item[0] === "string") {
    const token = String(item[1]).toLowerCase();
    // `hasOwn`, not a bare index: a stored operator named `constructor` would
    // otherwise resolve through `Object.prototype` and pass the check below.
    const operator = Object.hasOwn(READ_OPERATOR, token)
      ? READ_OPERATOR[token]
      : undefined;
    if (operator) {
      return {
        fieldname: item[0],
        operator,
        value: item[2] as ConditionValue,
      };
    }
  }

  // Not a shape this parser can model (wrong length, doctype-qualified, an
  // unlisted operator, or not an array). Preserve it verbatim — see `RawLeaf`.
  // `equals` is a placeholder the type demands; nothing reads it on a raw row.
  const preserved: RawLeaf = {
    fieldname: "",
    operator: "equals",
    value: null,
    __raw: item,
  };
  return preserved;
}
