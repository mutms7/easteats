export const TASTE_GOAL_IDS = ['hidden-gems', 'date-night', 'service', 'balanced'] as const;
export type TasteGoal = typeof TASTE_GOAL_IDS[number];

export const TASTE_GOAL_OPTIONS: ReadonlyArray<{ value: TasteGoal; label: string; description: string }> = [
  { value: 'hidden-gems', label: 'Hidden gems', description: 'Food first. Fancy is optional.' },
  { value: 'date-night', label: 'Date night', description: 'Good food and a place to linger.' },
  { value: 'service', label: 'Great service', description: 'A friendly welcome and an easy meal.' },
  { value: 'balanced', label: 'A bit of everything', description: 'Food, value, and the whole experience.' },
];

/** Legacy drafts have no goal. Invalid stored values must not invent one. */
export function parseTasteGoal(value: unknown): TasteGoal | undefined {
  return typeof value === 'string' && (TASTE_GOAL_IDS as readonly string[]).includes(value) ? value as TasteGoal : undefined;
}
