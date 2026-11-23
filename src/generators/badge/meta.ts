/**
 * `badge@1` identity and defaults: plain data, no drawing code and no dependencies.
 * Part of the frozen output contract of `badge@1`.
 */
import type { GeneratorMeta } from '../../types.js';

/** The built-in icons (24-unit line drawings), one per common item kind. */
export const BADGE_ICONS = ['film', 'music', 'doc', 'person', 'folder', 'image', 'video', 'book', 'mic', 'game', 'none'] as const;
export type BadgeIcon = (typeof BADGE_ICONS)[number];

export interface BadgeParams {
  /** What kind of item this is; pick it per item type with a rule. */
  icon: BadgeIcon;
  shape: 'square' | 'rounded' | 'circle';
  /** `solid`: white on a saturated tile; `soft`: dark on a light tint. */
  tone: 'solid' | 'soft';
  /** Longest caption shown (characters); longer captions are cut with an ellipsis. */
  maxCaption: number;
  fontFamily: string;
}

export const meta: GeneratorMeta<BadgeParams> = {
  id: 'badge',
  major: 1,
  kind: 'semantic',
  determinism: 'pure',
  // The caption is a fact about the item (a year, an extension): follow it.
  regeneration: 'always',
  defaults: { icon: 'doc', shape: 'rounded', tone: 'solid', maxCaption: 6, fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
  defaultInputs: ['$key', { field: 'caption', as: 'caption' }],
};
