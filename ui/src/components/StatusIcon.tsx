import { useState } from "react";
import type { IssueBlockerAttention } from "@paperclipai/shared";
import { t } from "@/i18n";
import { cn } from "../lib/utils";
import { StatusGlyph, type StatusGlyphSize } from "./StatusGlyph";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

const allStatuses = ["backlog", "todo", "in_progress", "in_review", "done", "cancelled", "blocked"];

/**
 * Status names come from the catalog rather than from title-casing the raw
 * status id.
 *
 * `in_review` title-cased reads "In Review" in English but "In Review" in every
 * language — the derived form cannot be translated at all. Every status surface
 * routes through this function (see the component doc below), so the whole app's
 * status vocabulary localizes from one map.
 *
 * The id itself is kept as the `defaultValue`, so an unknown or newly added
 * status still renders something readable instead of a bare key.
 */
const STATUS_KEYS: Record<string, string> = {
  backlog: "status.backlog",
  todo: "status.todo",
  in_progress: "status.in_progress",
  in_review: "status.in_review",
  idle: "status.idle",
  blocked: "status.blocked",
  in_queue: "status.in_queue",
  done: "status.done",
  cancelled: "status.cancelled",
};

function deriveStatusLabel(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusLabel(status: string): string {
  const key = STATUS_KEYS[status];
  return key ? t(key, { defaultValue: deriveStatusLabel(status) }) : deriveStatusLabel(status);
}

interface StatusIconProps {
  status: string;
  externalConversationState?: "active" | "waiting" | null;
  blockerAttention?: IssueBlockerAttention | null;
  onChange?: (status: string) => void;
  className?: string;
  /** Optional layout wrapper around the glyph. Does not change glyph dimensions. */
  glyphContainerClassName?: string;
  showLabel?: boolean;
  /** Glyph size (PAP-243a). Default `md` (16px); lists/detail/mentions use `lg` (20px). */
  size?: StatusGlyphSize;
}

/**
 * Blocked reasons are whole sentences with counts and identifiers in them, so
 * they get catalog keys with interpolation rather than string surgery. The
 * English text stays as the `defaultValue`, which is what keeps this file safe
 * across an upgrade: if a future version drops a key, the sentence degrades to
 * English instead of rendering a raw key to the user.
 */
function blockedAttentionLabel(blockerAttention: IssueBlockerAttention | null | undefined) {
  if (!blockerAttention || blockerAttention.state === "none") {
    return t("status.blocked", { defaultValue: "Blocked" });
  }

  if (blockerAttention.reason === "active_child") {
    const count = blockerAttention.coveredBlockerCount;
    if (count === 1 && blockerAttention.sampleBlockerIdentifier) {
      return t("status.blockedWaitingSubTask", {
        defaultValue: `Blocked · waiting on active sub-task ${blockerAttention.sampleBlockerIdentifier}`,
        id: blockerAttention.sampleBlockerIdentifier,
      });
    }
    return t("status.blockedWaitingSubTasks", {
      defaultValue: `Blocked · waiting on ${count} active sub-task${count === 1 ? "" : "s"}`,
      count,
    });
  }

  if (blockerAttention.reason === "active_dependency") {
    const count = blockerAttention.coveredBlockerCount;
    if (count === 1 && blockerAttention.sampleBlockerIdentifier) {
      return t("status.blockedCoveredByDependency", {
        defaultValue: `Blocked · covered by active dependency ${blockerAttention.sampleBlockerIdentifier}`,
        id: blockerAttention.sampleBlockerIdentifier,
      });
    }
    return t("status.blockedCoveredByDependencies", {
      defaultValue: `Blocked · covered by ${count} active dependency${count === 1 ? "" : "ies"}`,
      count,
    });
  }

  if (blockerAttention.reason === "stalled_review") {
    const count = blockerAttention.stalledBlockerCount;
    const leaf = blockerAttention.sampleStalledBlockerIdentifier ?? blockerAttention.sampleBlockerIdentifier;
    if (count === 1 && leaf) {
      return t("status.blockedReviewStalledOn", {
        defaultValue: `Blocked · review stalled on ${leaf}`,
        id: leaf,
      });
    }
    return t("status.blockedReviewsStalled", {
      defaultValue: `Blocked · ${count} review${count === 1 ? "" : "s"} stalled with no clear next step`,
      count,
    });
  }

  if (blockerAttention.reason === "attention_required") {
    const count = blockerAttention.attentionBlockerCount || blockerAttention.unresolvedBlockerCount;
    const coveredCount = blockerAttention.coveredBlockerCount;
    // `_one`/`_other` rather than one key with the noun baked in: English needs
    // "1 blocker needs" against "3 blockers need", and the catalog is where a
    // language decides which form it has — Chinese has neither distinction, so
    // its two entries are identical.
    if (coveredCount > 0) {
      return t("status.blockedNeedsAttentionCovered", {
        defaultValue: `Blocked · ${count} blocker${count === 1 ? " needs" : "s need"} attention; ${coveredCount} covered by active work`,
        count,
        covered: coveredCount,
      });
    }
    return t("status.blockedNeedsAttention", {
      defaultValue: `Blocked · ${count} blocker${count === 1 ? " needs" : "s need"} attention`,
      count,
    });
  }

  return t("status.blocked", { defaultValue: "Blocked" });
}

/**
 * Task/issue status indicator — renders the unified, color-blind-safe
 * {@link StatusGlyph} (one distinct shape per status). With `onChange` it also
 * acts as a status picker (popover). This one component drives every standalone
 * status surface: list, kanban, detail header, properties row + picker flyout,
 * sub-task / blocked-by pills, blocked inbox, quicklook, sibling nav, filters,
 * search, columns, dashboard.
 *
 * A "covered" blocked task (waiting on active work) maps to the `in_queue`
 * glyph — the blocked shape recoloured blue — while the full blocked reason
 * still rides on the accessible label.
 */
export function StatusIcon({ status, externalConversationState, blockerAttention, onChange, className, glyphContainerClassName, showLabel, size = "md" }: StatusIconProps) {
  const [open, setOpen] = useState(false);
  const displayStatus = status === "in_review" && externalConversationState === "waiting" ? "idle" : status;
  const isCoveredBlocked = status === "blocked" && blockerAttention?.state === "covered";
  const ariaLabel = status === "blocked" ? blockedAttentionLabel(blockerAttention) : statusLabel(displayStatus);
  const glyphStatus = isCoveredBlocked ? "in_queue" : displayStatus;

  const glyphIcon = (
    <StatusGlyph
      status={glyphStatus}
      size={size}
      className={cn(onChange && !showLabel && "cursor-pointer", className)}
      title={ariaLabel}
    />
  );
  const glyph = glyphContainerClassName ? (
    <span className={glyphContainerClassName} data-status-glyph-container="true">
      {glyphIcon}
    </span>
  ) : glyphIcon;

  if (!onChange) {
    return showLabel ? (
      <span className="inline-flex items-center gap-1.5">
        {glyph}
        <span className="text-sm">{statusLabel(displayStatus)}</span>
      </span>
    ) : (
      glyph
    );
  }

  const trigger = showLabel ? (
    <button
      type="button"
      aria-label={`Change status (current: ${ariaLabel})`}
      className="inline-flex min-h-5 items-center gap-1.5 cursor-pointer hover:bg-accent/50 rounded px-1 -mx-1 py-0.5 transition-colors"
    >
      {glyph}
      <span className="text-sm">{statusLabel(displayStatus)}</span>
    </button>
  ) : (
    <button
      type="button"
      data-slot="icon-button"
      aria-label={`Change status (current: ${ariaLabel})`}
      className="inline-flex cursor-pointer items-center justify-center rounded-sm focus-visible:outline-none focus-visible:ring-(length:--rad-3) focus-visible:ring-ring"
    >
      {glyph}
    </button>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-40 p-1" align="start">
        {allStatuses.map((s) => (
          <Button
            key={s}
            variant="ghost"
            size="sm"
            className={cn("w-full justify-start gap-2 text-xs", s === status && "bg-accent")}
            onClick={() => {
              onChange(s);
              setOpen(false);
            }}
          >
            <StatusIcon status={s} size="lg" />
            {statusLabel(s)}
          </Button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
