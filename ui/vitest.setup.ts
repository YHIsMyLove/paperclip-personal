const storageEntries = new Map<string, string>();

function installStorageMock(target: Record<string, unknown>) {
  Object.defineProperty(target, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => storageEntries.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storageEntries.set(key, String(value));
      },
      removeItem: (key: string) => {
        storageEntries.delete(key);
      },
      clear: () => {
        storageEntries.clear();
      },
    },
  });
}

if (
  typeof globalThis.localStorage?.getItem !== "function"
  || typeof globalThis.localStorage?.setItem !== "function"
  || typeof globalThis.localStorage?.removeItem !== "function"
  || typeof globalThis.localStorage?.clear !== "function"
) {
  installStorageMock(globalThis);
}

if (typeof window !== "undefined" && window.localStorage !== globalThis.localStorage) {
  installStorageMock(window as unknown as Record<string, unknown>);
}

/**
 * Pin the UI language to English for every test run.
 *
 * i18n resolves its initial locale from the stored choice, then the browser
 * preference, so without this the catalogue under test follows whatever locale
 * the machine happens to report — a zh-CN machine rendered Chinese copy and
 * broke every suite that asserts on English markup. Seeding the stored choice
 * makes it deterministic instead.
 *
 * Suites that care about a specific locale call i18n.changeLanguage themselves
 * (locale-validation.test.ts, and the ones pinning English per-file before this
 * existed). Tests that clear the key, e.g. resolveInitialLocale's stored-choice
 * cases, remove it and fall through to detection as intended.
 */
try {
  globalThis.localStorage.setItem("paperclip.locale", "en");
} catch {
  // Private-mode Safari and sandboxed frames throw on storage access; the
  // assertions above already handle a missing implementation.
}

// jsdom does not implement Element.prototype.scrollIntoView. Several surfaces
// (e.g. IssueChatThread's auto-scroll-to-latest) call it during normal render,
// so provide a no-op default. Tests that assert on scroll behaviour override
// this on the prototype themselves and restore it afterwards.
if (typeof Element !== "undefined" && typeof Element.prototype.scrollIntoView !== "function") {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}
