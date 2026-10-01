import { describe, expect, it } from "vitest";

import { CONNECT_SOURCE_NAMES } from "../components/AdapterLoginChrome";
import { getAdapterDisplay, getAdapterLabel, getAdapterLabels } from "./adapter-display-registry";

describe("adapter display registry", () => {
  it("uses user-facing labels without the legacy local qualifier for built-in adapters", () => {
    expect(getAdapterLabel("codex_local")).toBe("Codex");
    expect(getAdapterLabel("claude_local")).toBe("Claude Code");
    expect(getAdapterLabel("acpx_local")).toBe("ACPX (retired)");
    expect(getAdapterLabel("cursor")).toBe("Cursor");
    expect(getAdapterLabel("gemini_local")).toBe("Gemini CLI");
    expect(getAdapterLabel("grok_local")).toBe("Grok Build");
    expect(getAdapterLabel("kimi_local")).toBe("Kimi Code");
    expect(getAdapterLabel("hermes_local")).toBe("Hermes");
    expect(getAdapterLabel("hermes_gateway")).toBe("Hermes Gateway");
    expect(getAdapterLabel("opencode_local")).toBe("OpenCode");
    expect(getAdapterLabel("pi_local")).toBe("Pi");

    expect(getAdapterLabels()).toMatchObject({
      codex_local: "Codex",
      claude_local: "Claude Code",
      acpx_local: "ACPX (retired)",
      cursor: "Cursor",
      gemini_local: "Gemini CLI",
      grok_local: "Grok Build",
      kimi_local: "Kimi Code",
      hermes_local: "Hermes",
      hermes_gateway: "Hermes Gateway",
      opencode_local: "OpenCode",
      pi_local: "Pi",
    });
  });

  it("drops local suffixes for unknown plugin adapter labels", () => {
    expect(getAdapterLabel("droid_local")).toBe("Droid");
    expect(getAdapterDisplay("droid_local")).toMatchObject({
      label: "Droid",
      description: "External adapter",
    });
  });

  it("keeps a gateway suffix for unknown plugin adapter labels", () => {
    expect(getAdapterLabel("droid_gateway")).toBe("Droid (gateway)");
    expect(getAdapterDisplay("droid_gateway")).toMatchObject({
      label: "Droid (gateway)",
      description: "External gateway adapter",
    });
  });

  it("marks every adapter the connect step can actually offer as recommended", () => {
    // The connect step's tile row is built from `recommendedAdapters`, and its
    // CTA is gated on membership in that same list. The "Advanced settings"
    // disclosure that used to list everything else was deliberately removed, so
    // `recommended` is the only route into the step — an unmarked adapter is not
    // offered elsewhere, it is unreachable. Assert against the real registry
    // rather than a mock so this cannot quietly regress.
    expect(getAdapterDisplay("opencode_local").recommended).toBe(true);
    expect(getAdapterDisplay("claude_local").recommended).toBe(true);
    expect(getAdapterDisplay("codex_local").recommended).toBe(true);

    // Every recommended adapter must have a provider name for the connect flow,
    // because the fallback is the raw adapter type and would render as
    // "opencode_local" in the tile label, the AI-connection name, and the card
    // heading.
    for (const type of ["claude_local", "codex_local", "opencode_local"]) {
      expect(CONNECT_SOURCE_NAMES[type], type).toBeTruthy();
      expect(CONNECT_SOURCE_NAMES[type], type).not.toBe(type);
    }
  });
});
