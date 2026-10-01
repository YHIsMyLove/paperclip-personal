// List every user-facing string in a file as `line  kind  text`.
// Reading a 2000-line component to find 75 strings wastes most of the context.
import { readFileSync } from "node:fs";

const UI_PROPS = [
  "label", "title", "placeholder", "aria-label", "ariaLabel", "description", "tooltip",
  "alt", "header", "heading", "eyebrow", "subtitle", "body", "message", "errorMessage",
  "hint", "helperText", "emptyText", "emptyMessage", "emptyTitle", "emptyDescription",
  "searchPlaceholder", "placeholderText",
  "confirmText", "cancelText", "confirmLabel", "cancelLabel", "actionLabel", "action",
  "noneLabel", "allLabel", "anyLabel", "copiedLabel", "copyLabel", "triggerLabel",
  "submitLabel", "deleteLabel", "saveLabel", "menuLabel", "dialogTitle", "panelTitle",
  "sectionTitle", "navLabel", "textLabel", "displayName", "summary", "detail",
  "reason", "note", "defaultValue",
];

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
  if (/[;{}]/.test(t) || /\b\w+\s*:\s*[A-Z]/.test(t)) return false;
  if (/^[a-z]+[A-Z]/.test(t) && !/\s/.test(t)) return false;
  if (/^[a-z0-9_]+(\.[a-z0-9_]+)+$/.test(t)) return false;
  if (/^[a-z0-9_-]+$/.test(t)) return false;
  if (/^[/#.\-*]/.test(t)) return false;
  return true;
}

const src = readFileSync(process.argv[2], "utf8");
const lines = src.split("\n");
const lineAt = (i) => src.slice(0, i).split("\n").length;

const hits = [];

for (const m of src.matchAll(/>\s*([A-Za-z][^<>{}]*?)\s*</g)) {
  if (isProse(m[1])) hits.push({ line: lineAt(m.index), kind: "jsx", text: m[1].trim() });
}

const propRe = new RegExp(`\\b(${UI_PROPS.join("|")})=["'{]([^"'{}]+)["'}]`, "g");
for (const m of src.matchAll(propRe)) {
  if (isProse(m[2])) hits.push({ line: lineAt(m.index), kind: m[1], text: m[2].trim() });
}

for (const m of src.matchAll(/\b(?:window\.)?(confirm|alert)\(\s*["'`]([^"'`]{3,300})["'`]/g)) {
  if (isProse(m[2])) hits.push({ line: lineAt(m.index), kind: m[1], text: m[2].trim() });
}

// Multiline template literals passed to toast()/setError() and friends.
for (const m of src.matchAll(/\b(toast|showToast|setError|setMessage)\(\s*`([^`]{4,300})`/g)) {
  const t = m[2].replace(/\$\{[^}]*\}/g, "…").trim();
  if (isProse(t)) hits.push({ line: lineAt(m.index), kind: m[1], text: t });
}

hits.sort((a, b) => a.line - b.line);
console.log(`${process.argv[2]}\n共 ${hits.length} 处\n`);
for (const h of hits) {
  const src1 = (lines[h.line - 1] ?? "").trim();
  console.log(`${String(h.line).padStart(5)}  ${h.kind.padEnd(16)} ${JSON.stringify(h.text)}`);
  if (h.kind === "jsx") console.log(`        | ${src1.slice(0, 100)}`);
}