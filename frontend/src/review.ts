import type { Draft } from "./api";
export function unresolved(draft: Draft) {
  return [
    ...(draft.questions || []),
    ...(draft.steps || []).flatMap((s) => s.questions || []),
  ].filter((q) => q.required && !q.answer?.trim());
}
export function reorder<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const next = [...items];
  const target = index + direction;
  if (target < 0 || target >= items.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
