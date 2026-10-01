import { beforeEach, describe, expect, it } from "vitest";
import { i18n, t } from ".";
import en from "./locales/en.json";
import { localeCompleteness, localeMessages } from "./locales";
import { validateLocaleMessages, collectLeafPaths, collectUntranslatedKeys } from "./locale-validation";

describe("locale validation", () => {
  // The active locale follows the browser, so a machine set to Chinese starts
  // on zh-CN. Pin English for assertions that compare against en.json.
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("resolves English messages with key and default fallbacks", () => {
    expect(t("app.noCompanies.title")).toBe(en.app.noCompanies.title);
    expect(t("app.missing", { defaultValue: "Fallback" })).toBe("Fallback");
    expect(t("app.missing")).toBe("app.missing");
  });

  it("serves the active locale and falls back to English per key", async () => {
    await i18n.changeLanguage("zh-CN");
    expect(t("nav.tasks")).toBe("任务");
    // Not yet translated into zh-TW's absent key? Every key is present, so
    // assert the real fallback instead: an unknown key still resolves English.
    await i18n.changeLanguage("zh-TW");
    expect(t("nav.tasks")).toBe("任務");
    await i18n.changeLanguage("fr");
    // `fr.json` still only carries the original onboarding copy, so a key added
    // since then resolves through fallbackLng to the English string, while the
    // keys it does define stay French.
    expect(t("nav.tasks")).toBe(en.nav.tasks);
    expect(t("app.noCompanies.title")).toBe("Créez votre première entreprise");
  });

  it("accepts registered locale files", () => {
    expect(Object.keys(localeMessages)).toContain("en");
    for (const [locale, messages] of Object.entries(localeMessages)) {
      // `partial`: a locale may lag behind English and fall back per key.
      expect(validateLocaleMessages(messages, en, "partial"), locale).toEqual([]);
    }
  });

  it("keeps the English catalog complete", () => {
    expect(validateLocaleMessages(en, en, "complete")).toEqual([]);
    expect(collectUntranslatedKeys(en, en)).toEqual([]);
  });

  it("reports how complete each shipped locale is", () => {
    expect(localeCompleteness("en")).toBe(1);
    expect(localeCompleteness("zh-CN")).toBe(1);
    // The other 38 catalogs still only carry the original onboarding copy.
    expect(localeCompleteness("fr")).toBeLessThan(1);
  });

  it("rejects missing and extra nested keys", () => {
    expect(
      validateLocaleMessages({
        app: {
          noCompanies: {
            title: en.app.noCompanies.title,
            description: en.app.noCompanies.description,
            unexpected: "Unexpected",
          },
        },
      }),
    ).toEqual(
      expect.arrayContaining([
        "app.noCompanies.newCompany is missing",
        "app.noCompanies.unexpected is not defined in English",
      ]),
    );
  });

  it("treats missing keys as fallbacks, not errors, under partial coverage", () => {
    const reference = { message: "Language", hint: "Choose the language." };
    const partial = { message: "语言" };

    // English (the reference) stays complete and still reports every gap.
    expect(validateLocaleMessages(partial, reference)).toEqual(["hint is missing"]);

    // A partially translated locale boots, and still rejects keys English does
    // not define plus the payload/placeholder rules for what it does define.
    expect(validateLocaleMessages(partial, reference, "partial")).toEqual([]);
    expect(
      validateLocaleMessages({ ...partial, nope: "x" }, reference, "partial"),
    ).toEqual(["nope is not defined in English"]);
  });

  it("reports untranslated keys without throwing under partial coverage", () => {
    const reference = { app: { noCompanies: { title: "…", description: "…", newCompany: "…" } } };
    const partial = { app: { noCompanies: { title: "标题" } } };
    expect(collectUntranslatedKeys(partial, reference)).toEqual([
      "app.noCompanies.description",
      "app.noCompanies.newCompany",
    ]);
    expect(collectLeafPaths(reference)).toEqual([
      "app.noCompanies.title",
      "app.noCompanies.description",
      "app.noCompanies.newCompany",
    ]);
  });

  it("rejects non-string leaves", () => {
    expect(
      validateLocaleMessages({
        app: {
          noCompanies: {
            ...en.app.noCompanies,
            title: ["Create your first company"],
          },
        },
      }),
    ).toEqual(expect.arrayContaining(["app.noCompanies.title must be a string"]));
  });

  it("requires interpolation placeholders to match English", () => {
    const reference = {
      message: "Invite {{name}} to {{company}}",
    };

    expect(validateLocaleMessages({ message: "Invite {{name}}" }, reference)).toEqual([
      'message interpolation placeholders must match English exactly: expected ["company","name"], received ["name"]',
    ]);
  });

  it("rejects executable, raw HTML, and unexpected link payloads not present in English", () => {
    const reference = {
      script: "Create company",
      handler: "Create company",
      js: "Create company",
      data: "Create company",
      url: "Create company",
      html: "Create company",
    };

    expect(
      validateLocaleMessages(
        {
          script: "<script>alert(1)</script>",
          handler: '<span ONCLICK="alert(1)">Create</span>',
          js: "javascript:alert(1)",
          data: "data:text/html,hello",
          url: "https://example.test",
          html: "<strong>Create company</strong>",
        },
        reference,
      ),
    ).toEqual(
      expect.arrayContaining([
        "script contains disallowed <script",
        "handler contains disallowed event-handler attribute",
        "js contains disallowed javascript:",
        "data contains disallowed data:",
        "url contains disallowed unexpected URL",
        "html contains disallowed raw HTML tag",
      ]),
    );
  });

  it("caps localized string length relative to English", () => {
    expect(validateLocaleMessages({ message: "x".repeat(200) }, { message: "Short" })).toEqual([
      "message is too long: 200 characters exceeds 133",
    ]);
  });
});
