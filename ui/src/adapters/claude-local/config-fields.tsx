import { t } from "@/i18n";
import { configFieldsForSection } from "../config-sections";
import type { AdapterConfigFieldsProps } from "../types";
import {
  Field,
  ToggleField,
  DraftInput,
  DraftNumberInput,
  help,
} from "../../components/agent-config-primitives";
import { ChoosePathButton } from "../../components/PathInstructionsModal";
import { LocalWorkspaceRuntimeFields } from "../local-workspace-runtime-fields";

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";

const instructionsFileHint =
  "Absolute path to a markdown file (e.g. AGENTS.md) that defines this agent's behavior. Injected into the system prompt at runtime.";

export function ClaudeLocalConfigFields({
  section,
  mode,
  isCreate,
  adapterType,
  values,
  set,
  config,
  eff,
  mark,
  models,
  hideInstructionsFile,
}: AdapterConfigFieldsProps) {
  return configFieldsForSection(section, (
    <>
      {!hideInstructionsFile && (
        <Field label={t("adapters.claudeLocal.agentInstructionsFile", { defaultValue: "Agent instructions file" })} hint={instructionsFileHint}>
          <div className="flex items-center gap-2">
            <DraftInput
              value={
                isCreate
                  ? values!.instructionsFilePath ?? ""
                  : eff(
                      "adapterConfig",
                      "instructionsFilePath",
                      String(config.instructionsFilePath ?? ""),
                    )
              }
              onCommit={(v) =>
                isCreate
                  ? set!({ instructionsFilePath: v })
                  : mark("adapterConfig", "instructionsFilePath", v || undefined)
              }
              immediate
              className={inputClass}
              placeholder="/absolute/path/to/AGENTS.md"
            />
            <ChoosePathButton />
          </div>
        </Field>
      )}
      <LocalWorkspaceRuntimeFields
        isCreate={isCreate}
        values={values}
        set={set}
        config={config}
        mark={mark}
        eff={eff}
        mode={mode}
        adapterType={adapterType}
        models={models}
      />
    </>
  ));
}

export function ClaudeLocalAdvancedFields({
  section,
  isCreate,
  values,
  set,
  config,
  eff,
  mark,
  managedSandboxOnly,
}: AdapterConfigFieldsProps) {
  const rawEngine = isCreate
    ? values!.claudeEngine ?? "auto"
    : eff("adapterConfig", "engine", String(config.engine ?? "auto"));
  const engine = rawEngine === "acp" || rawEngine === "cli" ? rawEngine : "auto";
  const acpSelected = engine === "acp";

  return configFieldsForSection(section, (
    <>
      {/*
        The execution engine picks which binary runs on the execution host, and
        the ACP sub-fields below name host paths. The platform-managed
        environment owns both, so the managed-sandbox-only policy hides them,
        the same way `runnerManaged` hides them for the Paperclip Runner.
      */}
      {!managedSandboxOnly && <Field label={t("adapters.claudeLocal.executionEngine", { defaultValue: "Execution engine" })} hint={t("adapters.claudeLocal.defaultUsesAcpIfAcpIsUnavailableTheRunFailsWithA", { defaultValue: "Default uses ACP. If ACP is unavailable, the run fails with a setup error. Choose CLI explicitly to use it." })}>
        <select
          className={inputClass}
          value={engine}
          onChange={(e) => {
            const value = e.target.value === "acp" ? "acp" : e.target.value === "cli" ? "cli" : "auto";
            isCreate
              ? set!({ claudeEngine: value })
              : mark("adapterConfig", "engine", value === "auto" ? undefined : value);
          }}
        >
          <option value="auto">Default (ACP)</option>
          <option value="cli">{t("adapters.claudeLocal.claudeCli", { defaultValue: "Claude CLI" })}</option>
          <option value="acp">{t("adapters.claudeLocal.acp", { defaultValue: "ACP" })}</option>
        </select>
      </Field>}
      {acpSelected && (
        <>
          {!managedSandboxOnly && (
            <Field configSection="advanced"
              label={t("adapters.claudeLocal.acpServerCommand", { defaultValue: "ACP server command" })}
              hint={t("adapters.claudeLocal.optionalOverrideForTheClaudeAcpServerCommandDefa", { defaultValue: "Optional override for the Claude ACP server command. Defaults to the package-local claude-agent-acp binary." })}
            >
              <DraftInput
                value={
                  isCreate
                    ? values!.claudeAcpAgentCommand ?? ""
                    : eff("adapterConfig", "agentCommand", String(config.agentCommand ?? ""))
                }
                onCommit={(v) =>
                  isCreate
                    ? set!({ claudeAcpAgentCommand: v })
                    : mark("adapterConfig", "agentCommand", v || undefined)
                }
                immediate
                className={inputClass}
                placeholder="claude-agent-acp"
              />
            </Field>
          )}
          <Field configSection="runPolicy" label={t("adapters.claudeLocal.acpSessionMode", { defaultValue: "ACP session mode" })} hint={t("adapters.claudeLocal.persistentKeepsAcpSessionStateBetweenRunsOneShot", { defaultValue: "Persistent keeps ACP session state between runs. One-shot starts fresh each run." })}>
            <select
              className={inputClass}
              value={
                isCreate
                  ? values!.claudeAcpMode ?? "persistent"
                  : eff("adapterConfig", "mode", String(config.mode ?? "persistent"))
              }
              onChange={(e) => {
                const value = e.target.value === "oneshot" ? "oneshot" : "persistent";
                isCreate
                  ? set!({ claudeAcpMode: value })
                  : mark("adapterConfig", "mode", value);
              }}
            >
              <option value="persistent">{t("adapters.claudeLocal.persistent", { defaultValue: "Persistent" })}</option>
              <option value="oneshot">{t("adapters.claudeLocal.oneShot", { defaultValue: "One-shot" })}</option>
            </select>
          </Field>
          <Field
            label={t("adapters.claudeLocal.acpNonInteractivePermissions", { defaultValue: "ACP non-interactive permissions" })}
            hint={t("adapters.claudeLocal.fallbackIfTheAcpAgentAsksForInputOutsideAnIntera", { defaultValue: "Fallback if the ACP agent asks for input outside an interactive session." })}
          >
            <select
              className={inputClass}
              value={
                isCreate
                  ? values!.claudeAcpNonInteractivePermissions ?? "deny"
                  : eff("adapterConfig", "nonInteractivePermissions", String(config.nonInteractivePermissions ?? "deny"))
              }
              onChange={(e) => {
                const value = e.target.value === "fail" ? "fail" : "deny";
                isCreate
                  ? set!({ claudeAcpNonInteractivePermissions: value })
                  : mark("adapterConfig", "nonInteractivePermissions", value);
              }}
            >
              <option value="deny">{t("adapters.claudeLocal.deny", { defaultValue: "Deny" })}</option>
              <option value="fail">{t("adapters.claudeLocal.fail", { defaultValue: "Fail" })}</option>
            </select>
          </Field>
          {!managedSandboxOnly && (
            <Field
              label={t("adapters.claudeLocal.acpStateDirectory", { defaultValue: "ACP state directory" })}
              hint={t("adapters.claudeLocal.optionalAcpSessionStateDirectoryDefaultsToPaperc", { defaultValue: "Optional ACP session state directory. Defaults to Paperclip-managed organization/agent scoped storage." })}
            >
              <div className="flex items-center gap-2">
                <DraftInput
                  value={
                    isCreate
                      ? values!.claudeAcpStateDir ?? ""
                      : eff("adapterConfig", "stateDir", String(config.stateDir ?? ""))
                  }
                  onCommit={(v) =>
                    isCreate
                      ? set!({ claudeAcpStateDir: v })
                      : mark("adapterConfig", "stateDir", v || undefined)
                  }
                  immediate
                  className={inputClass}
                  placeholder="/path/to/acp-state"
                />
                <ChoosePathButton />
              </div>
            </Field>
          )}
          <Field configSection="runPolicy"
            label={t("adapters.claudeLocal.acpWarmProcessIdleMs", { defaultValue: "ACP warm process idle ms" })}
            hint={t("adapters.claudeLocal.defaultsTo0WhichClosesTheAcpProcessAfterEachRunW", { defaultValue: "Defaults to 0, which closes the ACP process after each run while retaining persistent session state." })}
          >
            {isCreate ? (
              <input
                type="number"
                className={inputClass}
                value={values!.claudeAcpWarmHandleIdleMs ?? 0}
                onChange={(e) => set!({ claudeAcpWarmHandleIdleMs: Number(e.target.value) })}
              />
            ) : (
              <DraftNumberInput
                value={eff(
                  "adapterConfig",
                  "warmHandleIdleMs",
                  Number(config.warmHandleIdleMs ?? 0),
                )}
                onCommit={(v) => mark("adapterConfig", "warmHandleIdleMs", v || 0)}
                immediate
                className={inputClass}
              />
            )}
          </Field>
        </>
      )}
      <ToggleField
        label={t("adapters.claudeLocal.enableChrome", { defaultValue: "Enable Chrome" })}
        hint={help.chrome}
        checked={
          isCreate
            ? values!.chrome
            : eff("adapterConfig", "chrome", config.chrome === true)
        }
        onChange={(v) =>
          isCreate
            ? set!({ chrome: v })
            : mark("adapterConfig", "chrome", v)
        }
      />
      <ToggleField
        label={t("adapters.claudeLocal.skipPermissions", { defaultValue: "Skip permissions" })}
        hint={help.dangerouslySkipPermissions}
        checked={
          isCreate
            ? values!.dangerouslySkipPermissions
            : eff(
                "adapterConfig",
                "dangerouslySkipPermissions",
                config.dangerouslySkipPermissions !== false,
              )
        }
        onChange={(v) =>
          isCreate
            ? set!({ dangerouslySkipPermissions: v })
            : mark("adapterConfig", "dangerouslySkipPermissions", v)
        }
      />
      <Field label={t("adapters.claudeLocal.maxTurnsPerRun", { defaultValue: "Max turns per run" })} hint={help.maxTurnsPerRun}>
        {isCreate ? (
          <input
            type="number"
            className={inputClass}
            value={values!.maxTurnsPerRun}
            onChange={(e) => set!({ maxTurnsPerRun: Number(e.target.value) })}
          />
        ) : (
          <DraftNumberInput
            value={eff(
              "adapterConfig",
              "maxTurnsPerRun",
              Number(config.maxTurnsPerRun ?? 1000),
            )}
            onCommit={(v) => mark("adapterConfig", "maxTurnsPerRun", v || 1000)}
            immediate
            className={inputClass}
          />
        )}
      </Field>
    </>
  ));
}
