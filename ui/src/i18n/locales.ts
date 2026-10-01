import type { Resource } from "i18next";

import { assertValidLocaleMessages, collectLeafPaths, collectUntranslatedKeys } from "./locale-validation";

export const DEFAULT_LOCALE = "en" as const;

const localeModules = import.meta.glob("./locales/*.json", {
  eager: true,
  import: "default",
}) as Record<string, unknown>;

export const localeMessages = Object.fromEntries(
  Object.entries(localeModules).map(([path, messages]) => {
    const locale = path.match(/\/([A-Za-z0-9_-]+)\.json$/)?.[1];
    if (!locale) {
      throw new Error(`Invalid locale file path: ${path}`);
    }
    return [locale, messages];
  }),
);

if (!(DEFAULT_LOCALE in localeMessages)) {
  throw new Error(`Missing default locale messages for ${DEFAULT_LOCALE}`);
}

// English is the reference catalog and must be complete. Every other locale
// may lag behind and fall back to English per key — that is what lets a
// translation land incrementally instead of all-or-nothing.
assertValidLocaleMessages(localeMessages[DEFAULT_LOCALE], localeMessages[DEFAULT_LOCALE], "complete");

export const untranslatedKeysByLocale: Readonly<Record<string, readonly string[]>> = Object.freeze(
  Object.fromEntries(
    Object.entries(localeMessages).map(([locale, messages]) => [
      locale,
      locale === DEFAULT_LOCALE ? [] : collectUntranslatedKeys(messages, localeMessages[DEFAULT_LOCALE]),
    ]),
  ),
);

for (const [locale, messages] of Object.entries(localeMessages)) {
  try {
    assertValidLocaleMessages(messages, localeMessages[DEFAULT_LOCALE], "partial");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid ${locale} locale messages: ${message}`);
  }
}

export const supportedLocales = Object.keys(localeMessages);

export const i18nextResources: Resource = Object.fromEntries(
  Object.entries(localeMessages).map(([locale, messages]) => [locale, { translation: messages }]),
) as Resource;

/** Total translated leaves in the English catalog — the denominator below. */
export const englishLeafCount = collectLeafPaths(localeMessages[DEFAULT_LOCALE]).length;

/** Translated leaves / total English leaves, as a 0..1 fraction. */
export function localeCompleteness(locale: string): number {
  if (locale === DEFAULT_LOCALE) return 1;
  const translated = collectLeafPaths(localeMessages[locale]).length;
  return englishLeafCount === 0 ? 1 : Math.min(1, translated / englishLeafCount);
}

/**
 * A BCP 47 tag with a shipped catalog. The set is discovered from the glob
 * above rather than hand-listed, so it cannot be narrowed statically;
 * `locale-catalog.test.ts` asserts the hand-written catalog covers it exactly.
 */
export type SupportedLocale = string;