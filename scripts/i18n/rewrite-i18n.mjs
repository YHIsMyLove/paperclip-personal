// Mechanically wrap hardcoded UI copy in t(key, { defaultValue }).
//
// The defaultValue keeps English working for every locale pack that lacks the
// key, so a missing translation degrades to English rather than showing a raw
// key — and an upgraded component that drops a key does not break the UI.
//
// Dry run by default: pass --write to modify files. Writes a key manifest so
// the translations can be authored from a reviewable list.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const WRITE = process.argv.includes("--write");
const MANIFEST = process.argv[process.argv.indexOf("--manifest") + 1];

// Key namespace per file. Passed as `path=namespace` pairs.
const pairs = process.argv.slice(2).filter((a) => a.includes("=") && !a.startsWith("--"));
if (pairs.length === 0) {
  console.error("usage: rewrite-i18n.mjs <repoUiDir> <file=ns>... [--write] [--manifest out.json]");
  process.exit(1);
}
const ROOT = process.argv[2];

const UI_PROPS = [
  "label", "title", "placeholder", "aria-label", "ariaLabel", "description", "tooltip",
  "alt", "header", "heading", "eyebrow", "subtitle", "body", "message", "errorMessage",
  "hint", "helperText", "emptyText", "emptyMessage", "emptyTitle", "emptyDescription",
  "searchPlaceholder", "placeholderText", "confirmText", "cancelText", "confirmLabel",
  "cancelLabel", "actionLabel", "action", "noneLabel", "allLabel", "anyLabel",
  "copiedLabel", "copyLabel", "triggerLabel", "submitLabel", "deleteLabel", "saveLabel",
  "menuLabel", "dialogTitle", "panelTitle", "sectionTitle", "navLabel", "textLabel",
  "displayName", "summary", "detail", "reason", "note", "defaultValue",
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

/** JSX text must not be a fragment of an expression. */
function isJsxCopy(s) {
  if (/[()]|=>|\?\.|\?\s|\s\?|&&|\|\|/.test(s)) return false;
  // Display copy in this codebase is capitalised. Requiring it here is what
  // keeps `new Set<RequestItemVerdictValue>` out of the results.
  if (!/^[A-Z0-9]/.test(s.trim())) return false;
  return isProse(s);
}

function slug(text) {
  const words = text
    .replace(/['"’]/g, "")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return null;
  const camel = words
    .map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join("");
  return camel.slice(0, 48);
}

const manifest = {};
let totalEdits = 0;
let totalKeys = 0;

for (const pair of pairs) {
  const eq = pair.lastIndexOf("=");
  const rel = pair.slice(0, eq);
  const ns = pair.slice(eq + 1);
  const path = join(ROOT, "src", rel);
  if (!existsSync(path)) {
    console.error(`  跳过（不存在）: ${rel}`);
    continue;
  }
  const original = readFileSync(path, "utf8");
  let src = original;

  // Same English copy inside one file must map to one key.
  const keyByText = new Map();
  const usedKeys = new Set();
  const nsKeys = {};

  function keyFor(text) {
    if (keyByText.has(text)) return keyByText.get(text);
    let base = slug(text) || "copy";
    let key = `${ns}.${base}`;
    let n = 2;
    while (usedKeys.has(key)) key = `${ns}.${base}${n++}`;
    usedKeys.add(key);
    keyByText.set(text, key);
    nsKeys[key] = text;
    return key;
  }

  let edits = 0;

  // 1. String-literal props: label="Foo" -> label={t("ns.k", { defaultValue: "Foo" })}
  const propRe = new RegExp(`\\b(${UI_PROPS.join("|")})=(["'])([^"'\\n]*)\\2`, "g");
  src = src.replace(propRe, (match, prop, q, value) => {
    if (!isProse(value)) return match;
    // Already translated, or not a literal we should touch.
    if (/^\s*(t\()/.test(value)) return match;
    const esc = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const key = keyFor(value);
    edits++;
    return `${prop}={t("${key}", { defaultValue: "${esc}" })}`;
  });

  // 2. JSX text runs: >Foo<  ->  >{t("ns.k", { defaultValue: "Foo" })}<
// The padding around the text is captured and re-emitted. JSX keeps a space
// that separates a text run from an inline element — dropping it turns
// "grants access only to <span>Ada" into "only toAda".
src = src.replace(/>(\s*)([A-Za-z][^<>{}]*?)(\s*)</g, (match, lead, text, trail) => {
    if (!isJsxCopy(text)) return match;
    if (match.includes("{t(")) return match;
    // A `>` preceded by `=` closes an arrow function, not a JSX tag — that is
    // how `=> new Set<X>(...)` gets mistaken for copy.
    if (src[match.index - 1] === "=") return match;
    // JSX text can wrap across lines. Collapse it: the rendered output does the
    // same, and leaving the newline in would produce an unterminated literal.
    const trimmed = text.trim().replace(/\s*\n\s*/g, " ").replace(/\s{2,}/g, " ");
    const esc = trimmed.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const key = keyFor(trimmed);
    edits++;
    return `>${lead}{t("${key}", { defaultValue: "${esc}" })}${trail}<`;
  });

  if (edits === 0) {
    console.log(`  ${rel.padEnd(52)} 无需改动`);
    continue;
  }

  // 3. Wire up the translator.
  // `t` is imported as a plain function rather than via the useTranslation hook:
  // a hook has to land inside a component body, and these edits land in helpers,
  // module-level option arrays and nested callbacks where there is no single
  // correct home for it. This matches StatusIcon.tsx, which uses the same import
  // and is rendered on every surface.
  if (!/from "@\/i18n"/.test(src) && !/from "\.\.\/i18n"/.test(src) && !/from "\.\/i18n"/.test(src)) {
    const reactImport = src.match(/^import .*from "react";$/m);
    const imp = `import { t } from "@/i18n";\n`;
    if (reactImport) {
      src = src.replace(/^(import .*from "react";)$/m, `$1\n${imp.trim()}`);
    } else {
      src = imp + src;
    }
  }

  manifest[rel] = { namespace: ns, edits, keys: nsKeys };
  totalEdits += edits;
  totalKeys += Object.keys(nsKeys).length;

  console.log(
    `  ${rel.padEnd(52)} ${String(edits).padStart(3)} 处  ${Object.keys(nsKeys).length} 个 key`,
  );

  if (WRITE) writeFileSync(path, src, "utf8");
}

console.log(`\n合计 ${totalEdits} 处替换，${totalKeys} 个 key`);
if (MANIFEST) {
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2), "utf8");
  console.log(`清单已写入 ${MANIFEST}`);
}
if (!WRITE) console.log("（dry run，未改文件。加 --write 落盘）");