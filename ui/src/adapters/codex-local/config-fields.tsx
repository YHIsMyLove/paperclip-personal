import { t } from "@/i18n";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
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
import {
  DEFAULT_CODEX_LOCAL_MODEL,
  CODEX_LOCAL_FAST_MODE_SUPPORTED_MODELS,
  isCodexLocalFastModeSupported,
  isCodexLocalManualModel,
} from "@paperclipai/adapter-codex-local";
import {
  PAPERCLIP_RUNNER_IDLE_TIMEOUT_DEFAULT_MS,
  PAPERCLIP_RUNNER_IDLE_TIMEOUT_MAX_MS,
  PAPERCLIP_RUNNER_PERMISSION_CAPABILITIES,
  PAPERCLIP_RUNNER_ACPX_PROFILES,
  isPaperclipRunnerProvider,
  resolvePaperclipRunnerIdleTimeoutMs,
  resolvePaperclipRunnerPermissionMode,
  type PaperclipRunnerPermissionMode,
  type PaperclipRunnerProvider,
} from "@paperclipai/adapter-utils";

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";
const instructionsFileHint =
  "Absolute path to a markdown file (e.g. AGENTS.md) that defines this agent's behavior. Injected into the system prompt at runtime. Note: Codex may still auto-apply repo-scoped AGENTS.md files from the workspace.";
const defaultOpenCodeRunnerModel = "openrouter/deepseek/deepseek-v4-flash-0731";
const defaultAcpxClaudeModel = "claude-sonnet-5";
const defaultClaudeManagedModel = "claude-sonnet-5";
const defaultAwsAgentCoreModel = "global.anthropic.claude-sonnet-4-6";

export function CodexLocalConfigFields({
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
  managedSandboxOnly,
}: AdapterConfigFieldsProps) {
  const runnerManaged = adapterType === "paperclip_runner";
  // The execution engine picks which binary runs on the execution host, and the
  // ACP sub-fields below name host paths. The platform-managed environment owns
  // both, so the managed-sandbox-only policy hides them the same way
  // `runnerManaged` already does for the Paperclip Runner.
  const hideEngineChoice = runnerManaged || managedSandboxOnly === true;
  const configuredRunnerProvider = runnerManaged
    ? isCreate
      ? values!.adapterSchemaValues?.provider
      : eff("adapterConfig", "provider", config.provider === "acpx" && config.acpxAgent === "codex" ? "codex" : config.provider ?? "codex")
    : "codex";
  const runnerProvider: PaperclipRunnerProvider = isPaperclipRunnerProvider(
    configuredRunnerProvider,
  )
    ? configuredRunnerProvider
    : "codex";
  const runnerPermissionCapability =
    PAPERCLIP_RUNNER_PERMISSION_CAPABILITIES[runnerProvider];
  const configuredRunnerPermissionMode =
    runnerManaged && runnerPermissionCapability.configurable
      ? isCreate
        ? (values!.adapterSchemaValues?.[
            runnerPermissionCapability.configKey
          ] ??
          (runnerProvider === "codex"
            ? values!.codexPermissionMode
            : undefined))
        : eff(
            "adapterConfig",
            runnerPermissionCapability.configKey,
            config[runnerPermissionCapability.configKey],
          )
      : undefined;
  const runnerPermissionModeUnsupported =
    runnerManaged &&
    runnerPermissionCapability.configurable &&
    configuredRunnerPermissionMode !== undefined &&
    !runnerPermissionCapability.options.some(
      (option) => option.value === configuredRunnerPermissionMode,
    );
  const runnerPermissionMode =
    runnerManaged && runnerPermissionCapability.configurable
      ? resolvePaperclipRunnerPermissionMode(
          runnerProvider,
          configuredRunnerPermissionMode,
        )
      : runnerPermissionCapability.defaultMode;
  const runnerSchemaValue = (key: string, fallback: unknown): unknown =>
    isCreate
      ? (values!.adapterSchemaValues?.[key] ?? fallback)
      : eff("adapterConfig", key, config[key] ?? fallback);
  const updateRunnerSchemaValue = (key: string, value: unknown): void => {
    if (isCreate) {
      set!({
        adapterSchemaValues: {
          ...values!.adapterSchemaValues,
          [key]: value,
        },
      });
    } else {
      mark("adapterConfig", key, value);
    }
  };
  const runnerLifecycleMode = runnerManaged
    ? isCreate
      ? (values!.paperclipRunnerLifecycleMode ?? "per_turn")
      : eff(
          "adapterConfig",
          "lifecycleMode",
          config.lifecycleMode === "warm" ? "warm" : "per_turn",
        )
    : "per_turn";
  const runnerIdleTimeoutMs = runnerManaged
    ? resolvePaperclipRunnerIdleTimeoutMs(
        isCreate
          ? values!.paperclipRunnerIdleTimeoutMs
          : eff("adapterConfig", "idleTimeoutMs", config.idleTimeoutMs),
      )
    : PAPERCLIP_RUNNER_IDLE_TIMEOUT_DEFAULT_MS;
  const rawEngine = runnerManaged
    ? "cli"
    : isCreate
      ? (values!.codexEngine ?? "auto")
      : eff("adapterConfig", "engine", String(config.engine ?? "auto"));
  const engine =
    rawEngine === "acp" || rawEngine === "cli" ? rawEngine : "auto";
  const acpSelected = engine === "acp";
  const bypassEnabled =
    config.dangerouslyBypassApprovalsAndSandbox === true ||
    config.dangerouslyBypassSandbox === true;
  const fastModeEnabled = isCreate
    ? Boolean(values!.fastMode)
    : eff("adapterConfig", "fastMode", Boolean(config.fastMode));
  const currentModel = isCreate
    ? String(values!.model ?? "")
    : eff("adapterConfig", "model", String(config.model ?? ""));
  const fastModeManualModel = isCodexLocalManualModel(currentModel);
  const fastModeSupported = isCodexLocalFastModeSupported(currentModel);
  const supportedModelsLabel =
    CODEX_LOCAL_FAST_MODE_SUPPORTED_MODELS.join(", ");
  const fastModeMessage = fastModeManualModel
    ? "Fast mode will be passed through for this manual model. If Codex rejects it, turn the toggle off."
    : fastModeSupported
      ? "Fast mode consumes credits/tokens much faster than standard Codex runs."
      : `Fast mode currently only works on ${supportedModelsLabel} or manual model IDs. Paperclip will ignore this toggle until the model is switched.`;

  return configFieldsForSection(section, (
    <>
      {!hideEngineChoice && (
        <Field
          label={t("adapters.codex.executionEngine", { defaultValue: "Execution engine" })}
          hint={t("adapters.codex.defaultUsesAcpIfAcpIsUnavailableTheRunFailsWithA", { defaultValue: "Default uses ACP. If ACP is unavailable, the run fails with a setup error. Choose CLI explicitly to use it." })}
        >
          <select
            className={inputClass}
            value={engine}
            onChange={(e) => {
              const value =
                e.target.value === "acp"
                  ? "acp"
                  : e.target.value === "cli"
                    ? "cli"
                    : "auto";
              isCreate
                ? set!({ codexEngine: value })
                : mark(
                    "adapterConfig",
                    "engine",
                    value === "auto" ? undefined : value,
                  );
            }}
          >
            <option value="auto">Default (ACP)</option>
            <option value="cli">{t("adapters.codex.codexCli", { defaultValue: "Codex CLI" })}</option>
            <option value="acp">{t("adapters.codex.acp", { defaultValue: "ACP" })}</option>
          </select>
        </Field>
      )}
      {runnerManaged && (
        <Field configSection="adapter"
          label={t("adapters.codex.provider", { defaultValue: "Provider" })}
          hint={t("adapters.codex.theRunnerPersistsThisProviderWithEachRunSoRecove", { defaultValue: "The runner persists this provider with each run so recovery cannot drift after configuration changes." })}
        >
          <select
            className={inputClass}
            value={runnerProvider === "acpx" && runnerSchemaValue("acpxAgent", "claude") === "grok" ? "grok" : runnerProvider}
            onChange={(event) => {
              const grok = event.target.value === "grok";
              const provider = grok ? "acpx" : isPaperclipRunnerProvider(event.target.value)
                ? event.target.value
                : "codex";
              const model =
                provider === "opencode"
                  ? defaultOpenCodeRunnerModel
                  : provider === "claude_managed"
                    ? defaultClaudeManagedModel
                    : provider === "aws_agentcore"
                      ? defaultAwsAgentCoreModel
                      : provider === "acpx"
                        ? grok ? "grok-4.7" : defaultAcpxClaudeModel
                        : DEFAULT_CODEX_LOCAL_MODEL;
              if (isCreate) {
                set!({
                  model,
                  adapterSchemaValues: {
                    ...values!.adapterSchemaValues,
                    provider,
                    ...(provider === "acpx" ? { acpxAgent: grok ? "grok" : "claude" } : {}),
                  },
                });
              } else {
                mark("adapterConfig", "provider", provider);
                mark("adapterConfig", "model", model);
                if (provider === "acpx") {
                  mark("adapterConfig", "acpxAgent", grok ? "grok" : "claude");
                }
              }
            }}
          >
            <option value="codex">{t("adapters.codex.codex", { defaultValue: "Codex" })}</option>
            <option value="opencode">{t("adapters.codex.opencode11832", { defaultValue: "OpenCode 1.18.32" })}</option>
            <option value="claude_managed">{t("adapters.codex.claudeManaged", { defaultValue: "Claude Managed" })}</option>
            <option value="aws_agentcore">{t("adapters.codex.awsAgentcore", { defaultValue: "AWS AgentCore" })}</option>
            <option value="acpx">{t("adapters.codex.acpAgents", { defaultValue: "ACP agents" })}</option>
            <option value="grok">{t("adapters.codex.grokBuild", { defaultValue: "Grok Build" })}</option>
          </select>
        </Field>
      )}
      {runnerManaged && runnerProvider === "acpx" && runnerSchemaValue("acpxAgent", "claude") !== "grok" && (
        <Field configSection="adapter" label={t("adapters.codex.acpAgent", { defaultValue: "ACP agent" })} hint={t("adapters.codex.cursorGithubCopilotAndPiAreAwaitingLocalAndDayto", { defaultValue: "Cursor, GitHub Copilot, and Pi are awaiting local and Daytona qualification." })}>
          <select className={inputClass}
            value={String(isCreate ? values!.adapterSchemaValues?.acpxAgent ?? "claude" : eff("adapterConfig", "acpxAgent", config.acpxAgent ?? "claude"))}
            onChange={(event) => {
              const profile = PAPERCLIP_RUNNER_ACPX_PROFILES.find(entry => entry.value === event.target.value);
              if (!profile?.qualified) return;
              if (isCreate) set!({ model: profile.value === "claude" ? defaultAcpxClaudeModel : "",
                adapterSchemaValues: { ...values!.adapterSchemaValues, acpxAgent: profile.value } });
              else { mark("adapterConfig", "acpxAgent", profile.value); mark("adapterConfig", "model", profile.value === "claude" ? defaultAcpxClaudeModel : ""); }
            }}>
            {PAPERCLIP_RUNNER_ACPX_PROFILES.map(profile => <option key={profile.value} value={profile.value} disabled={!profile.qualified}>
              {profile.label}{profile.qualified ? "" : " — qualification pending"}
            </option>)}
          </select>
        </Field>
      )}
      {runnerManaged && runnerProvider === "claude_managed" && (
        <>
          <Field
            label={t("adapters.codex.managedAgentProfile", { defaultValue: "Managed Agent profile" })}
            hint={t("adapters.codex.companyScopedQualifiedProfileIdOrKeyRemoteResour", { defaultValue: "Company-scoped qualified profile ID or key. Remote resource identity is loaded from the stored profile, not this agent config." })}
          >
            <DraftInput
              value={String(runnerSchemaValue("managedProfileId", ""))}
              onCommit={(value) =>
                updateRunnerSchemaValue("managedProfileId", value.trim())
              }
              immediate
              className={inputClass}
              placeholder="managed-primary"
            />
          </Field>
          <Field
            label={t("adapters.codex.sessionSpendCeilingUsd", { defaultValue: "Session spend ceiling (USD)" })}
            hint={t("adapters.codex.optionalPerAgentHardCeilingLeave100ToUseAConserv", { defaultValue: "Optional per-agent hard ceiling. Leave 1.00 to use a conservative default." })}
          >
            <DraftNumberInput
              value={Number(runnerSchemaValue("maxSessionListCostUsd", 1))}
              min={0.01}
              onCommit={(value) =>
                updateRunnerSchemaValue("maxSessionListCostUsd", value)
              }
              immediate
              className={inputClass}
            />
          </Field>
          <ToggleField
            label={t("adapters.codex.acknowledgeManagedRetention", { defaultValue: "Acknowledge managed retention" })}
            hint={t("adapters.codex.claudeManagedIsAStatefulBetaServiceAndIsNotEligi", { defaultValue: "Claude Managed is a stateful beta service and is not eligible for ZDR or HIPAA modes." })}
            checked={
              runnerSchemaValue("managedAgentsRetentionAcknowledged", false) ===
              true
            }
            onChange={(value) =>
              updateRunnerSchemaValue(
                "managedAgentsRetentionAcknowledged",
                value,
              )
            }
          />
        </>
      )}
      {runnerManaged && runnerProvider === "aws_agentcore" && (
        <>
          <Field
            label={t("adapters.codex.agentcoreProfile", { defaultValue: "AgentCore profile" })}
            hint={t("adapters.codex.companyScopedQualifiedProfileIdOrKeyHarnessMemor", { defaultValue: "Company-scoped qualified profile ID or key. Harness, Memory, IAM, and context-store identity come from the stored profile." })}
          >
            <DraftInput
              value={String(runnerSchemaValue("agentCoreProfileId", ""))}
              onCommit={(value) =>
                updateRunnerSchemaValue("agentCoreProfileId", value.trim())
              }
              immediate
              className={inputClass}
              placeholder="agentcore-primary"
            />
          </Field>
          <Field
            label={t("adapters.codex.estimatedSessionCeilingUsd", { defaultValue: "Estimated session ceiling (USD)" })}
            hint="Paperclip estimate; AWS does not provide a per-session currency hard stop."
          >
            <DraftNumberInput
              value={Number(runnerSchemaValue("maxEstimatedSessionCostUsd", 1))}
              min={0.01}
              onCommit={(value) =>
                updateRunnerSchemaValue("maxEstimatedSessionCostUsd", value)
              }
              immediate
              className={inputClass}
            />
          </Field>
          <Field
            label={t("adapters.codex.maximumIterations", { defaultValue: "Maximum iterations" })}
            hint={t("adapters.codex.qualifiedRangeIs18InvalidValuesFailClosedTo8", { defaultValue: "Qualified range is 1–8. Invalid values fail closed to 8." })}
          >
            <DraftNumberInput
              value={Number(runnerSchemaValue("maxIterations", 8))}
              min={1}
              max={8}
              onCommit={(value) =>
                updateRunnerSchemaValue("maxIterations", value)
              }
              immediate
              className={inputClass}
            />
          </Field>
          <Field
            label={t("adapters.codex.maximumOutputTokens", { defaultValue: "Maximum output tokens" })}
            hint={t("adapters.codex.qualifiedRangeIs14096", { defaultValue: "Qualified range is 1–4096." })}
          >
            <DraftNumberInput
              value={Number(runnerSchemaValue("maxOutputTokens", 4_096))}
              min={1}
              max={4_096}
              onCommit={(value) =>
                updateRunnerSchemaValue("maxOutputTokens", value)
              }
              immediate
              className={inputClass}
            />
          </Field>
          <Field configSection="runPolicy"
            label={t("adapters.codex.invocationTimeoutSeconds", { defaultValue: "Invocation timeout (seconds)" })}
            hint={t("adapters.codex.qualifiedRangeIs1300Seconds", { defaultValue: "Qualified range is 1–300 seconds." })}
          >
            <DraftNumberInput
              value={Number(runnerSchemaValue("timeoutSeconds", 300))}
              min={1}
              max={300}
              onCommit={(value) =>
                updateRunnerSchemaValue("timeoutSeconds", value)
              }
              immediate
              className={inputClass}
            />
          </Field>
          <ToggleField
            label={t("adapters.codex.acknowledge90DayMemoryRetention", { defaultValue: "Acknowledge 90-day Memory retention" })}
            hint={t("adapters.codex.theQualifiedAgentcoreProfileRetainsShortTermMemo", { defaultValue: "The qualified AgentCore profile retains short-term Memory events for exactly 90 days." })}
            checked={
              runnerSchemaValue("agentCoreRetentionAcknowledged", false) ===
              true
            }
            onChange={(value) =>
              updateRunnerSchemaValue("agentCoreRetentionAcknowledged", value)
            }
          />
        </>
      )}
      {runnerManaged && runnerPermissionCapability.configurable && (runnerPermissionCapability.options.length > 1 || runnerPermissionModeUnsupported) && (
        <Field
          label={t("adapters.codex.permissionMode", { defaultValue: "Permission mode" })}
          hint={`${runnerPermissionCapability.description} The selected mode does not widen Paperclip's workspace, network, credential, or planning boundaries.`}
        >
          <Select
            value={
              runnerPermissionModeUnsupported
                ? "__unsupported__"
                : runnerPermissionMode
            }
            onValueChange={(selectedMode) => {
              const value = resolvePaperclipRunnerPermissionMode(
                runnerProvider,
                selectedMode,
              ) as PaperclipRunnerPermissionMode;
              if (isCreate) {
                set!({
                  adapterSchemaValues: {
                    ...values!.adapterSchemaValues,
                    [runnerPermissionCapability.configKey]: value,
                  },
                });
              } else {
                mark(
                  "adapterConfig",
                  runnerPermissionCapability.configKey,
                  value,
                );
              }
            }}
          >
            <SelectTrigger aria-label={t("adapters.codex.permissionMode", { defaultValue: "Permission mode" })} className="w-full font-sans">
              <SelectValue>
                {runnerPermissionModeUnsupported
                  ? "Unsupported saved mode — select a qualified mode"
                  : runnerPermissionCapability.options.find((option) => option.value === runnerPermissionMode)?.label}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {runnerPermissionModeUnsupported && (
                <SelectItem value="__unsupported__" disabled>{t("adapters.codex.unsupportedSavedModeSelectAQualifiedMode", { defaultValue: "Unsupported saved mode — select a qualified mode" })}</SelectItem>
              )}
              {runnerPermissionCapability.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {runnerPermissionModeUnsupported && runnerProvider === "codex" && (
            <p className="mt-1 text-xs text-destructive" role="alert">
              This saved Codex mode cannot start or recover a Paperclip Runner
              run. Select Automatic (isolated) to remediate it.
            </p>
          )}
        </Field>
      )}
      {runnerManaged && (
        <Field configSection="runPolicy"
          label={t("adapters.codex.runnerLifecycle", { defaultValue: "Runner lifecycle" })}
          hint={t("adapters.codex.turnByTurnSuspendsAfterEachRunWarmKeepsTheSamePr", { defaultValue: "Turn by turn suspends after each run. Warm keeps the same provider process available between governed runs." })}
        >
          <select
            className={inputClass}
            value={runnerLifecycleMode}
            onChange={(event) => {
              const value = event.target.value === "warm" ? "warm" : "per_turn";
              isCreate
                ? set!({ paperclipRunnerLifecycleMode: value })
                : mark("adapterConfig", "lifecycleMode", value);
            }}
          >
            <option value="per_turn">{t("adapters.codex.turnByTurn", { defaultValue: "Turn by turn" })}</option>
            <option value="warm">{t("adapters.codex.warmSession", { defaultValue: "Warm session" })}</option>
          </select>
        </Field>
      )}
      {runnerManaged && runnerLifecycleMode === "warm" && (
        <Field configSection="runPolicy"
          label={t("adapters.codex.warmIdleTimeoutMs", { defaultValue: "Warm idle timeout (ms)" })}
          hint={t("adapters.codex.afterThisMuchInactivityRunnerdCheckpointsAndSusp", { defaultValue: "After this much inactivity, runnerd checkpoints and suspends the provider session. The maximum is 24 hours." })}
        >
          {isCreate ? (
            <input
              type="number"
              min={1}
              max={PAPERCLIP_RUNNER_IDLE_TIMEOUT_MAX_MS}
              className={inputClass}
              value={runnerIdleTimeoutMs}
              onChange={(event) =>
                set!({
                  paperclipRunnerIdleTimeoutMs:
                    resolvePaperclipRunnerIdleTimeoutMs(
                      Number(event.target.value),
                    ),
                })
              }
            />
          ) : (
            <DraftNumberInput
              value={runnerIdleTimeoutMs}
              min={1}
              max={PAPERCLIP_RUNNER_IDLE_TIMEOUT_MAX_MS}
              onCommit={(value) =>
                mark(
                  "adapterConfig",
                  "idleTimeoutMs",
                  resolvePaperclipRunnerIdleTimeoutMs(value),
                )
              }
              immediate
              className={inputClass}
            />
          )}
        </Field>
      )}
      {acpSelected && (
        <>
          {!managedSandboxOnly && (
            <Field configSection="advanced"
              label={t("adapters.codex.acpServerCommand", { defaultValue: "ACP server command" })}
              hint={t("adapters.codex.optionalOverrideForTheCodexAcpServerCommandDefau", { defaultValue: "Optional override for the Codex ACP server command. Defaults to the package-local codex-acp binary." })}
            >
              <DraftInput
                value={
                  isCreate
                    ? (values!.codexAcpAgentCommand ?? "")
                    : eff(
                        "adapterConfig",
                        "agentCommand",
                        String(config.agentCommand ?? ""),
                      )
                }
                onCommit={(v) =>
                  isCreate
                    ? set!({ codexAcpAgentCommand: v })
                    : mark("adapterConfig", "agentCommand", v || undefined)
                }
                immediate
                className={inputClass}
                placeholder="codex-acp"
              />
            </Field>
          )}
          <Field configSection="runPolicy"
            label={t("adapters.codex.acpSessionMode", { defaultValue: "ACP session mode" })}
            hint={t("adapters.codex.persistentKeepsAcpSessionStateBetweenRunsOneShot", { defaultValue: "Persistent keeps ACP session state between runs. One-shot starts fresh each run." })}
          >
            <select
              className={inputClass}
              value={
                isCreate
                  ? (values!.codexAcpMode ?? "persistent")
                  : eff(
                      "adapterConfig",
                      "mode",
                      String(config.mode ?? "persistent"),
                    )
              }
              onChange={(e) => {
                const value =
                  e.target.value === "oneshot" ? "oneshot" : "persistent";
                isCreate
                  ? set!({ codexAcpMode: value })
                  : mark("adapterConfig", "mode", value);
              }}
            >
              <option value="persistent">{t("adapters.codex.persistent", { defaultValue: "Persistent" })}</option>
              <option value="oneshot">{t("adapters.codex.oneShot", { defaultValue: "One-shot" })}</option>
            </select>
          </Field>
          <Field
            label={t("adapters.codex.acpNonInteractivePermissions", { defaultValue: "ACP non-interactive permissions" })}
            hint={t("adapters.codex.fallbackIfTheAcpAgentAsksForInputOutsideAnIntera", { defaultValue: "Fallback if the ACP agent asks for input outside an interactive session." })}
          >
            <select
              className={inputClass}
              value={
                isCreate
                  ? (values!.codexAcpNonInteractivePermissions ?? "deny")
                  : eff(
                      "adapterConfig",
                      "nonInteractivePermissions",
                      String(config.nonInteractivePermissions ?? "deny"),
                    )
              }
              onChange={(e) => {
                const value = e.target.value === "fail" ? "fail" : "deny";
                isCreate
                  ? set!({ codexAcpNonInteractivePermissions: value })
                  : mark("adapterConfig", "nonInteractivePermissions", value);
              }}
            >
              <option value="deny">{t("adapters.codex.deny", { defaultValue: "Deny" })}</option>
              <option value="fail">{t("adapters.codex.fail", { defaultValue: "Fail" })}</option>
            </select>
          </Field>
          {!managedSandboxOnly && (
            <Field
              label={t("adapters.codex.acpStateDirectory", { defaultValue: "ACP state directory" })}
              hint={t("adapters.codex.optionalAcpSessionStateDirectoryDefaultsToPaperc", { defaultValue: "Optional ACP session state directory. Defaults to Paperclip-managed organization/agent scoped storage." })}
            >
              <div className="flex items-center gap-2">
                <DraftInput
                  value={
                    isCreate
                      ? (values!.codexAcpStateDir ?? "")
                      : eff(
                          "adapterConfig",
                          "stateDir",
                          String(config.stateDir ?? ""),
                        )
                  }
                  onCommit={(v) =>
                    isCreate
                      ? set!({ codexAcpStateDir: v })
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
            label={t("adapters.codex.acpWarmProcessIdleMs", { defaultValue: "ACP warm process idle ms" })}
            hint={t("adapters.codex.defaultsTo0WhichClosesTheAcpProcessAfterEachRunW", { defaultValue: "Defaults to 0, which closes the ACP process after each run while retaining persistent session state." })}
          >
            {isCreate ? (
              <input
                type="number"
                className={inputClass}
                value={values!.codexAcpWarmHandleIdleMs ?? 0}
                onChange={(e) =>
                  set!({ codexAcpWarmHandleIdleMs: Number(e.target.value) })
                }
              />
            ) : (
              <DraftNumberInput
                value={eff(
                  "adapterConfig",
                  "warmHandleIdleMs",
                  Number(config.warmHandleIdleMs ?? 0),
                )}
                onCommit={(v) =>
                  mark("adapterConfig", "warmHandleIdleMs", v || 0)
                }
                immediate
                className={inputClass}
              />
            )}
          </Field>
        </>
      )}
      {!runnerManaged && !hideInstructionsFile && (
        <Field label={t("adapters.codex.agentInstructionsFile", { defaultValue: "Agent instructions file" })} hint={instructionsFileHint}>
          <div className="flex items-center gap-2">
            <DraftInput
              value={
                isCreate
                  ? (values!.instructionsFilePath ?? "")
                  : eff(
                      "adapterConfig",
                      "instructionsFilePath",
                      String(config.instructionsFilePath ?? ""),
                    )
              }
              onCommit={(v) =>
                isCreate
                  ? set!({ instructionsFilePath: v })
                  : mark(
                      "adapterConfig",
                      "instructionsFilePath",
                      v || undefined,
                    )
              }
              immediate
              className={inputClass}
              placeholder="/absolute/path/to/AGENTS.md"
            />
            <ChoosePathButton />
          </div>
        </Field>
      )}
      {!runnerManaged && (
        <>
          <ToggleField
            label={t("adapters.codex.bypassSandbox", { defaultValue: "Bypass sandbox" })}
            hint={help.dangerouslyBypassSandbox}
            checked={
              isCreate
                ? values!.dangerouslyBypassSandbox
                : eff(
                    "adapterConfig",
                    "dangerouslyBypassApprovalsAndSandbox",
                    bypassEnabled,
                  )
            }
            onChange={(v) =>
              isCreate
                ? set!({ dangerouslyBypassSandbox: v })
                : mark(
                    "adapterConfig",
                    "dangerouslyBypassApprovalsAndSandbox",
                    v,
                  )
            }
          />
          <ToggleField
            label={t("adapters.codex.enableSearch", { defaultValue: "Enable search" })}
            hint={help.search}
            checked={
              isCreate
                ? values!.search
                : eff("adapterConfig", "search", !!config.search)
            }
            onChange={(v) =>
              isCreate
                ? set!({ search: v })
                : mark("adapterConfig", "search", v)
            }
          />
          <ToggleField
            label={t("adapters.codex.fastMode", { defaultValue: "Fast mode" })}
            hint={help.fastMode}
            checked={fastModeEnabled}
            onChange={(v) =>
              isCreate
                ? set!({ fastMode: v })
                : mark("adapterConfig", "fastMode", v)
            }
          />
          {fastModeEnabled && (
            <div className="rounded-md border border-amber-300/70 bg-amber-50/80 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
              {fastModeMessage}
            </div>
          )}
        </>
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
