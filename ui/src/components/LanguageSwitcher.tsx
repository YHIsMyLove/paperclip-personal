import { Languages } from "lucide-react";

import { useLocale, useTranslation } from "@/i18n";
import type { LocaleDescriptor } from "@/i18n/locale-catalog";
import { cn } from "@/lib/utils";

type LanguageSwitcherVariant = "compact-menu-action" | "menu-action";

interface LanguageSwitcherProps {
  className?: string;
  /**
   * `compact-menu-action`: icon + inline native select row — matches the
   * surrounding rows in `SidebarAccountMenu`, and a native select keeps this
   * usable without nesting a second popover inside the account popover.
   *
   * `menu-action`: full-width row with label + description + select, for
   * explanatory surfaces such as company settings.
   */
  variant?: LanguageSwitcherVariant;
  /** Called after the language changes, so host menus can dismiss themselves. */
  onAfterChange?: () => void;
}

function sortLocales(
  catalog: readonly LocaleDescriptor[],
  primary: readonly string[],
): LocaleDescriptor[] {
  const primaryRank = (code: string) => {
    const index = primary.indexOf(code);
    return index === -1 ? primary.length : index;
  };
  return [...catalog].sort((left, right) => {
    const byRank = primaryRank(left.code) - primaryRank(right.code);
    if (byRank !== 0) return byRank;
    return left.englishName.localeCompare(right.englishName);
  });
}

export function LanguageSwitcher({
  className,
  variant = "compact-menu-action",
  onAfterChange,
}: LanguageSwitcherProps) {
  const { locale, setLocale, options, primary } = useLocale();
  const { t } = useTranslation();
  const ordered = sortLocales(options, primary);
  const label = t("language.label");
  const description = t("language.description");

  function handleChange(next: string) {
    void setLocale(next);
    onAfterChange?.();
  }

  const select = (
    <select
      value={locale}
      onChange={(event) => handleChange(event.target.value)}
      aria-label={label}
      className="min-w-0 flex-1 cursor-pointer rounded-lg border border-border bg-background px-2 py-1 text-(length:--text-compact) font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {ordered.map((option) => (
        <option key={option.code} value={option.code} lang={option.code}>
          {option.nativeName}
        </option>
      ))}
    </select>
  );

  if (variant === "menu-action") {
    return (
      <div
        className={cn(
          "flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left",
          className,
        )}
      >
        <span className="mt-0.5 rounded-lg border border-border bg-background/70 p-2 text-muted-foreground">
          <Languages className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-foreground">{label}</span>
          <span className="block text-xs text-muted-foreground">{description}</span>
          <span className="mt-2 flex">{select}</span>
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-(--profile-popover-row-height) w-full items-center gap-(--profile-popover-row-gap) rounded-lg px-2.5 text-left text-(length:--text-compact) font-medium leading-(--profile-popover-label-line-height) text-foreground",
        className,
      )}
    >
      <span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground">
        <Languages className="size-4" />
      </span>
      <span className="shrink-0">{label}</span>
      {select}
    </div>
  );
}