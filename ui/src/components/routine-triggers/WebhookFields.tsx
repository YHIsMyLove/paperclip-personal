import { useState } from "react";
import { t } from "@/i18n";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { copyTextToClipboard } from "@/lib/clipboard";

export function CopyField({
  label,
  value,
  help,
}: {
  label: string;
  value: string;
  help?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-background px-3 py-2">
        <code title={value} className="min-w-0 flex-1 truncate text-xs">
          {value}
        </code>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Copy ${label}`}
          onClick={async () => {
            try {
              await copyTextToClipboard(value);
              setCopied(true);
              setError(false);
            } catch {
              setError(true);
            }
          }}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
      {error && (
        <div className="space-y-2">
          <p role="alert" className="text-xs text-destructive">
            {t("components.routineTriggers.webhookFields.copyFailedSelectAndCopyTheTextBelow", { defaultValue: "Copy failed. Select and copy the text below." })}
          </p>
          <textarea
            readOnly
            aria-label={`${label} text`}
            value={value}
            rows={5}
            className="w-full rounded-md border border-input bg-background p-3 font-mono text-xs"
          />
        </div>
      )}
    </div>
  );
}

export function AgentInstructions({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  return (
    <section
      aria-label={t("components.routineTriggers.webhookFields.agentInstructions", { defaultValue: "Agent instructions" })}
      className="space-y-3 rounded-md bg-muted/40 p-4"
    >
      <div className="space-y-1">
        <h2 className="text-sm font-medium">{t("components.routineTriggers.webhookFields.agentInstructions", { defaultValue: "Agent instructions" })}</h2>
        <p className="text-sm text-muted-foreground">
          {t("components.routineTriggers.webhookFields.giveYourAgentEverythingItNeedsToConnectThisWebho", { defaultValue: "Give your agent everything it needs to connect this webhook: the URL, authentication key, and step-by-step instructions." })}
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        aria-label={t("components.routineTriggers.webhookFields.copyForYourAgent", { defaultValue: "Copy for your agent" })}
        onClick={async () => {
          try {
            await copyTextToClipboard(value);
            setCopied(true);
            setError(false);
          } catch {
            setError(true);
          }
        }}
      >
        {copied ? (
          <Check className="h-3.5 w-3.5" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
        {copied ? "Copied instructions" : "Copy for your agent"}
      </Button>
      {error && (
        <div className="space-y-2">
          <p role="alert" className="text-xs text-destructive">
            {t("components.routineTriggers.webhookFields.copyFailedSelectAndCopyTheInstructionsBelow", { defaultValue: "Copy failed. Select and copy the instructions below." })}
          </p>
          <textarea
            readOnly
            aria-label={t("components.routineTriggers.webhookFields.agentInstructionsText", { defaultValue: "Agent instructions text" })}
            value={value}
            rows={5}
            className="w-full rounded-md border border-input bg-background p-3 text-sm"
          />
        </div>
      )}
    </section>
  );
}
