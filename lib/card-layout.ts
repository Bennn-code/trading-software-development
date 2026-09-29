import { z } from 'zod';

export const cardLayoutPages = ['favorites', 'overview', 'status'] as const;
export type CardLayoutPage = typeof cardLayoutPages[number];

export const cardLayoutItemSchema = z.object({
  order: z.number().int().min(0).max(300),
  columns: z.number().int().min(1).max(12),
  height: z.number().int().min(120).max(1600),
}).strict();

const cardLayoutPageSchema = z.object({
  enabled: z.literal(true),
  items: z.record(z.string().min(1).max(120), cardLayoutItemSchema).refine(items => Object.keys(items).length <= 75),
}).strict();

export const cardLayoutPreferencesSchema = z.object({
  favorites: cardLayoutPageSchema.optional(),
  overview: cardLayoutPageSchema.optional(),
  status: cardLayoutPageSchema.optional(),
}).strict();

export type CardLayoutItem = z.infer<typeof cardLayoutItemSchema>;
export type CardLayoutPageConfig = { enabled: true; items: Record<string, CardLayoutItem> };
export type CardLayoutPreferences = Partial<Record<CardLayoutPage, CardLayoutPageConfig>>;

export function parseCardLayoutPreferences(value: unknown): CardLayoutPreferences {
  const result = cardLayoutPreferencesSchema.safeParse(value);
  return result.success ? result.data : {};
}
