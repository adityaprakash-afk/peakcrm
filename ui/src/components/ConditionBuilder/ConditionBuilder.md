# ConditionBuilder

A nested tree of conditions joined by AND / OR — the control behind an
Assignment Rule's conditions, an SLA's, or any rule that needs `A and (B or C)`.
Grouping, conjunction toggling and add/remove belong to the component; the row is
a slot, so it fits doctype field conditions and domain-specific rules alike.

`Filter` is the flat, AND-only version of the same idea. Both read their
operator tables and value controls from the same modules, so they cannot drift.
See [ADR-0008](../../../docs/adr/0008-conditionbuilder-composes-filter-rules.md).

```ts
import { ConditionBuilder } from "@framework/ui/ConditionBuilder";
import type { ConditionGroup, FilterField } from "@framework/ui/ConditionBuilder";
```

An app that aliases the package to its source directory rather than resolving
`exports` imports `@framework/ui/components/ConditionBuilder`.

## Fields

Either give it a `doctype` and let it derive fields from Meta, as `Filter` does:

```vue
<ConditionBuilder v-model="conditions" doctype="ToDo" />
```

…or supply them yourself, in the same `FilterField` shape (`options` is Frappe's
newline-joined string):

```vue
<ConditionBuilder v-model="conditions" :fields="fields" />
```

`doctype` is read once at setup, so a host that switches doctype should remount
with `:key`. When the Meta request fails the component says so and offers a
retry, rather than presenting every row as though its field had been deleted.

## The model

```ts
{
  // one operator per gap: conjunctions[i] joins conditions[i] to conditions[i + 1]
  conjunctions: ["and", "or"],
  conditions: [
    { fieldname: "status", operator: "equals", value: "Open" },
    { fieldname: "subject", operator: "like", value: "refund" },
    {
      conjunctions: [],
      conditions: [{ fieldname: "priority", operator: "equals", value: "High" }],
    },
  ],
}
```

A group is anything with a `conjunctions` and a `conditions` array; everything
else is a leaf. The distinction is structural on purpose, so the tree survives a
JSON round-trip with no discriminator to keep in sync.

`conjunctions` always holds `conditions.length - 1` entries. A mixed level means
what Python means, since the array it compiles to is evaluated by `safe_eval`:
`and` binds tighter than `or`. Nest a group to override that.

`null` means an empty tree, not "uncontrolled" — a nullable backend field bound
straight to `v-model` arrives as `null`. Only leaving `modelValue` off entirely
makes it uncontrolled, in which case it keeps the tree itself.

### `conjunctionMode`

`"mixed"` (the default) gives every gap between two rows its own and/or, so one
level reads `A and B or C`. `"uniform"` gives the group a single operator: the
control is live on the second row only and locked on every row below it, and
changing it rewrites every gap in that group.

Storage is per-gap in both modes, so a tree authored in one is readable in the
other. A mixed tree opened in `uniform` keeps its operators until the first
toggle flattens them.

## Operators

Reading is wider than writing: the reader accepts every operator the stored
format can hold, and a leaf keeps a stored operator in its own dropdown even
when the field's own operator list would not offer it today — a saved rule is
always legible, and is only rewritten deliberately.

Writing is narrower than `Filter`'s list. `is not` is offered because the host's
compiler implements it; `timespan` is withheld because the host's compiler has
no rule for it and would emit an expression that raises whenever the rule runs.

## Persisting

Frappe's Assignment Rule and SLA condition fields store an array that interleaves
conjunctions between conditions. Convert at the persistence boundary:

```ts
import {
  fromFrappeConditions,
  toFrappeConditions,
} from "@framework/ui/ConditionBuilder";

const tree = fromFrappeConditions(JSON.parse(doc.assign_condition_json || "[]"));
doc.assign_condition_json = JSON.stringify(toFrappeConditions(tree));
```

A level that mixes `and` and `or` stays flat and stays mixed, one token per gap.
An entry that cannot be parsed — an unknown operator, a doctype-qualified filter,
a stray `null`, number or token between two filters — is preserved verbatim and
rendered non-editable, so such a record round-trips byte-identical instead of
being deleted by the next save. Separator tokens are matched case-insensitively
for the same reason.

Two things are dropped rather than written: an empty group, and a row the user
added but never gave a field to. Both are lossless — neither holds a condition —
and both would otherwise be written as an entry the host's compiler cannot
destructure into a field, an operator and a value.

A stored `==`, `=` or `!=` is read as an alias and re-saved in this component's
vocabulary. No migration is needed: the host's compiler maps `equals`, `=` and
`==` onto the same `==`, so the compiled expression does not change.

## Slots

| Slot | Replaces |
| --- | --- |
| `#condition` | the whole row, for a leaf of your own shape |
| `#value` | only the value control inside the built-in row |
| `#where` / `#conjunction` | the leading cell of a row |
| `#actions` | the row's overflow menu |
| `#addCondition` | a group's add affordance |
| `#empty` | the empty state's content |

Supplying an empty template removes that furniture entirely.

## Props worth knowing

| Prop | Does |
| --- | --- |
| `conjunctionMode` | `mixed` / `uniform` — an operator per gap, or per group |
| `columns` | the three cells' grid track sizes |
| `maxDepth` | how deep nesting is offered (default 4) |
| `modalDepth` | where nesting escapes into a dialog (default 2) |
| `bordered` | `all` / `root` / `none` — which groups draw a card |
| `newCondition` | factory for a new leaf, when `#condition` is used |
| `labels` | every string it renders, for `__()` |
| `disabled` | blocks *adding*; existing rows stay editable |
| `readonly` | nothing is editable; the tree renders as text |

`disabled` is for a form failing validation: no new conditions, but the ones
there can still be fixed or removed. `readonly` shows a rule you are not editing.

## Accessibility

- A group is a `<fieldset>` at the root and `role="group"` nested, named from its
  own conjunction — nested `<legend>`s are read before every control, and a
  fixed name would state the opposite the moment the conjunction is toggled.
- Rows are a real list, so position is announced without a name to keep in sync.
- Every control is named by `aria-labelledby` against the row's field, so eight
  operator selects are told apart ("Status, operator"). Attribute fallthrough is
  not used: `Button` overwrites `aria-label` from `label`, and `Combobox` never
  passes attrs to its trigger.
- Removing a row moves focus to the row that took its place, and announces the
  count — plus the cascade, when the group went with it.
- `readonly` renders text rather than disabled controls: a disabled control is
  skipped in a screen reader's forms mode and is exempt from the contrast
  minimum, which would make a read-only tree unreadable.

Known gap: the date and rating value controls drop attributes, so their cell
carries the name instead of the control. Fixing that needs an `aria-labelledby`
passthrough on the shared `Fields` components and frappe-ui's `DateRangePicker`.
