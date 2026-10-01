// Restore JSX padding lost by the first version of rewrite-i18n.mjs.
//
// The original regex `>\s*(text)\s*<` discarded the whitespace around the text
// run. JSX keeps a space between a text run and an inline element, so
// "grants access only to <span>Ada" became "only toAda" in every non-CJK
// locale. The rewriter is fixed; this repairs the call sites already written.
//
// For each translated file it reads the pre-i18n revision out of git, records
// whether a given English string was followed by horizontal whitespace before
// the next tag, and re-inserts that space where the rewrite dropped it.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, relative } from "node:path";

const REPO = process.argv[2];
const FIRST_I18N_COMMIT = process.argv[3]; // first commit that rewrote call sites
const WRITE = process.argv.includes("--write");

/** Recursively list .tsx files under a directory. */
function walk(dir, out = []) {
  for (const e of require("node:fs").readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

// eslint-disable-next-line  -- keep this script runnable with plain node
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

function git(args) {
  try {
    return execFileSync("git", args, { cwd: REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return null;
  }
}

/**
 * The last commit that touched this file before the i18n rewrites began. That
 * revision is the untouched source the rewrite was derived from.
 */
function preRewriteRef(relPath) {
  const out = git(["log", "-1", "--format=%H", `${FIRST_I18N_COMMIT}^`, "--", relPath]);
  return out ? out.trim() : null;
}

/** English strings the rewrite introduced, with the text immediately before `<`. */
const SITE = /\{ defaultValue: "((?:[^"\\]|\\.)*)" \}\)\}([^\S\n]*)</g;

let filesTouched = 0;
let sitesFixed = 0;
let filesSkipped = 0;

for (const abs of walk(join(REPO, "ui", "src"))) {
  const src = readFileSync(abs, "utf8");
  if (!src.includes('from "@/i18n"') && !src.includes("from \"../i18n\"") && !src.includes("from './i18n'")) {
    continue;
  }
  const rel = relative(REPO, abs).split("\\").join("/");

  // Which English strings currently have no padding before the next tag?
  const needsSpace = new Set();
  for (const m of src.matchAll(SITE)) {
    if (m[2] === "") needsSpace.add(m[1]);
  }
  if (needsSpace.size === 0) continue;

  const ref = preRewriteRef(rel);
  if (!ref) {
    filesSkipped++;
    continue;
  }
  const original = git(["show", `${ref}:${rel}`]);
  if (original == null) {
    filesSkipped++;
    continue;
  }

  // Only re-insert a space where the original actually had one, and only when
  // this file has no already-correct occurrence of the same string.
  let patched = src;
  let fixedHere = 0;
  for (const english of needsSpace) {
    const plain = english.replace(/\\(.)/g, "$1");
    const hadPadding = new RegExp(
      plain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[^\\S\\n]+<",
    ).test(original);
    if (!hadPadding) continue;
    // Skip if some occurrence in this file already carries the space.
    const alreadyFixed = new RegExp(
      plain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '" \\}\\)\\}[^\\S\\n]+<',
    ).test(src);
    if (alreadyFixed) continue;

    const target = new RegExp(
      `(\\{ defaultValue: "${english.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}" \\}\\)\\})<`,
      "g",
    );
    patched = patched.replace(target, `$1 <`);
    fixedHere++;
  }

  if (fixedHere > 0) {
    filesTouched++;
    sitesFixed += fixedHere;
    console.log(`  ${String(fixedHere).padStart(3)}  ${rel}`);
    if (WRITE) writeFileSync(abs, patched, "utf8");
  }
}

console.log(`\n修复 ${sitesFixed} 处 / ${filesTouched} 个文件`);
if (filesSkipped) console.log(`跳过 ${filesSkipped} 个文件（找不到重写前的修订）`);
if (!WRITE) console.log("（dry run。加 --write 落盘）");