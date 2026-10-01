import { describe, expect, it } from "vitest";

import { LANGUAGE_STORAGE_KEY, matchSupportedLocale, resolveInitialLocale } from ".";
import { DEFAULT_LOCALE, supportedLocales } from "./locales";
import {
  getLocaleDescriptor,
  getTextDirection,
  LOCALE_CATALOG,
  LOCALE_CATALOG_BY_CODE,
  PRIMARY_LOCALES,
} from "./locale-catalog";

describe("matchSupportedLocale", () => {
  it("matches an exact supported tag regardless of case", () => {
    expect(matchSupportedLocale("zh-CN")).toBe("zh-CN");
    expect(matchSupportedLocale("zh-cn")).toBe("zh-CN");
    expect(matchSupportedLocale("ZH_tw")).toBe("zh-TW");
  });

  it("falls back to the first base-language match in catalog order", () => {
    // `zh` must resolve to Simplified, `pt` to Brazilian: both are the first
    // entry for their base language in the shipped catalogs.
    expect(matchSupportedLocale("zh")).toBe("zh-CN");
    expect(matchSupportedLocale("pt")).toBe("pt-BR");
    expect(matchSupportedLocale("en-US")).toBe("en");
    expect(matchSupportedLocale("de-AT")).toBe("de");
  });

  it("returns null for tags with no shipped catalog", () => {
    expect(matchSupportedLocale("xx")).toBeNull();
    expect(matchSupportedLocale("")).toBeNull();
    expect(matchSupportedLocale("   ")).toBeNull();
    expect(matchSupportedLocale(null)).toBeNull();
    expect(matchSupportedLocale(undefined)).toBeNull();
  });
});

describe("resolveInitialLocale", () => {
  it("always resolves to a shipped locale", () => {
    expect(supportedLocales).toContain(resolveInitialLocale());
  });

  it("prefers a stored choice over the browser preference", () => {
    // `resolveInitialLocale` reads localStorage first, so seeding it decides.
    globalThis.localStorage.setItem(LANGUAGE_STORAGE_KEY, "ja");
    try {
      expect(resolveInitialLocale()).toBe("ja");
    } finally {
      globalThis.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
    }
  });

  it("ignores a stored choice with no shipped catalog", () => {
    globalThis.localStorage.setItem(LANGUAGE_STORAGE_KEY, "xx");
    try {
      expect(resolveInitialLocale()).not.toBe("xx");
      expect(supportedLocales).toContain(resolveInitialLocale());
    } finally {
      globalThis.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
    }
  });
});

describe("locale catalog", () => {
  it("covers every shipped locale file exactly once", () => {
    expect([...LOCALE_CATALOG_BY_CODE.keys()].sort()).toEqual([...supportedLocales].sort());
  });

  it("exposes a direction for every locale", () => {
    for (const descriptor of LOCALE_CATALOG) {
      expect(["ltr", "rtl"]).toContain(descriptor.direction);
      expect(getTextDirection(descriptor.code)).toBe(descriptor.direction);
    }
  });

  it("marks only the right-to-left locales as rtl", () => {
    const rtl = LOCALE_CATALOG.filter((d) => d.direction === "rtl").map((d) => d.code).sort();
    expect(rtl).toEqual(["ar", "fa", "he", "ur"]);
  });

  it("gives every locale a non-empty native and english name", () => {
    for (const descriptor of LOCALE_CATALOG) {
      expect(descriptor.nativeName.trim().length).toBeGreaterThan(0);
      expect(descriptor.englishName.trim().length).toBeGreaterThan(0);
    }
  });

  it("names the primary locales after shipped files", () => {
    for (const code of PRIMARY_LOCALES) {
      expect(supportedLocales).toContain(code);
    }
    expect(PRIMARY_LOCALES).toContain("zh-CN");
    expect(PRIMARY_LOCALES).toContain("zh-TW");
  });

  it("throws for an unknown locale instead of returning a guess", () => {
    expect(() => getLocaleDescriptor("xx" as never)).toThrow(/No locale descriptor/);
  });
});