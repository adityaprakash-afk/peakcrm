import type {
  ConditionGroup,
  ConditionNode,
  ConditionPath,
  Conjunction,
} from "./types";

/**
 * Groups are told apart from leaves structurally, so the model survives a JSON
 * round-trip with no discriminator field to keep in sync.
 */
export function isGroup<T>(node: ConditionNode<T>): node is ConditionGroup<T> {
  return (
    node !== null &&
    typeof node === "object" &&
    Array.isArray((node as ConditionGroup<T>).conjunctions) &&
    Array.isArray((node as ConditionGroup<T>).conditions)
  );
}

export function emptyTree<T>(): ConditionGroup<T> {
  return { conjunctions: [], conditions: [] };
}

/**
 * The conjunction a newly appended child joins on: the group's last one, so a
 * run of `and`s keeps extending and the toggle is only for breaking it. The
 * first gap is `and`, matching Frappe's own default.
 */
function nextConjunction<T>(group: ConditionGroup<T>): Conjunction {
  return group.conjunctions[group.conjunctions.length - 1] ?? "and";
}

/**
 * Every gap but the first needs an operator. Called after the push, so
 * `conditions` already counts the new child.
 */
function pushConjunction<T>(group: ConditionGroup<T>): void {
  if (group.conditions.length > 1) group.conjunctions.push(nextConjunction(group));
}

/**
 * Drop the gap the child at `index` displayed — the one above it, or below it
 * for the first child, which shows no operator of its own. Every surviving row
 * keeps the word it was already showing.
 */
function removeConjunctionAt<T>(group: ConditionGroup<T>, index: number): void {
  if (group.conjunctions.length === 0) return;
  group.conjunctions.splice(index === 0 ? 0 : index - 1, 1);
}

/**
 * A detached, proxy-free copy every operation starts from. `structuredClone`
 * keeps non-JSON values in a consumer's leaf (a `Date`, a `Map`) intact; a JSON
 * round-trip is the fallback for the shapes it refuses.
 */
function clone<T>(tree: ConditionGroup<T>): ConditionGroup<T> {
  try {
    return structuredClone(tree);
  } catch {
    return JSON.parse(JSON.stringify(tree));
  }
}

export function getNode<T>(
  tree: ConditionGroup<T>,
  path: ConditionPath
): ConditionNode<T> | undefined {
  let node: ConditionNode<T> = tree;
  for (const index of path) {
    if (!isGroup(node)) return undefined;
    node = node.conditions[index];
    if (node === undefined) return undefined;
  }
  return node;
}

function parentOf<T>(
  tree: ConditionGroup<T>,
  path: ConditionPath
): ConditionGroup<T> | undefined {
  const node = getNode(tree, path.slice(0, -1));
  return node !== undefined && isGroup(node) ? node : undefined;
}

export function addCondition<T>(
  tree: ConditionGroup<T>,
  groupPath: ConditionPath,
  leaf: T
): ConditionGroup<T> {
  const next = clone(tree);
  const group = getNode(next, groupPath);
  if (group === undefined || !isGroup(group)) return next;
  group.conditions.push(leaf);
  pushConjunction(group);
  return next;
}

export function addGroup<T>(
  tree: ConditionGroup<T>,
  groupPath: ConditionPath,
  leaf: T
): ConditionGroup<T> {
  const next = clone(tree);
  const group = getNode(next, groupPath);
  if (group === undefined || !isGroup(group)) return next;
  group.conditions.push({ conjunctions: [], conditions: [leaf] });
  pushConjunction(group);
  return next;
}

export function removeNode<T>(
  tree: ConditionGroup<T>,
  path: ConditionPath
): ConditionGroup<T> {
  if (path.length === 0) return emptyTree<T>();

  const next = clone(tree);
  const parent = parentOf(next, path);
  if (!parent) return next;

  const index = path[path.length - 1];
  parent.conditions.splice(index, 1);
  removeConjunctionAt(parent, index);

  // A group that just lost its last child goes with it.
  if (parent.conditions.length === 0 && path.length > 1) {
    return removeNode(next, path.slice(0, -1));
  }
  return next;
}

export function updateLeaf<T>(
  tree: ConditionGroup<T>,
  path: ConditionPath,
  leaf: T
): ConditionGroup<T> {
  const next = clone(tree);
  const parent = parentOf(next, path);
  if (!parent) return next;
  parent.conditions[path[path.length - 1]] = leaf;
  return next;
}

export function turnIntoGroup<T>(
  tree: ConditionGroup<T>,
  path: ConditionPath
): ConditionGroup<T> {
  const next = clone(tree);
  const parent = parentOf(next, path);
  if (!parent) return next;

  const index = path[path.length - 1];
  const node = parent.conditions[index];
  if (node === undefined || isGroup(node)) return next;

  parent.conditions[index] = { conjunctions: [], conditions: [node] };
  return next;
}

export function ungroup<T>(
  tree: ConditionGroup<T>,
  path: ConditionPath
): ConditionGroup<T> {
  const next = clone(tree);
  if (path.length === 0) return next;

  const parent = parentOf(next, path);
  if (!parent) return next;

  const index = path[path.length - 1];
  const group = parent.conditions[index];
  if (group === undefined || !isGroup(group)) return next;

  // An empty group leaves nothing behind, so this is a removal, gap and all.
  if (group.conditions.length === 0) {
    parent.conditions.splice(index, 1);
    removeConjunctionAt(parent, index);
    return next;
  }

  parent.conditions.splice(index, 1, ...group.conditions);
  // Only the group's inner gaps insert: the gaps that joined it to its siblings
  // now join the outermost of those children, which is where they already sit.
  parent.conjunctions.splice(index, 0, ...group.conjunctions);
  return next;
}

/**
 * Flip one gap. `index` addresses `conjunctions` — the row's index minus one,
 * the gap above the row whose cell was clicked.
 */
export function toggleConjunction<T>(
  tree: ConditionGroup<T>,
  groupPath: ConditionPath,
  index: number
): ConditionGroup<T> {
  const next = clone(tree);
  const group = getNode(next, groupPath);
  if (group === undefined || !isGroup(group)) return next;
  const current = group.conjunctions[index];
  if (current === undefined) return next;
  group.conjunctions[index] = current === "and" ? "or" : "and";
  return next;
}

/**
 * Set every gap in a group at once — the `uniform` conjunction mode, where a
 * group carries a single operator and a toggle rewrites the whole run.
 */
export function setGroupConjunction<T>(
  tree: ConditionGroup<T>,
  groupPath: ConditionPath,
  value: Conjunction
): ConditionGroup<T> {
  const next = clone(tree);
  const group = getNode(next, groupPath);
  if (group === undefined || !isGroup(group)) return next;
  group.conjunctions = group.conjunctions.map(() => value);
  return next;
}

/** The root group is depth 0, so a group at `path` sits at `path.length`. */
export function canNest(groupPath: ConditionPath, maxDepth: number): boolean {
  return groupPath.length < maxDepth;
}
