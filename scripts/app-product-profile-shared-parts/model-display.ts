import type { ProductProfileLike } from './types.ts';

export const expectedCodexVisibleModels = [
  { id: 'gpt-6-astra', label_zh: '6 Astra', label_en: '6 Astra' },
  { id: 'gpt-6-sol', label_zh: '6 Sol', label_en: '6 Sol' },
  { id: 'gpt-6-luna', label_zh: '6 Luna', label_en: '6 Luna' },
  { id: 'gpt-5.6-sol', label_zh: '5.6 Sol', label_en: '5.6 Sol' },
  { id: 'gpt-5.6-terra', label_zh: '5.6 Terra', label_en: '5.6 Terra' },
  { id: 'gpt-5.6-luna', label_zh: '5.6 Luna', label_en: '5.6 Luna' },
  { id: 'gpt-5.5', label_zh: '5.5', label_en: '5.5' },
];
export const expectedReasoningLabels = {
  low: { zh: '低', en: 'Low' },
  medium: { zh: '中', en: 'Medium' },
  high: { zh: '高', en: 'High' },
  xhigh: { zh: '超高', en: 'Extra high' },
  max: { zh: '最高', en: 'Maximum' },
  ultra: { zh: '极高', en: 'Ultra' },
};

export type GuiLike = NonNullable<ProductProfileLike['gui']>;
export type HomeLike = GuiLike['home'];
export type CodexModelDisplayOptionsLike = NonNullable<NonNullable<HomeLike>['codex_model_display_options']>;
export function assertExactStringArray(actual: unknown, expected: string[], label: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} must be ${JSON.stringify(expected)}`);
  }
}

export function assertCapabilityReferenceListShape(value: unknown, label: string): asserts value is string[] {
  if (
    !Array.isArray(value)
    || !value.every((entry) => typeof entry === 'string' && entry.trim())
    || new Set(value).size !== value.length
  ) {
    throw new Error(`${label} must be a unique string array`);
  }
}
