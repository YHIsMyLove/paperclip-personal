import { useCallback, useSyncExternalStore } from "react";
import i18n, { type InitOptions, type TOptions } from "i18next";
import { initReactI18next, useTranslation as useReactI18nextTranslation } from "react-i18next";

import { DEFAULT_LOCALE, i18nextResources, supportedLocales } from "./locales";
import {
  getLocaleDescriptor,
  getTextDirection,
  LOCALE_CATALOG,
  PRIMARY_LOCALES,
  type LocaleDescriptor,
} from "./locale-catalog";

export const LANGUAGE_STORAGE_KEY = "paperclip.locale";

const supported = supportedLocales as readonly string[];

function isSupportedLocale(value: unknown): value is (typeof supportedLocales)[number] {
  return typeof value === "string" && supported.includes(value);
}

/**
 * Resolve an arbitrary BCP 47 tag onto a shipped catalog: exact match first,
 * then the first base-language match in catalog order. That ordering makes
 * `zh` land on `zh-CN` and `pt` on `pt-BR` without hard-coding a second table.
 */
export function matchSupportedLocale(tag: string | null | undefined): string | null {
  if (!tag) return null;
  // Some environments hand back `zh_TW` where the catalog ships `zh-TW`.
  const normalized = tag.trim().replace(/_/g, "-");
  if (!normalized) return null;
  const lowered = normalized.toLowerCase();
  const exact = supported.find((locale) => locale.toLowerCase() === lowered);
  if (exact) return exact;
  const base = lowered.split("-")[0];
  if (!base) return null;
  const byBase = supported.find((locale) => locale.toLowerCase().split("-")[0] === base);
  return byBase ?? null;
}

function readStoredLocale(): string | null {
  try {
    return matchSupportedLocale(globalThis.localStorage?.getItem(LANGUAGE_STORAGE_KEY));
  } catch {
    // Private-mode Safari and sandboxed iframes throw on localStorage access.
    return null;
  }
}

function detectBrowserLocale(): string | null {
  const nav = globalThis.navigator;
  const candidates = Array.isArray(nav?.languages) && nav.languages.length > 0
    ? nav.languages
    : nav?.language
      ? [nav.language]
      : [];
  for (const candidate of candidates) {
    const matched = matchSupportedLocale(candidate);
    if (matched) return matched;
  }
  return null;
}

/** Stored choice wins, then the browser's preference, then English. */
export function resolveInitialLocale(): string {
  return readStoredLocale() ?? detectBrowserLocale() ?? DEFAULT_LOCALE;
}

function applyDocumentLocale(code: string): void {
  const root = globalThis.document?.documentElement;
  if (!root) return;
  const descriptor = getLocaleDescriptor(code);
  root.lang = descriptor.code;
  root.dir = descriptor.direction;
}

const initialLocale = resolveInitialLocale();

const i18nextOptions: InitOptions = {
  resources: i18nextResources,
  lng: initialLocale,
  fallbackLng: DEFAULT_LOCALE,
  supportedLngs: supportedLocales,
  defaultNS: "translation",
  interpolation: { escapeValue: false },
  returnObjects: false,
  initAsync: false,
};

void i18n.use(initReactI18next).init(i18nextOptions).catch((error: unknown) => {
  console.error("Failed to initialize i18next", error);
});

applyDocumentLocale(initialLocale);

// Subscribe once, at module load, so a `changeLanguage` from anywhere keeps
// `<html lang>` and `<html dir>` in step with the rendered strings.
i18n.on("languageChanged", applyDocumentLocale);

export function t(key: string, options: TOptions = {}) {
  return i18n.t(key, options);
}

export function getCurrentLocale() {
  return i18n.language || DEFAULT_LOCALE;
}

export function persistLocale(code: string): boolean {
  try {
    globalThis.localStorage?.setItem(LANGUAGE_STORAGE_KEY, code);
    return true;
  } catch {
    return false;
  }
}

/**
 * Switch the UI language. Returns false when the tag has no shipped catalog —
 * callers should surface that rather than silently leaving the UI in English.
 */
export async function setLocale(code: string): Promise<boolean> {
  const matched = matchSupportedLocale(code);
  if (!matched) return false;
  await i18n.changeLanguage(matched);
  persistLocale(matched);
  applyDocumentLocale(matched);
  return true;
}

export const useTranslation = useReactI18nextTranslation;

function subscribeToLocale(onStoreChange: () => void) {
  i18n.on("languageChanged", onStoreChange);
  return () => {
    i18n.off("languageChanged", onStoreChange);
  };
}

/**
 * Locale state for the switcher. Reads through `useSyncExternalStore` off the
 * i18next emitter so a change re-renders every consumer without a context
 * provider threaded through the app shell.
 */
export function useLocale() {
  const locale = useSyncExternalStore(subscribeToLocale, getCurrentLocale, getCurrentLocale);
  const setLocaleAndPersist = useCallback(
    async (next: string) => {
      await setLocale(next);
    },
    [],
  );
  return {
    locale,
    setLocale: setLocaleAndPersist,
    descriptor: getLocaleDescriptor(locale),
    options: LOCALE_CATALOG,
    primary: PRIMARY_LOCALES,
  } as const;
}

export type { LocaleDescriptor };
export { i18n };