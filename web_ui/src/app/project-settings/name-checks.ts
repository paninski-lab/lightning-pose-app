/** Groups of names that differ only in letter case, e.g. [['Top', 'top']]. */
export function caseOnlyDuplicates(names: readonly string[]): string[][] {
  const groups = new Map<string, string[]>();
  for (const name of names) {
    const lower = name.toLowerCase();
    const group = groups.get(lower) ?? [];
    if (!group.includes(name)) group.push(name);
    groups.set(lower, group);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}

/** "Top and top", "A, a and a2"-style list of each group. */
export function describeCaseDuplicates(groups: readonly string[][]): string {
  return groups
    .map((g) =>
      g.length === 2
        ? `${g[0]} and ${g[1]}`
        : `${g.slice(0, -1).join(', ')} and ${g.at(-1)}`,
    )
    .join('; ');
}
