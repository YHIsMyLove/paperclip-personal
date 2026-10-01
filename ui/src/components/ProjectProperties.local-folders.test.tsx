// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Project } from "@paperclipai/shared";
import type { ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectProperties } from "./ProjectProperties";
import { TooltipProvider } from "@/components/ui/tooltip";
import { queryKeys } from "../lib/queryKeys";

/**
 * A project carries several local addresses alongside its one remote.
 *
 * `project.codebase` only reports the primary workspace's `cwd`, so the
 * additional folders have to come from `workspaces`. These tests pin that they
 * are both listed and editable, because rendering only `codebase.localFolder`
 * is what made a project look like it accepted a single local path.
 */

// `vi.mock` is hoisted above module-level `const`, so the spies have to be
// hoisted with it or the factory closes over an uninitialized binding.
const { createWorkspace, updateWorkspace, removeWorkspace } = vi.hoisted(() => ({
  createWorkspace: vi.fn(async () => ({ id: "workspace-new" })),
  updateWorkspace: vi.fn(async () => ({})),
  removeWorkspace: vi.fn(async () => ({})),
}));

vi.mock("../api/projects", () => ({
  projectsApi: { createWorkspace, updateWorkspace, removeWorkspace },
}));
vi.mock("../context/CompanyContext", () => ({
  useCompany: () => ({
    companies: [{ id: "company-1", issuePrefix: "PAP" }],
    selectedCompanyId: "company-1",
    setSelectedCompanyId: vi.fn(),
  }),
}));
vi.mock("./environment-variables-editor", () => ({ EnvironmentVariablesEditor: () => null }));
vi.mock("./InlineEditor", () => ({
  InlineEditor: ({ value }: { value?: ReactNode }) => <div>{value}</div>,
}));
vi.mock("./PathInstructionsModal", () => ({ ChoosePathButton: () => null }));

const PRIMARY = {
  id: "workspace-primary",
  name: "main",
  cwd: "/work/repo",
  repoUrl: "https://github.com/acme/repo",
  sourceType: "git_repo",
  isPrimary: true,
};

const MIRROR = {
  id: "workspace-mirror",
  name: "mirror",
  cwd: "/work/repo-mirror",
  repoUrl: null,
  sourceType: "local_path",
  isPrimary: false,
};

const SCRATCH = {
  id: "workspace-scratch",
  name: "scratch",
  cwd: "/work/scratch",
  repoUrl: null,
  sourceType: "local_path",
  isPrimary: false,
};

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "project-1",
    urlKey: "project-1",
    name: "Test project",
    description: "",
    status: "in_progress",
    goalIds: [],
    goals: [],
    env: null,
    codebase: {
      workspaceId: "workspace-primary",
      repoUrl: "https://github.com/acme/repo",
      repoRef: null,
      defaultRef: null,
      repoName: "repo",
      localFolder: "/work/repo",
      origin: "local_folder",
    },
    primaryWorkspace: PRIMARY,
    workspaces: [PRIMARY, MIRROR, SCRATCH],
    executionWorkspacePolicy: { enabled: true, defaultMode: "shared_workspace", allowIssueOverride: true },
    ...overrides,
  } as unknown as Project;
}

let container: HTMLDivElement;
let root: Root;

function act(callback: () => void) {
  const previous = console.error;
  console.error = () => {};
  try {
    flushSync(() => callback());
  } finally {
    console.error = previous;
  }
}

function text(): string {
  return container.textContent ?? "";
}

function button(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!found) throw new Error(`button not found: ${label}`);
  return found;
}

function inputWithPlaceholder(placeholder: string): HTMLInputElement {
  const found = container.querySelector<HTMLInputElement>(`input[placeholder="${placeholder}"]`);
  if (!found) throw new Error(`input not found: ${placeholder}`);
  return found;
}

/**
 * Assign through the native setter.
 *
 * React installs its own `value` setter on the element instance and tracks the
 * last value it wrote; assigning through the prototype's setter is what makes it
 * observe the change and re-render.
 */
function setInputValue(field: HTMLInputElement, next: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (!setter) throw new Error("no native value setter");
  setter.call(field, next);
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * Click, then let react-query reach the mutationFn.
 *
 * `mutate()` schedules the mutation on a microtask, so a synchronous `act`
 * returns before the api call happens. This awaits one macrotask, which is
 * enough for the happy path and keeps the assertions on what was actually
 * sent rather than on what was queued.
 */
async function clickAndSettle(element: HTMLElement) {
  act(() => element.click());
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * The "Additional local folders" block, scoped.
 *
 * `Edit` and the remove buttons also appear elsewhere in this panel —
 * `ProjectRepositories` renders its own row for the primary workspace — so the
 * counts only mean something inside this block.
 */
function additionalFoldersSection(): HTMLElement {
  const heading = [...container.querySelectorAll("div")].find(
    (candidate) => candidate.textContent?.trim() === "Additional local folders",
  );
  if (!heading) throw new Error("additional folders section not found");
  return heading.parentElement!;
}

function buttonsIn(section: HTMLElement, label: string): HTMLButtonElement[] {
  return [...section.querySelectorAll("button")].filter(
    (candidate) => candidate.textContent?.trim() === label,
  );
}

describe("ProjectProperties — multiple local folders", () => {
  beforeEach(() => {
    createWorkspace.mockClear();
    updateWorkspace.mockClear();
    removeWorkspace.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function render(project: Project = makeProject()) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(queryKeys.health, { hiddenSettings: [] });
    client.setQueryData(queryKeys.instance.experimentalSettings, { enableIsolatedWorkspaces: true });
    act(() => {
      root.render(
        <QueryClientProvider client={client}>
          <TooltipProvider>
            <ProjectProperties project={project} />
          </TooltipProvider>
        </QueryClientProvider>,
      );
    });
  }

  it("lists every local folder, not only the primary one", () => {
    render();

    // The primary reads through codebase.localFolder.
    expect(text()).toContain("/work/repo");
    // The additional two can only come from `workspaces`.
    expect(text()).toContain("/work/repo-mirror");
    expect(text()).toContain("/work/scratch");
    expect(text()).toContain("Additional local folders");
  });

  it("adds another local folder as its own non-primary workspace row", async () => {
    render();

    act(() => button("+ Add local folder").click());
    act(() => setInputValue(inputWithPlaceholder("/absolute/path/to/workspace"), "/work/another"));
    await clickAndSettle(button("Add folder"));

    expect(createWorkspace).toHaveBeenCalledTimes(1);
    expect(createWorkspace).toHaveBeenCalledWith("project-1", {
      cwd: "/work/another",
      sourceType: "local_path",
      isPrimary: false,
    });
  });

  it("edits an additional folder in place without touching the primary", async () => {
    render();

    const section = additionalFoldersSection();
    const editButtons = buttonsIn(section, "Edit");
    expect(editButtons).toHaveLength(2);
    // The last row is the scratch folder.
    act(() => editButtons[editButtons.length - 1].click());

    const field = [...container.querySelectorAll("input")].find(
      (candidate) => candidate.value === "/work/scratch",
    );
    if (!field) throw new Error("scratch input not found");
    act(() => setInputValue(field, "/work/scratch-2"));
    await clickAndSettle(button("Save"));

    expect(updateWorkspace).toHaveBeenCalledTimes(1);
    expect(updateWorkspace).toHaveBeenCalledWith("project-1", "workspace-scratch", {
      cwd: "/work/scratch-2",
    });
  });

  it("refuses a folder the project already holds", () => {
    render();

    act(() => button("+ Add local folder").click());
    act(() => setInputValue(inputWithPlaceholder("/absolute/path/to/workspace"), "/work/repo-mirror"));
    act(() => button("Add folder").click());

    expect(text()).toContain("That local folder is already on this project.");
    expect(createWorkspace).not.toHaveBeenCalled();
  });

  it("removes an additional folder by workspace id", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    try {
      render();
      const removeButtons = [...additionalFoldersSection().querySelectorAll("button")].filter(
        (candidate) => (candidate.getAttribute("aria-label") ?? "").startsWith("Remove local folder"),
      );
      expect(removeButtons).toHaveLength(2);
      await clickAndSettle(removeButtons[0]);

      expect(removeWorkspace).toHaveBeenCalledTimes(1);
      expect(removeWorkspace).toHaveBeenCalledWith("project-1", "workspace-mirror");
      // Deleting an additional folder must not take the project with it.
      expect(createWorkspace).not.toHaveBeenCalled();
    } finally {
      confirmSpy.mockRestore();
    }
  });
});

