// Final localization backlog: reachable surface minus feature-flag-hidden pages.
//
// Three filters, in order of how much they remove:
//   1. dead code      — modules no entrypoint reaches
//   2. flag-gated     — routes whose ExperimentalGate is off on this instance
//   3. internal-only  — design guides / UX labs with no user-facing entry
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const REPO = process.argv[2];          // .../paperclip/ui
const LIVE = process.argv[3];          // reach-live.txt
const OUT = process.argv[4];
const SRC = join(REPO, "src");

// Feature flags read off /api/instance/settings/experimental on this instance.
// A gated-off page is unreachable for this user, so its copy does not matter yet.
const FLAG_OFF = {
  enableChatConnectors: "Chat 连接器（apps/chat 全部）",
  enablePipelines: "Pipelines（流水线）",
  enableCases: "Cases",
  enableStatusCards: "StatusCards",
  enableEnvironments: "执行环境",
  enableAgentChat: "Agent 聊天",
  enableConferenceRoomChat: "会议聊天",
  enableSummaries: "摘要",
  enableDecisions: "Decisions",
  enableBetaSkills: "Beta Skills",
  enableExternalObjects: "外部对象",
  enableServerInfoDebugView: "服务端调试视图",
  enablePaperclipDeveloperMode: "开发者模式",
  enableSmokeLab: "Smoke Lab",
};

// Directories/files whose copy is only reachable behind one of the flags above.
// Paths come from the ExperimentalGate usages in App.tsx — Pipelines and
// PipelineSettings sit at pages/ root, not under pages/tools.
const GATED_PREFIXES = [
  ["pages/apps/chat", "enableChatConnectors"],
  ["components/task-chat", "enableChatConnectors"],
  ["features/chat", "enableChatConnectors"],
  ["components/chat", "enableChatConnectors"],
  ["pages/tools", "enablePipelines"],
  ["pages/Pipelines", "enablePipelines"],
  ["pages/PipelineSettings", "enablePipelines"],
  ["pages/pipelines", "enablePipelines"],
  ["components/Pipeline", "enablePipelines"],
  ["pages/StatusCards", "enableStatusCards"],
  ["pages/Cases", "enableCases"],
  ["pages/cases", "enableCases"],
  ["pages/CaseDetail", "enableCases"],
  ["pages/decisions", "enableDecisions"],
];

// Internal-only surfaces: routed, but nobody but Paperclip devs looks at them.
const INTERNAL_FILES = new Set(["pages/DesignGuide.tsx", "pages/InviteUxLab.tsx"]);

// Props whose values are rendered to the user.
// Evidence-based: run prop-audit.mjs over ui/src and read the real frequency of
// each prop before adding one here. Props like className/path/target/rel/value
// are deliberately absent — they carry no copy.
const UI_PROPS = [
  "label", "title", "placeholder", "aria-label", "ariaLabel", "description", "tooltip",
  "alt", "header", "heading", "eyebrow", "subtitle", "body", "message", "errorMessage",
  "hint", "helperText", "emptyText", "emptyMessage", "emptyTitle", "emptyDescription",
  "searchPlaceholder", "placeholderText",
  "confirmText", "cancelText", "confirmLabel", "cancelLabel", "actionLabel", "action",
  "noneLabel", "allLabel", "anyLabel", "copiedLabel", "copyLabel", "triggerLabel",
  "submitLabel", "deleteLabel", "saveLabel", "menuLabel", "dialogTitle", "panelTitle",
  "sectionTitle", "navLabel", "textLabel", "displayName", "summary", "detail",
  "reason", "note", "defaultValue", "placeholder2",
];
const SKIP_DIR = new Set(["node_modules", "dist", ".git"]);
const SKIP_FILE = /\.(test|spec|stories|fixture)\.[tj]sx?$|\.d\.ts$/i;

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIR.has(e.name)) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.[tj]sx?$/.test(e.name) && !SKIP_FILE.test(e.name)) out.push(full);
  }
  return out;
}

// Bare TypeScript type names that the `>text<` pattern mistakes for JSX copy.
// `Promise<void>` and `ReadonlyMap<string, X>` match the shape of JSX text but
// are never shown to anyone.
const TS_TYPE_NOISE = new Set([
  "Promise", "Map", "Set", "WeakMap", "WeakSet", "ReadonlyMap", "ReadonlySet", "Array",
  "Record", "string", "number", "boolean", "void", "never", "unknown", "any", "object",
  "Date", "Error", "Object", "Function", "Symbol", "BigInt", "Partial", "Required",
  "Readonly", "Pick", "Omit", "Exclude", "Extract", "NonNullable", "ReturnType",
]);

function isProse(s) {
  const t = s.trim();
  if (!t || t.length < 2 || t.length > 200) return false;
  if (!/[A-Za-z]/.test(t)) return false;
  if (TS_TYPE_NOISE.has(t)) return false;
  // Type annotations captured as JSX text, e.g. "locallyQueued: ReadonlyMap".
  if (/[;{}]/.test(t) || /\b\w+\s*:\s*[A-Z]/.test(t)) return false;
  if (/^[a-z]+[A-Z]/.test(t) && !/\s/.test(t)) return false;
  if (/^[a-z0-9_]+(\.[a-z0-9_]+)+$/.test(t)) return false;
  if (/^[a-z0-9_-]+$/.test(t)) return false;
  if (/^[/#.\-*]/.test(t)) return false;
  return true;
}

/**
 * True when a captured prop value is a plain display literal.
 *
 * The prop regex opens on a quote *or* a brace, so it also captures whatever
 * follows `label={` — either the `t(` of an already-translated call, or the
 * condition of a ternary. Both are expressions, not copy.
 */
function isLiteralValue(v) {
  const s = v.trim();
  if (!s) return false;
  if (/^t\(/.test(s)) return false;
  if (/^[A-Za-z_$][\w$]*\s*(===|==|!==|!=|&&|\|\||\?\?|\?)/.test(s)) return false;
  if (/^[A-Za-z_$][\w$.]*$/.test(s)) return false;
  return true;
}

function countHits(src) {
  let n = 0;
  for (const m of src.matchAll(/>\s*([A-Za-z][^<>{}]*?)\s*</g)) if (isProse(m[1])) n++;
  const propRe = new RegExp(`\\b(${UI_PROPS.join("|")})=["'{]([^"'{}]+)["'}]`, "g");
  for (const m of src.matchAll(propRe)) if (isLiteralValue(m[2]) && isProse(m[2])) n++;
  for (const m of src.matchAll(/\b(?:window\.)?(confirm|alert)\(\s*["'`]([^"'`]{3,300})["'`]/g))
    if (isProse(m[2])) n++;
  return n;
}

// reach-live.txt holds paths relative to the ui/ root; compare against
// absolute paths, which is what walk() yields.
const live = new Set(
  readFileSync(LIVE, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((p) => join(REPO, p.trim()).toLowerCase()),
);

const liveRows = [];
const gatedRows = [];
const deadRows = [];
const internalRows = [];

for (const file of walk(SRC)) {
  const rel = relative(REPO, file).split(sep).join("/");
  const src = readFileSync(file, "utf8");
  const n = countHits(src);
  if (n === 0) continue;

  const gate = GATED_PREFIXES.find(([p]) => rel.startsWith(`src/${p}/`) || rel.startsWith(`src/${p}`));
  if (INTERNAL_FILES.has(rel)) { internalRows.push({ file: rel, count: n }); continue; }
  if (gate) { gatedRows.push({ file: rel, count: n, flag: gate[1] }); continue; }
  if (!live.has(file.toLowerCase())) { deadRows.push({ file: rel, count: n }); continue; }
  liveRows.push({ file: rel, count: n });
}

const sum = (a) => a.reduce((s, r) => s + r.count, 0);
liveRows.sort((a, b) => b.count - a.count);
gatedRows.sort((a, b) => b.count - a.count);

const report = {
  totals: {
    allNonTestFiles: walk(SRC).length,
    stringsEverywhere: sum(liveRows) + sum(gatedRows) + sum(deadRows) + sum(internalRows),
    liveActionable: sum(liveRows),
    gatedOff: sum(gatedRows),
    internalOnly: sum(internalRows),
    deadCode: sum(deadRows),
  },
  flagOffPages: FLAG_OFF,
  liveActionable: liveRows,
  gatedOff: gatedRows,
  internalOnly: internalRows,
  deadCodeTop: deadRows.sort((a, b) => b.count - a.count).slice(0, 30),
};

writeFileSync(OUT, JSON.stringify(report, null, 2));

console.log("=== 未翻译文案总量分解 ===");
console.log(`  全部非测试文件        ${String(report.totals.stringsEverywhere).padStart(5)} 处`);
console.log(`  ├─ 真正要翻（活的界面） ${String(report.totals.liveActionable).padStart(5)} 处  ${report.liveActionable.length} 个文件`);
console.log(`  ├─ 开关关闭进不去      ${String(report.totals.gatedOff).padStart(5)} 处  ${report.gatedOff.length} 个文件`);
console.log(`  ├─ 内部页面            ${String(report.totals.internalOnly).padStart(5)} 处`);
console.log(`  └─ 死代码              ${String(report.totals.deadCode).padStart(5)} 处`);

console.log("\n=== 开关关闭而不用翻的页面 ===");
const byFlag = new Map();
for (const r of gatedRows) {
  const k = r.flag;
  byFlag.set(k, (byFlag.get(k) ?? 0) + r.count);
}
for (const [k, n] of [...byFlag].sort((a, b) => b[1] - a[1]))
  console.log(`  ${String(n).padStart(5)} 处  ${k} (${FLAG_OFF[k]})`);

console.log("\n=== 要翻的文件 Top 45 ===");
for (const r of liveRows.slice(0, 45))
  console.log(`  ${String(r.count).padStart(4)}  ${r.file}`);

const byDir = new Map();
for (const r of liveRows) {
  const d = r.file.slice(0, r.file.lastIndexOf("/")) || ".";
  byDir.set(d, (byDir.get(d) ?? 0) + r.count);
}
console.log("\n=== 按目录 ===");
for (const [d, n] of [...byDir].sort((a, b) => b[1] - a[1]).slice(0, 20))
  console.log(`  ${String(n).padStart(5)}  ${d}`);