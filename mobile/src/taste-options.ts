// The native bundle is independent of the Next.js source tree. A contract test
// keeps these public options in sync with the shared web definition.
export const GOALS = [
  { value: 'hidden-gems', label: 'Hidden gems', description: 'Food first. Fancy is optional.' },
  { value: 'date-night', label: 'Date night', description: 'Good food and a place to linger.' },
  { value: 'service', label: 'Great service', description: 'A friendly welcome and an easy meal.' },
  { value: 'value', label: 'Great value', description: 'A good meal for what you spend.' },
  { value: 'balanced', label: 'A bit of everything', description: 'Food, value, and the whole experience.' },
] as const;
