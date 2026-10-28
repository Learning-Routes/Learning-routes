import { z } from "zod";

export const LOCALES = ["es", "en", "pt", "fr", "it"] as const;
export const Locale = z.enum(LOCALES);
export type Locale = z.infer<typeof Locale>;

// Every string a student reads, per locale. A plain string is accepted only at the
// v1 import boundary (v1.ts), which turns it into { [sourceLocale]: text }.
export const LocalizedText = z
  .strictObject({
    es: z.string().optional(),
    en: z.string().optional(),
    pt: z.string().optional(),
    fr: z.string().optional(),
    it: z.string().optional(),
  })
  .refine((map) => Object.keys(map).length > 0, "a localized text needs at least one locale");
export type LocalizedText = z.infer<typeof LocalizedText>;

export const Id = z.string().min(1);
export const Timestamp = z.iso.datetime();
