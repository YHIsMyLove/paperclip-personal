import { useWorkspaceIsolationControls } from "@/hooks/useWorkspaceIsolationControls";
import { useEffect, useState, type ReactNode } from "react";
import { t } from "@/i18n";
import { environmentDisplayLabel, filterManagedSandboxSelectableEnvironments } from "@/lib/managed-sandbox-environment";
import { Link } from "@/lib/router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Project, SharedWorkspaceConcurrency } from "@paperclipai/shared";
import { ProjectRepositories } from "./ProjectRepositories";
import { cn, formatDate } from "../lib/utils";
import { environmentsApi } from "../api/environments";
import { instanceSettingsApi } from "../api/instanceSettings";
import { projectsApi } from "../api/projects";
import { secretsApi } from "../api/secrets";
import { useCompany } from "../context/CompanyContext";
import { queryKeys } from "../lib/queryKeys";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertCircle, Archive, ArchiveRestore, Check, ExternalLink, Loader2, Trash2 } from "lucide-react";
import { ChoosePathButton } from "./PathInstructionsModal";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { DraftInput } from "./agent-config-primitives";
import { InlineEditor } from "./InlineEditor";
import { EnvironmentVariablesEditor } from "./environment-variables-editor";
import { Badge } from "@/components/ui/badge";

interface ProjectPropertiesProps {
  project: Project;
  repositories?: ReactNode;
  onUpdate?: (data: Record<string, unknown>) => void;
  onFieldUpdate?: (field: ProjectConfigFieldKey, data: Record<string, unknown>) => void;
  getFieldSaveState?: (field: ProjectConfigFieldKey) => ProjectFieldSaveState;
  onArchive?: (archived: boolean) => void;
  archivePending?: boolean;
}

export type ProjectFieldSaveState = "idle" | "saving" | "saved" | "error";
export type ProjectConfigFieldKey =
  | "name"
  | "description"
  | "status"
  | "goals"
  | "env"
  | "execution_workspace_enabled"
  | "execution_workspace_default_mode"
  | "execution_workspace_shared_concurrency"
  | "execution_workspace_environment"
  | "execution_workspace_base_ref"
  | "execution_workspace_branch_template"
  | "execution_workspace_worktree_parent_dir"
  | "execution_workspace_provision_command"
  | "execution_workspace_runtime_provision_command"
  | "execution_workspace_teardown_command";

const SHARED_WORKSPACE_CONCURRENCY_OPTIONS: {
  value: SharedWorkspaceConcurrency;
  label: string;
  help: string;
}[] = [
  {
    value: "auto",
    label: "Auto",
    help: "Concurrent runs on local/SSH runners; runs take turns in cloud environments.",
  },
  {
    value: "serialize",
    label: "Serialize",
    help: "Sandbox runs take turns in the shared project workspace. Local/SSH folders allow concurrent runs.",
  },
  {
    value: "allow",
    label: "Allow",
    help: "Runs never wait for the workspace; concurrent edits are possible.",
  },
];

function SaveIndicator({ state }: { state: ProjectFieldSaveState }) {
  if (state === "saving") {
    return (
      <span className="inline-flex items-center gap-1 text-(length:--text-micro) text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />{t("projectProps.saving", { defaultValue: "Saving" })}</span>
    );
  }
  if (state === "saved") {
    return (
      <span className="inline-flex items-center gap-1 text-(length:--text-micro) text-green-600 dark:text-green-400">
        <Check className="h-3 w-3" />{t("projectProps.saved", { defaultValue: "Saved" })}</span>
    );
  }
  if (state === "error") {
    return (
      <span className="inline-flex items-center gap-1 text-(length:--text-micro) text-destructive">
        <AlertCircle className="h-3 w-3" />{t("projectProps.failed", { defaultValue: "Failed" })}</span>
    );
  }
  return null;
}

function FieldLabel({
  label,
  state,
}: {
  label: string;
  state: ProjectFieldSaveState;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <SaveIndicator state={state} />
    </div>
  );
}

function PropertyRow({
  label,
  children,
  alignStart = false,
  valueClassName = "",
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  alignStart?: boolean;
  valueClassName?: string;
}) {
  return (
    <div className={cn("flex gap-3 py-1.5 items-start")}>
      <div className="shrink-0 w-20 mt-0.5">{label}</div>
      <div className={cn("min-w-0 flex-1", alignStart ? "pt-0.5" : "flex items-center gap-1.5 flex-wrap", valueClassName)}>
        {children}
      </div>
    </div>
  );
}

function ArchiveDangerZone({
  project,
  onArchive,
  archivePending,
}: {
  project: Project;
  onArchive: (archived: boolean) => void;
  archivePending?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const isArchive = !project.archivedAt;
  const action = isArchive ? "Archive" : "Unarchive";

  return (
    <div className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-4">
      <p className="text-sm text-muted-foreground">
        {isArchive
          ? "Archive this project to hide it from the sidebar and project selectors."
          : "Unarchive this project to restore it in the sidebar and project selectors."}
      </p>
      {archivePending ? (
        <Button size="sm" variant="destructive" disabled>
          <Loader2 className="h-3 w-3 animate-spin mr-1" />
          {isArchive ? "Archiving..." : "Unarchiving..."}
        </Button>
      ) : confirming ? (
        <div className="flex items-center gap-2">
          <span className="text-sm text-destructive font-medium">
            {action} &ldquo;{project.name}&rdquo;?
          </span>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => {
              setConfirming(false);
              onArchive(isArchive);
            }}
          >{t("projectProps.confirm", { defaultValue: "Confirm" })}</Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setConfirming(false)}
          >{t("projectProps.cancel", { defaultValue: "Cancel" })}</Button>
        </div>
      ) : (
        <Button
          size="sm"
          variant="destructive"
          onClick={() => setConfirming(true)}
        >
          {isArchive ? (
            <><Archive className="h-3 w-3 mr-1" />{action} project</>
          ) : (
            <><ArchiveRestore className="h-3 w-3 mr-1" />{action} project</>
          )}
        </Button>
      )}
    </div>
  );
}

/**
 * One editable local-folder row.
 *
 * Inline edit rather than a modal: a project may hold several of these, and
 * making each one a dialog turns adding a second folder into a multi-step
 * errand for something that is a single field.
 */
function LocalFolderRow({
  cwd,
  pending,
  onSave,
  onRemove,
}: {
  cwd: string;
  pending: boolean;
  onSave: (cwd: string) => void;
  onRemove: () => void;
}) {
  const [draft, setDraft] = useState(cwd);
  const [editing, setEditing] = useState(false);

  // Follow the row when the value changes underneath us — a mutation landing
  // from another tab, or a save of this row.
  useEffect(() => {
    setDraft(cwd);
  }, [cwd]);

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 break-all font-mono text-xs text-muted-foreground">{cwd}</div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="xs"
            className="h-6 px-2"
            disabled={pending}
            onClick={() => setEditing(true)}
          >{t("projectProps.edit", { defaultValue: "Edit" })}</Button>
          <Button
            variant="ghost"
            size="icon-xs"
            disabled={pending}
            onClick={onRemove}
            aria-label={`Remove local folder ${cwd}`}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        className="w-full rounded border border-border bg-transparent px-2 py-1 font-mono text-xs outline-none"
        value={draft}
        autoFocus
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onSave(draft);
            setEditing(false);
          } else if (event.key === "Escape") {
            event.preventDefault();
            setDraft(cwd);
            setEditing(false);
          }
        }}
      />
      <Button
        variant="outline"
        size="xs"
        className="h-6 px-2"
        disabled={pending || draft.trim() === cwd}
        onClick={() => {
          onSave(draft);
          setEditing(false);
        }}
      >{t("projectProps.save", { defaultValue: "Save" })}</Button>
      <Button
        variant="ghost"
        size="xs"
        className="h-6 px-2"
        disabled={pending}
        onClick={() => {
          setDraft(cwd);
          setEditing(false);
        }}
      >{t("projectProps.cancel", { defaultValue: "Cancel" })}</Button>
    </div>
  );
}

export function ProjectProperties({ project, repositories, onUpdate, onFieldUpdate, getFieldSaveState, onArchive, archivePending }: ProjectPropertiesProps) {
  const { visible: workspaceIsolationControlsVisible } = useWorkspaceIsolationControls();
  const { selectedCompanyId } = useCompany();
  const queryClient = useQueryClient();
  const [executionWorkspaceAdvancedOpen, setExecutionWorkspaceAdvancedOpen] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<"local" | "add-local" | null>(null);
  const [workspaceCwd, setWorkspaceCwd] = useState("");
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);

  const commitField = (field: ProjectConfigFieldKey, data: Record<string, unknown>) => {
    if (onFieldUpdate) {
      onFieldUpdate(field, data);
      return;
    }
    onUpdate?.(data);
  };
  const fieldState = (field: ProjectConfigFieldKey): ProjectFieldSaveState => getFieldSaveState?.(field) ?? "idle";

  const { data: experimentalSettings } = useQuery({
    queryKey: queryKeys.instance.experimentalSettings,
    queryFn: () => instanceSettingsApi.getExperimental(),
    retry: false,
  });
  const environmentsEnabled = experimentalSettings?.enableEnvironments === true;
  const { data: availableSecrets = [] } = useQuery({
    queryKey: selectedCompanyId ? queryKeys.secrets.list(selectedCompanyId) : ["secrets", "none"],
    queryFn: () => secretsApi.list(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
  });
  const { data: userSecretDefinitions = [] } = useQuery({
    queryKey: selectedCompanyId
      ? queryKeys.secrets.userDefinitions(selectedCompanyId)
      : ["user-secret-definitions", "none"],
    queryFn: () => secretsApi.listUserSecretDefinitions(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
    retry: false,
  });
  const createSecret = useMutation({
    mutationFn: (input: { name: string; value: string }) => {
      if (!selectedCompanyId) throw new Error("Select an organization to create secrets");
      return secretsApi.create(selectedCompanyId, input);
    },
    onSuccess: () => {
      if (!selectedCompanyId) return;
      queryClient.invalidateQueries({ queryKey: queryKeys.secrets.list(selectedCompanyId) });
    },
  });
  const { data: environments } = useQuery({
    queryKey: queryKeys.environments.list(selectedCompanyId!),
    queryFn: () => environmentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId && environmentsEnabled,
  });

  const workspaces = project.workspaces ?? [];
  const codebase = project.codebase;
  const primaryCodebaseWorkspace = project.primaryWorkspace ?? null;
  /**
   * Every workspace row that carries a local path, primary first.
   *
   * A project is allowed several local folders — a main checkout, a mirror, a
   * scratch copy — alongside its one remote. `project.codebase` only ever
   * reports the primary row's `cwd`, so the full set has to come from
   * `workspaces` directly. Rendering only `codebase.localFolder` is what made it
   * look like only one local address was possible.
   */
  const localFolderWorkspaces = workspaces.filter(
    (workspace) => (workspace.cwd ?? "").trim().length > 0,
  );
  const additionalLocalFolderWorkspaces = localFolderWorkspaces.filter(
    (workspace) => workspace.id !== primaryCodebaseWorkspace?.id,
  );
  const hasAdditionalLegacyWorkspaces = workspaces.some((workspace) => workspace.id !== primaryCodebaseWorkspace?.id && !workspace.metadata?.githubRepositoryId);
  const executionWorkspacePolicy = project.executionWorkspacePolicy ?? null;
  const executionWorkspacesEnabled = executionWorkspacePolicy?.enabled === true;
  const isolatedWorkspacesEnabled = experimentalSettings?.enableIsolatedWorkspaces === true;
  const executionWorkspaceDefaultMode =
    executionWorkspacePolicy?.defaultMode === "isolated_workspace" ? "isolated_workspace" : "shared_workspace";
  // Absent/unset round-trips as "auto" — we only write a value once the user picks one.
  const executionWorkspaceSharedConcurrency: SharedWorkspaceConcurrency =
    executionWorkspacePolicy?.sharedWorkspaceConcurrency ?? "auto";
  const executionWorkspaceEnvironmentId = executionWorkspacePolicy?.environmentId ?? "";
  const executionWorkspaceStrategy = executionWorkspacePolicy?.workspaceStrategy ?? {
    type: "git_worktree",
    baseRef: "",
    branchTemplate: "",
    worktreeParentDir: "",
  };
  // Defense in depth alongside the server's managed-sandbox-only read
  // filter: a cached environments list may still carry the local row.
  const managedSandboxOnly = experimentalSettings?.enableManagedSandboxOnly === true;
  // The gate for the host-path surfaces below. It fails closed whenever the
  // policy is unknown — in flight and also on a failed read: an unresolved
  // policy reads as "not managed", which would show the local folder the policy
  // exists to hide.
  const hideHostPaths = experimentalSettings === undefined || managedSandboxOnly;
  const runSelectableEnvironments = filterManagedSandboxSelectableEnvironments(
    environments ?? [],
    managedSandboxOnly,
  ).filter((environment) => {
    if (environment.driver === "local" || environment.driver === "ssh") return true;
    if (environment.driver !== "sandbox") return false;
    const provider = typeof environment.config?.provider === "string" ? environment.config.provider : null;
    return provider !== null && provider !== "fake";
  });
  const showExecutionWorkspaceEnvironmentControl = environmentsEnabled && runSelectableEnvironments.length > 1;

  const invalidateProject = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(project.id) });
    if (project.urlKey !== project.id) {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(project.urlKey) });
    }
    if (selectedCompanyId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all(selectedCompanyId) });
    }
  };

  const createWorkspace = useMutation({
    mutationFn: (data: Record<string, unknown>) => projectsApi.createWorkspace(project.id, data),
    onSuccess: () => {
      setWorkspaceCwd("");
      setWorkspaceMode(null);
      setWorkspaceError(null);
      invalidateProject();
    },
  });

  const removeWorkspace = useMutation({
    mutationFn: (workspaceId: string) => projectsApi.removeWorkspace(project.id, workspaceId),
    onSuccess: () => {
      setWorkspaceCwd("");
      setWorkspaceMode(null);
      setWorkspaceError(null);
      invalidateProject();
    },
  });
  const updateWorkspace = useMutation({
    mutationFn: ({ workspaceId, data }: { workspaceId: string; data: Record<string, unknown> }) =>
      projectsApi.updateWorkspace(project.id, workspaceId, data),
    onSuccess: () => {
      setWorkspaceCwd("");
      setWorkspaceMode(null);
      setWorkspaceError(null);
      invalidateProject();
    },
  });

  const updateExecutionWorkspacePolicy = (patch: Record<string, unknown>) => {
    if (!onUpdate && !onFieldUpdate) return;
    return {
      executionWorkspacePolicy: {
        enabled: executionWorkspacesEnabled,
        defaultMode: executionWorkspaceDefaultMode,
        allowIssueOverride: executionWorkspacePolicy?.allowIssueOverride ?? true,
        ...executionWorkspacePolicy,
        ...patch,
      },
    };
  };

  const isAbsolutePath = (value: string) => value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value);

  const isSafeExternalUrl = (value: string | null | undefined) => {
    if (!value) return false;
    try {
      const parsed = new URL(value);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  };

  const deriveSourceType = (cwd: string | null, repoUrl: string | null) => {
    if (repoUrl) return "git_repo";
    if (cwd) return "local_path";
    return undefined;
  };

  const persistCodebase = (patch: { cwd?: string | null; repoUrl?: string | null }) => {
    const nextCwd = patch.cwd !== undefined ? patch.cwd : codebase.localFolder;
    const nextRepoUrl = patch.repoUrl !== undefined ? patch.repoUrl : codebase.repoUrl;
    if (!nextCwd && !nextRepoUrl) {
      if (primaryCodebaseWorkspace) {
        removeWorkspace.mutate(primaryCodebaseWorkspace.id);
      }
      return;
    }

    const data: Record<string, unknown> = {
      ...(patch.cwd !== undefined ? { cwd: patch.cwd } : {}),
      ...(patch.repoUrl !== undefined ? { repoUrl: patch.repoUrl } : {}),
      ...(deriveSourceType(nextCwd, nextRepoUrl) ? { sourceType: deriveSourceType(nextCwd, nextRepoUrl) } : {}),
      isPrimary: true,
    };

    if (primaryCodebaseWorkspace) {
      updateWorkspace.mutate({ workspaceId: primaryCodebaseWorkspace.id, data });
      return;
    }

    createWorkspace.mutate(data);
  };

  const submitLocalWorkspace = () => {
    const cwd = workspaceCwd.trim();
    if (!cwd) {
      setWorkspaceError(null);
      persistCodebase({ cwd: null });
      return;
    }
    if (!isAbsolutePath(cwd)) {
      setWorkspaceError("Local folder must be a full absolute path.");
      return;
    }
    if (localFolderWorkspaces.some((workspace) => workspace.cwd === cwd)) {
      setWorkspaceError("That local folder is already on this project.");
      return;
    }
    setWorkspaceError(null);
    persistCodebase({ cwd });
  };

  /**
   * Add another local folder to the same project.
   *
   * Goes in as its own workspace row rather than overwriting the primary one, so
   * a project can hold several local addresses at once and only the primary
   * stays the default working location. `isPrimary: false` keeps the primary
   * from being reassigned out from under whatever agents are already running
   * there.
   */
  const submitAdditionalLocalWorkspace = () => {
    const cwd = workspaceCwd.trim();
    if (!isAbsolutePath(cwd)) {
      setWorkspaceError("Local folder must be a full absolute path.");
      return;
    }
    if (localFolderWorkspaces.some((workspace) => workspace.cwd === cwd)) {
      setWorkspaceError("That local folder is already on this project.");
      return;
    }
    setWorkspaceError(null);
    createWorkspace.mutate({ cwd, sourceType: "local_path", isPrimary: false });
    setWorkspaceCwd("");
    setWorkspaceMode(null);
  };

  const updateAdditionalLocalWorkspace = (workspaceId: string, cwd: string) => {
    const next = cwd.trim();
    if (!isAbsolutePath(next)) {
      setWorkspaceError("Local folder must be a full absolute path.");
      return;
    }
    if (localFolderWorkspaces.some((workspace) => workspace.id !== workspaceId && workspace.cwd === next)) {
      setWorkspaceError("That local folder is already on this project.");
      return;
    }
    setWorkspaceError(null);
    updateWorkspace.mutate({ workspaceId, data: { cwd: next } });
  };

  const removeLocalWorkspace = (workspace: { id: string; cwd: string | null }, isPrimary: boolean) => {
    const confirmed = window.confirm(
      isPrimary && codebase.repoUrl
        ? "Clear the local folder from this workspace? The remote repository stays."
        : `Remove local folder ${workspace.cwd ?? ""} from this project?`,
    );
    if (!confirmed) return;
    if (isPrimary) {
      // Keep the repo: clearing only the folder is `cwd: null`, not a delete.
      persistCodebase({ cwd: null });
      return;
    }
    removeWorkspace.mutate(workspace.id);
  };

  return (
    <div>
      <div className="space-y-1 pb-4">
        <PropertyRow label={<FieldLabel label={t("projectProps.name", { defaultValue: "Name" })} state={fieldState("name")} />}>
          {onUpdate || onFieldUpdate ? (
            <DraftInput
              value={project.name}
              onCommit={(name) => commitField("name", { name })}
              immediate
              className="w-full rounded border border-border bg-transparent px-2 py-1 text-sm outline-none"
              placeholder={t("projectProps.projectName", { defaultValue: "Project name" })}
            />
          ) : (
            <span className="text-sm">{project.name}</span>
          )}
        </PropertyRow>
        <PropertyRow
          label={<FieldLabel label={t("projectProps.description", { defaultValue: "Description" })} state={fieldState("description")} />}
          alignStart
          valueClassName="space-y-0.5"
        >
          {onUpdate || onFieldUpdate ? (
            <InlineEditor
              value={project.description ?? ""}
              onSave={(description) => commitField("description", { description })}
              nullable
              as="p"
              className="text-sm text-muted-foreground"
              placeholder={t("projectProps.addADescription", { defaultValue: "Add a description..." })}
              multiline
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              {project.description?.trim() || "No description"}
            </p>
          )}
        </PropertyRow>
        {repositories ?? <ProjectRepositories key={project.id} project={project} />}
        <PropertyRow
          label={<FieldLabel label={t("projectProps.env", { defaultValue: "Env" })} state={fieldState("env")} />}
          alignStart
          valueClassName="space-y-2"
        >
          <div className="space-y-2">
            <EnvironmentVariablesEditor
              footerHint={null}
              value={project.env ?? {}}
              secrets={availableSecrets}
              userSecretDefinitions={userSecretDefinitions}
              onCreateSecret={async (name, value) => {
                const created = await createSecret.mutateAsync({ name, value });
                return created;
              }}
              onChange={(env) => commitField("env", { env: env ?? null })}
            />

          </div>
        </PropertyRow>
        <PropertyRow label={<FieldLabel label={t("projectProps.updated", { defaultValue: "Updated" })} state="idle" />}>
          <span className="text-sm">{formatDate(project.updatedAt)}</span>
        </PropertyRow>
        {project.targetDate && (
          <PropertyRow label={<FieldLabel label={t("projectProps.targetDate", { defaultValue: "Target Date" })} state="idle" />}>
            <span className="text-sm">{formatDate(project.targetDate)}</span>
          </PropertyRow>
        )}
      </div>

      <Separator className="my-4" />

      <div className="space-y-1 py-4">
        {(!hideHostPaths || (primaryCodebaseWorkspace?.runtimeServices?.length ?? 0) > 0) && <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>{t("projectProps.codebase", { defaultValue: "Codebase" })}</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-border text-(length:--text-nano) text-muted-foreground hover:text-foreground"
                  aria-label={t("projectProps.codebaseHelp", { defaultValue: "Codebase help" })}
                >
                  ?
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">
                {hideHostPaths
                  ? "Repo identifies the source of truth. Agents check it out in the platform-managed environment."
                  : "Repo identifies the source of truth. Local folder is the default place agents write code."}
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="space-y-2 rounded-md border border-border/70 p-3">
            {/*
              The local folder is an absolute path on the execution host. Under
              the managed-sandbox-only policy every agent runs in the
              platform-managed environment, so the path, the folder controls,
              and the edit panel below all disappear. A managed checkout keeps
              its one-line label so the codebase still reads as accounted for,
              but never renders the path itself.
            */}
            {hideHostPaths ? (
              codebase.origin === "managed_checkout" ? (
                <div className="text-(length:--text-micro) text-muted-foreground">{t("projectProps.paperclipManagedFolder", { defaultValue: "Paperclip-managed folder." })}</div>
              ) : null
            ) : (
              <div className="space-y-1">
                <div className="text-(length:--text-micro) uppercase tracking-wide text-muted-foreground">{t("projectProps.localFolder", { defaultValue: "Local folder" })}</div>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <div className="min-w-0 break-all font-mono text-xs text-muted-foreground">
                      {codebase.effectiveLocalFolder}
                    </div>
                    {codebase.origin === "managed_checkout" && (
                      <div className="text-(length:--text-micro) text-muted-foreground">{t("projectProps.paperclipManagedFolder", { defaultValue: "Paperclip-managed folder." })}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="xs"
                      className="h-6 px-2"
                      onClick={() => {
                        setWorkspaceMode("local");
                        setWorkspaceCwd(codebase.localFolder ?? "");
                        setWorkspaceError(null);
                      }}
                    >
                      {codebase.localFolder ? "Change local folder" : "Set local folder"}
                    </Button>
                    {codebase.localFolder ? (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => removeLocalWorkspace(primaryCodebaseWorkspace!, true)}
                        aria-label={t("projectProps.clearLocalFolder", { defaultValue: "Clear local folder" })}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    ) : null}
                  </div>
                </div>

                {/*
                  Additional local folders. Same project, same shape as the
                  primary — a workspace row carrying only a `cwd`. The primary
                  stays the default working location; these are extra addresses
                  agents can be pointed at.
                */}
                {additionalLocalFolderWorkspaces.length > 0 && (
                  <div className="space-y-1 pt-1">
                    <div className="text-(length:--text-micro) uppercase tracking-wide text-muted-foreground">{t("projectProps.additionalLocalFolders", { defaultValue: "Additional local folders" })}</div>
                    {additionalLocalFolderWorkspaces.map((workspace) => (
                      <LocalFolderRow
                        key={workspace.id}
                        cwd={workspace.cwd ?? ""}
                        pending={updateWorkspace.isPending || removeWorkspace.isPending}
                        onSave={(next) => updateAdditionalLocalWorkspace(workspace.id, next)}
                        onRemove={() => removeLocalWorkspace(workspace, false)}
                      />
                    ))}
                  </div>
                )}

                <Button
                  variant="ghost"
                  size="xs"
                  className="h-6 px-2"
                  onClick={() => {
                    setWorkspaceMode("add-local");
                    setWorkspaceCwd("");
                    setWorkspaceError(null);
                  }}
                >
                  + Add local folder
                </Button>
              </div>
            )}

            {/*
              Rows that exist without a `cwd` — an extra remote, or a
              GitHub-linked record. They are not local addresses, so they are
              listed rather than merged into the folders above.
            */}
            {hasAdditionalLegacyWorkspaces && (
              <div className="text-(length:--text-micro) text-muted-foreground">{t("projectProps.additionalLegacyWorkspaceRecordsExistOnThisProje", { defaultValue: "Additional legacy workspace records exist on this project. Paperclip is using the primary workspace as the codebase view." })}</div>
            )}

            {primaryCodebaseWorkspace?.runtimeServices && primaryCodebaseWorkspace.runtimeServices.length > 0 ? (
              <div className="space-y-1">
                {primaryCodebaseWorkspace.runtimeServices.map((service) => (
                  <div
                    key={service.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2 py-1"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-(length:--text-micro) font-medium">{service.serviceName}</span>
                        <Badge variant="ghost"
                          className={cn(
                            "px-1.5 text-(length:--text-nano) uppercase tracking-wide",
                            service.status === "running"
                              ? "bg-green-500/15 text-green-700 dark:text-green-300"
                              : service.status === "failed"
                                ? "bg-red-500/15 text-red-700 dark:text-red-300"
                                : "bg-muted text-muted-foreground",
                          )}
                        >
                          {service.status}
                        </Badge>
                      </div>
                      <div className="text-(length:--text-micro) text-muted-foreground">
                        {service.url ? (
                          <a
                            href={service.url}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:text-foreground hover:underline"
                          >
                            {service.url}
                          </a>
                        ) : (
                          service.command ?? "No URL"
                        )}
                      </div>
                      {service.exposure && service.exposure.state !== "removed" ? (
                        <div
                          className={cn(
                            "text-(length:--text-nano)",
                            service.exposure.state === "failed" || service.exposure.state === "cleanup_pending"
                              ? "text-destructive"
                              : "text-muted-foreground",
                          )}
                        >
                          HTTPS {service.exposure.state.replace("_", " ")}
                        </div>
                      ) : null}
                    </div>
                    <div className="text-(length:--text-nano) text-muted-foreground whitespace-nowrap">
                      {service.lifecycle}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          {!hideHostPaths && workspaceMode !== null && (
            <div className="space-y-1.5 rounded-md border border-border p-2">
              <div className="flex items-center gap-2">
                <input
                  className="w-full rounded border border-border bg-transparent px-2 py-1 text-xs font-mono outline-none"
                  value={workspaceCwd}
                  onChange={(e) => setWorkspaceCwd(e.target.value)}
                  placeholder="/absolute/path/to/workspace"
                />
                <ChoosePathButton />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="xs"
                  className="h-6 px-2"
                  disabled={
                    workspaceMode === "add-local"
                      // An added folder must be a real path. The primary can be
                      // blank because blank means "remove the folder".
                      ? !workspaceCwd.trim() || createWorkspace.isPending
                      : (!workspaceCwd.trim() && !primaryCodebaseWorkspace) ||
                        createWorkspace.isPending ||
                        updateWorkspace.isPending
                  }
                  onClick={workspaceMode === "add-local" ? submitAdditionalLocalWorkspace : submitLocalWorkspace}
                >
                  {workspaceMode === "add-local" ? "Add folder" : "Save"}
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  className="h-6 px-2"
                  onClick={() => {
                    setWorkspaceMode(null);
                    setWorkspaceCwd("");
                    setWorkspaceError(null);
                  }}
                >{t("projectProps.cancel", { defaultValue: "Cancel" })}</Button>
              </div>
            </div>
          )}
          {workspaceError && (
            <p className="text-xs text-destructive">{workspaceError}</p>
          )}
          {createWorkspace.isError && (
            <p className="text-xs text-destructive">{t("projectProps.failedToSaveWorkspace", { defaultValue: "Failed to save workspace." })}</p>
          )}
          {removeWorkspace.isError && (
            <p className="text-xs text-destructive">{t("projectProps.failedToDeleteWorkspace", { defaultValue: "Failed to delete workspace." })}</p>
          )}
          {updateWorkspace.isError && (
            <p className="text-xs text-destructive">{t("projectProps.failedToUpdateWorkspace", { defaultValue: "Failed to update workspace." })}</p>
          )}
        </div>}

        {isolatedWorkspacesEnabled && workspaceIsolationControlsVisible ? (
          <>
            <Separator className="my-4" />

            <div className="py-1.5 space-y-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>{t("projectProps.executionWorkspaces", { defaultValue: "Execution Workspaces" })}</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-border text-(length:--text-nano) text-muted-foreground hover:text-foreground"
                      aria-label={t("projectProps.executionWorkspacesHelp", { defaultValue: "Execution workspaces help" })}
                    >
                      ?
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">{t("projectProps.projectOwnedDefaultsForIsolatedTaskCheckoutsAndE", { defaultValue: "Project-owned defaults for isolated task checkouts and execution workspace behavior." })}</TooltipContent>
                </Tooltip>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <span>{t("projectProps.enableIsolatedTaskCheckouts", { defaultValue: "Enable isolated task checkouts" })}</span>
                      <SaveIndicator state={fieldState("execution_workspace_enabled")} />
                    </div>
                    <div className="text-xs text-muted-foreground">{t("projectProps.letTasksChooseBetweenTheProjectsPrimaryCheckoutA", { defaultValue: "Let tasks choose between the project's primary checkout and an isolated execution workspace." })}</div>
                  </div>
                  {onUpdate || onFieldUpdate ? (
                    <ToggleSwitch
                      checked={executionWorkspacesEnabled}
                      onCheckedChange={() =>
                        commitField(
                          "execution_workspace_enabled",
                          updateExecutionWorkspacePolicy({ enabled: !executionWorkspacesEnabled })!,
                        )}
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {executionWorkspacesEnabled ? "Enabled" : "Disabled"}
                    </span>
                  )}
                </div>

                {executionWorkspacesEnabled ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2 text-sm">
                          <span>{t("projectProps.newTasksDefaultToIsolatedCheckout", { defaultValue: "New tasks default to isolated checkout" })}</span>
                          <SaveIndicator state={fieldState("execution_workspace_default_mode")} />
                        </div>
                        <div className="text-(length:--text-micro) text-muted-foreground">{t("projectProps.ifDisabledNewTasksStayOnTheProjectsPrimaryChecko", { defaultValue: "If disabled, new tasks stay on the project's primary checkout unless someone opts in." })}</div>
                      </div>
                      <ToggleSwitch
                        checked={executionWorkspaceDefaultMode === "isolated_workspace"}
                        onCheckedChange={() =>
                          commitField(
                            "execution_workspace_default_mode",
                            updateExecutionWorkspacePolicy({
                              defaultMode:
                                executionWorkspaceDefaultMode === "isolated_workspace"
                                  ? "shared_workspace"
                                  : "isolated_workspace",
                            })!,
                          )}
                      />
                    </div>

                    <div className="space-y-0.5">
                      <div className="mb-1 flex items-center gap-1.5">
                        <label className="flex items-center gap-2 text-sm">
                          <span>{t("projectProps.sharedWorkspaceConcurrency", { defaultValue: "Shared workspace concurrency" })}</span>
                          <SaveIndicator state={fieldState("execution_workspace_shared_concurrency")} />
                        </label>
                      </div>
                      {onUpdate || onFieldUpdate ? (
                        <select
                          className="w-full rounded border border-border bg-transparent px-2 py-1 text-xs outline-none"
                          aria-label={t("projectProps.sharedWorkspaceConcurrency", { defaultValue: "Shared workspace concurrency" })}
                          value={executionWorkspaceSharedConcurrency}
                          onChange={(e) =>
                            commitField(
                              "execution_workspace_shared_concurrency",
                              updateExecutionWorkspacePolicy({
                                sharedWorkspaceConcurrency: e.target.value as SharedWorkspaceConcurrency,
                              })!,
                            )}
                        >
                          {SHARED_WORKSPACE_CONCURRENCY_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="text-xs">
                          {SHARED_WORKSPACE_CONCURRENCY_OPTIONS.find(
                            (option) => option.value === executionWorkspaceSharedConcurrency,
                          )?.label}
                        </div>
                      )}
                      <p className="text-(length:--text-micro) text-muted-foreground">
                        {SHARED_WORKSPACE_CONCURRENCY_OPTIONS.find(
                          (option) => option.value === executionWorkspaceSharedConcurrency,
                        )?.help}
                      </p>
                    </div>

                    <div className="border-t border-border/60 pt-2">
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                        onClick={() => setExecutionWorkspaceAdvancedOpen((open) => !open)}
                      >
                        {executionWorkspaceAdvancedOpen
                          ? "Hide advanced checkout settings"
                          : "Show advanced checkout settings"}
                      </button>
                    </div>

                    {executionWorkspaceAdvancedOpen ? (
                      <div className="space-y-3">
                        <div className="text-xs text-muted-foreground">{t("projectProps.hostManagedImplementation", { defaultValue: "Host-managed implementation:" })} <span className="text-foreground">{t("projectProps.gitWorktree", { defaultValue: "Git worktree" })}</span>
                        </div>
                        {showExecutionWorkspaceEnvironmentControl ? (
                          <div>
                            <div className="mb-1 flex items-center gap-1.5">
                              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>{t("projectProps.environment", { defaultValue: "Environment" })}</span>
                                <SaveIndicator state={fieldState("execution_workspace_environment")} />
                              </label>
                            </div>
                            <select
                              className="w-full rounded border border-border bg-transparent px-2 py-1 text-xs outline-none"
                              value={executionWorkspaceEnvironmentId}
                              onChange={(e) =>
                                commitField(
                                  "execution_workspace_environment",
                                  updateExecutionWorkspacePolicy({
                                    environmentId: e.target.value || null,
                                  })!,
                                )}
                            >
                              <option value="">{t("projectProps.noEnvironment", { defaultValue: "No environment" })}</option>
                              {runSelectableEnvironments.map((environment) => (
                                <option key={environment.id} value={environment.id}>
                                  {environmentDisplayLabel(environment)}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : null}
                        <div>
                          <div className="mb-1 flex items-center gap-1.5">
                            <label className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{t("projectProps.baseRef", { defaultValue: "Base ref" })}</span>
                              <SaveIndicator state={fieldState("execution_workspace_base_ref")} />
                            </label>
                          </div>
                          <DraftInput
                            value={executionWorkspaceStrategy.baseRef ?? ""}
                            onCommit={(value) =>
                              commitField("execution_workspace_base_ref", {
                                ...updateExecutionWorkspacePolicy({
                                  workspaceStrategy: {
                                    ...executionWorkspaceStrategy,
                                    type: "git_worktree",
                                    baseRef: value || null,
                                  },
                                })!,
                              })}
                            immediate
                            className="w-full rounded border border-border bg-transparent px-2 py-1 text-xs font-mono outline-none"
                            placeholder={t("projectProps.originMain", { defaultValue: "origin/main" })}
                          />
                        </div>
                        <div>
                          <div className="mb-1 flex items-center gap-1.5">
                            <label className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{t("projectProps.branchTemplate", { defaultValue: "Branch template" })}</span>
                              <SaveIndicator state={fieldState("execution_workspace_branch_template")} />
                            </label>
                          </div>
                          <DraftInput
                            value={executionWorkspaceStrategy.branchTemplate ?? ""}
                            onCommit={(value) =>
                              commitField("execution_workspace_branch_template", {
                                ...updateExecutionWorkspacePolicy({
                                  workspaceStrategy: {
                                    ...executionWorkspaceStrategy,
                                    type: "git_worktree",
                                    branchTemplate: value || null,
                                  },
                                })!,
                              })}
                            immediate
                            className="w-full rounded border border-border bg-transparent px-2 py-1 text-xs font-mono outline-none"
                            placeholder="{{issue.identifier}}-{{slug}}"
                          />
                        </div>
                        <div>
                          <div className="mb-1 flex items-center gap-1.5">
                            <label className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{t("projectProps.worktreeParentDir", { defaultValue: "Worktree parent dir" })}</span>
                              <SaveIndicator state={fieldState("execution_workspace_worktree_parent_dir")} />
                            </label>
                          </div>
                          <DraftInput
                            value={executionWorkspaceStrategy.worktreeParentDir ?? ""}
                            onCommit={(value) =>
                              commitField("execution_workspace_worktree_parent_dir", {
                                ...updateExecutionWorkspacePolicy({
                                  workspaceStrategy: {
                                    ...executionWorkspaceStrategy,
                                    type: "git_worktree",
                                    worktreeParentDir: value || null,
                                  },
                                })!,
                              })}
                            immediate
                            className="w-full rounded border border-border bg-transparent px-2 py-1 text-xs font-mono outline-none"
                            placeholder=".paperclip/worktrees"
                          />
                        </div>
                        <div>
                          <div className="mb-1 flex items-center gap-1.5">
                            <label className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{t("projectProps.provisionCommand", { defaultValue: "Provision command" })}</span>
                              <SaveIndicator state={fieldState("execution_workspace_provision_command")} />
                            </label>
                          </div>
                          <DraftInput
                            value={executionWorkspaceStrategy.provisionCommand ?? ""}
                            onCommit={(value) =>
                              commitField("execution_workspace_provision_command", {
                                ...updateExecutionWorkspacePolicy({
                                  workspaceStrategy: {
                                    ...executionWorkspaceStrategy,
                                    type: "git_worktree",
                                    provisionCommand: value || null,
                                  },
                                })!,
                              })}
                            immediate
                            className="w-full rounded border border-border bg-transparent px-2 py-1 text-xs font-mono outline-none"
                            placeholder={t("projectProps.bashScriptsProvisionWorktreeSh", { defaultValue: "bash ./scripts/provision-worktree.sh" })}
                          />
                        </div>
                        <div>
                          <div className="mb-1 flex items-center gap-1.5">
                            <label className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{t("projectProps.runtimeProvisionCommand", { defaultValue: "Runtime provision command" })}</span>
                              <SaveIndicator state={fieldState("execution_workspace_runtime_provision_command")} />
                            </label>
                          </div>
                          <DraftInput
                            value={executionWorkspaceStrategy.runtimeProvisionCommand ?? ""}
                            onCommit={(value) =>
                              commitField("execution_workspace_runtime_provision_command", {
                                ...updateExecutionWorkspacePolicy({
                                  workspaceStrategy: {
                                    ...executionWorkspaceStrategy,
                                    type: "git_worktree",
                                    runtimeProvisionCommand: value || null,
                                  },
                                })!,
                              })}
                            immediate
                            className="w-full rounded border border-border bg-transparent px-2 py-1 text-xs font-mono outline-none"
                            placeholder={t("projectProps.bashScriptsProvisionWorktreeRuntimeSh", { defaultValue: "bash ./scripts/provision-worktree-runtime.sh" })}
                          />
                          <p className="mt-1 text-xs text-muted-foreground">
                            Runs once before the first runtime-service start (heavy setup, e.g. DB seed). Leave empty to keep eager provisioning.
                          </p>
                        </div>
                        <div>
                          <div className="mb-1 flex items-center gap-1.5">
                            <label className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{t("projectProps.teardownCommand", { defaultValue: "Teardown command" })}</span>
                              <SaveIndicator state={fieldState("execution_workspace_teardown_command")} />
                            </label>
                          </div>
                          <DraftInput
                            value={executionWorkspaceStrategy.teardownCommand ?? ""}
                            onCommit={(value) =>
                              commitField("execution_workspace_teardown_command", {
                                ...updateExecutionWorkspacePolicy({
                                  workspaceStrategy: {
                                    ...executionWorkspaceStrategy,
                                    type: "git_worktree",
                                    teardownCommand: value || null,
                                  },
                                })!,
                              })}
                            immediate
                            className="w-full rounded border border-border bg-transparent px-2 py-1 text-xs font-mono outline-none"
                            placeholder={t("projectProps.bashScriptsTeardownWorktreeSh", { defaultValue: "bash ./scripts/teardown-worktree.sh" })}
                          />
                        </div>
                        <p className="text-(length:--text-micro) text-muted-foreground">{t("projectProps.provisionRunsInsideTheDerivedWorktreeBeforeAgent", { defaultValue: "Provision runs inside the derived worktree before agent execution. Teardown is stored here for future cleanup flows." })}</p>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </>
        ) : null}

      </div>

      {onArchive && (
        <>
          <Separator className="my-4" />
          <div className="space-y-4 py-4">
            <div className="text-xs font-medium text-destructive uppercase tracking-wide">{t("projectProps.dangerZone", { defaultValue: "Danger Zone" })}</div>
            <ArchiveDangerZone
              project={project}
              onArchive={onArchive}
              archivePending={archivePending}
            />
          </div>
        </>
      )}
        <PropertyRow label={<FieldLabel label={t("projectProps.created", { defaultValue: "Created" })} state="idle" />}>
          <span className="text-sm">{formatDate(project.createdAt)}</span>
        </PropertyRow>
    </div>
  );
}
