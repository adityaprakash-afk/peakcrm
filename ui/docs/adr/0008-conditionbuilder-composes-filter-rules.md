# ConditionBuilder composes `Filter`'s rules and holds one conjunction per gap

`ConditionBuilder` is the nested and/or condition editor behind rules that are
persisted as Frappe's interleaved condition array — an Assignment Rule's
`assign_condition_json`, an SLA's `condition_json`. Two decisions shape it.

## It composes `Filter`'s rules rather than carrying its own

A fieldtype → operator table, a default-value table and a fieldtype →
value-input dispatch already exist in this package as `Filter/operators.ts` and
`Filter/valueControl.ts`. The leaf is built over those instead of a second copy,
so the two editors cannot drift:

| Own | Reused |
| --- | --- |
| `tree.ts`, `context.ts`, `adapters.ts`, the group / row / conjunction / actions components, `ConditionLeaf.vue` | `Filter/operators.ts`, `Filter/valueControl.ts`, the shared `Fields` registry (ADR-0004) |

Reusing the value dispatch is also what lets a Link condition search its target
doctype, which a self-contained value-input table cannot do.

The row's grid markup — about forty lines — stays duplicated. `Filter.vue` has
no component test, so extracting its template would refactor code people already
use with nothing to catch a regression. The markup is cheap and visible; the
rules that drift are not, and those are shared.

### The operator vocabulary is narrower on write than on read

`Filter` queries Frappe's list API. This component writes an array that the host
application compiles into a Python expression for `safe_eval`, and the two
vocabularies differ at two points, so `conditionOperators` adjusts the shared
table rather than forking it: `is not` is offered because the compiler
implements it, and `timespan` is withheld because the compiler has no rule for
it and would emit an expression that raises every time the rule runs.

Reading is deliberately wider than writing. `fromFrappeConditions` accepts every
operator the stored format can hold, and the leaf keeps a stored operator in its
own dropdown even when the field would not offer it today, so a saved rule is
always legible and is only ever rewritten deliberately. An entry that cannot be
modelled as a fieldname/operator/value leaf at all is preserved verbatim and
round-trips untouched.

### What it does not inherit

`parseFilters` drops a condition whose field is absent from Meta. Here a rule
naming a since-deleted field is kept, shown, and repairable by re-pointing its
field picker — dropping it would silently delete part of a saved rule.

The multi-value controls take `string[]` while `in` / `not in` are persisted as
a comma-separated string, and they drop a string value on the first edit. The
leaf splits it on read, option-aware, so a value whose own label contains a
comma is not split into members that match nothing. A Link's values are not
enumerable client-side, so a docname containing a comma is still split; that
residual is noted at the call site.

## A group holds one conjunction per gap

`ConditionGroup` stores `conjunctions: Conjunction[]`, where `conjunctions[i]`
joins `conditions[i]` to `conditions[i + 1]`. A group of four children holds
three operators, so one level reads `A and B or C and D` without nesting.

This is the shape of the format being edited: the interleaved array carries an
operator per gap. A model with one operator per group cannot hold that, and has
to either reshape a mixed level into synthetic nested groups on read — returning
a record shaped differently from how it was written, with nesting nobody
authored — or discard the operators it cannot represent. Per-gap storage means
`fromFrappeConditions` / `toFrappeConditions` round-trip exactly.

Meaning is unchanged by the choice. The array compiles to a Python expression
where `and` binds tighter than `or`, so `[A, "or", B, "and", C]` is
`A or (B and C)` whether that precedence is spelled out by nesting or left
implicit. Nesting a group is still how a host overrides it.

The cost is an invariant: every operation that adds, removes or splices children
has to keep `conjunctions.length === conditions.length - 1` at every depth.
Getting it wrong re-joins the survivors on an operator nobody picked, silently.
The rule is that a row displays the operator *above* it, so deleting a row
deletes that operator and the row below keeps the one it was already showing.

A group whose operators are mixed is also neither "match all" nor "match any",
so its accessible name needs a third label, `matchMixed`.

`conjunctionMode="uniform"` gives a host the group-wide behaviour instead: one
operator per group, live on the second row only, and a toggle rewrites every
gap. Storage stays per-gap in both modes, so a tree authored in one is readable
in the other. The default is `mixed`; uniform is a compatibility affordance, not
the shape the format deserves.
