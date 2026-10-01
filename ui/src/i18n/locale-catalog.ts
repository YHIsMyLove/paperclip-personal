import type { SupportedLocale } from "./locales";

export type TextDirection = "ltr" | "rtl";

export type LocaleDescriptor = {
  /** BCP 47 tag; also the `zh-CN.json` / `fr.json` … filename stem. */
  readonly code: SupportedLocale;
  /** Name written in the language itself, so the list is readable to speakers. */
  readonly nativeName: string;
  /** English name, for search and for the `lang` attribute fallbacks. */
  readonly englishName: string;
  readonly direction: TextDirection;
};

// Only `ar`, `fa`, `he` and `ur` are right-to-left among the shipped catalogs.
// Everything else is left-to-right, including `bn`/`pa`/`ta`/`te`/`mr`.
const RTL_LOCALES = new Set<SupportedLocale>(["ar", "fa", "he", "ur"]);

function locale(
  code: SupportedLocale,
  nativeName: string,
  englishName: string,
): LocaleDescriptor {
  return {
    code,
    nativeName,
    englishName,
    direction: RTL_LOCALES.has(code) ? "rtl" : "ltr",
  };
}

export const LOCALE_CATALOG: readonly LocaleDescriptor[] = [
  locale("en", "English", "English"),
  locale("ar", "العربية", "Arabic"),
  locale("bn", "বাংলা", "Bengali"),
  locale("cs", "Čeština", "Czech"),
  locale("da", "Dansk", "Danish"),
  locale("de", "Deutsch", "German"),
  locale("el", "Ελληνικά", "Greek"),
  locale("es", "Español", "Spanish"),
  locale("fa", "فارسی", "Persian"),
  locale("fi", "Suomi", "Finnish"),
  locale("fil", "Filipino", "Filipino"),
  locale("fr", "Français", "French"),
  locale("he", "עברית", "Hebrew"),
  locale("hi", "हिन्दी", "Hindi"),
  locale("hu", "Magyar", "Hungarian"),
  locale("id", "Bahasa Indonesia", "Indonesian"),
  locale("it", "Italiano", "Italian"),
  locale("ja", "日本語", "Japanese"),
  locale("ko", "한국어", "Korean"),
  locale("mr", "मराठी", "Marathi"),
  locale("ms", "Bahasa Melayu", "Malay"),
  locale("nb", "Norsk bokmål", "Norwegian Bokmål"),
  locale("nl", "Nederlands", "Dutch"),
  locale("pa", "ਪੰਜਾਬੀ", "Punjabi"),
  locale("pl", "Polski", "Polish"),
  locale("pt-BR", "Português (Brasil)", "Portuguese (Brazil)"),
  locale("pt-PT", "Português (Portugal)", "Portuguese (Portugal)"),
  locale("ro", "Română", "Romanian"),
  locale("ru", "Русский", "Russian"),
  locale("sv", "Svenska", "Swedish"),
  locale("sw", "Kiswahili", "Swahili"),
  locale("ta", "தமிழ்", "Tamil"),
  locale("te", "తెలుగు", "Telugu"),
  locale("th", "ไทย", "Thai"),
  locale("tr", "Türkçe", "Turkish"),
  locale("uk", "Українська", "Ukrainian"),
  locale("ur", "اردو", "Urdu"),
  locale("vi", "Tiếng Việt", "Vietnamese"),
  locale("zh-CN", "简体中文", "Chinese (Simplified)"),
  locale("zh-TW", "繁體中文", "Chinese (Traditional)"),
];

export const LOCALE_CATALOG_BY_CODE: ReadonlyMap<SupportedLocale, LocaleDescriptor> =
  new Map(LOCALE_CATALOG.map((descriptor) => [descriptor.code, descriptor]));

/**
 * Locales offered in the switcher, ordered so the default and the two Chinese
 * packs lead. The rest stay alphabetical by English name, which keeps the list
 * stable as new catalogs are added.
 */
export const PRIMARY_LOCALES: readonly SupportedLocale[] = ["en", "zh-CN", "zh-TW"];

export function getLocaleDescriptor(code: SupportedLocale): LocaleDescriptor {
  const descriptor = LOCALE_CATALOG_BY_CODE.get(code);
  if (!descriptor) throw new Error(`No locale descriptor for ${code}`);
  return descriptor;
}

export function getTextDirection(code: SupportedLocale): TextDirection {
  return getLocaleDescriptor(code).direction;
}