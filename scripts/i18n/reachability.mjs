// Reachability walk from the UI entrypoints.
//
// The repo keeps a parallel `*.production.tsx` tree that App.tsx actually
// renders, alongside non-production twins that nothing imports. A grep for
// English strings counts both, so the localization workload has to be computed
// over reachable modules only.
import { readdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname, resolve, relative, sep } from "node:path";

const ROOT = process.argv[2];
const OUT = process.argv[3];
const SRC = join(ROOT, "src");

const EXT = [".tsx", ".ts", ".jsx", ".js", ".mjs", ".css", ".json"];

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (EXT.some((x) => e.name.endsWith(x))) out.push(full);
  }
  return out;
}

const all = walk(SRC);
// Lowercased path -> real path. Windows filesystems are case-insensitive but
// import specifiers are not always spelled to match, so compare lowercased.
const byLower = new Map(all.map((f) => [f.toLowerCase(), f]));

function resolveSpec(spec, fromFile) {
  let base;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
  else return null; // bare package

  const tries = [base];
  for (const ext of EXT) tries.push(base + ext);
  for (const ext of EXT) tries.push(join(base, "index" + ext));
  for (const t of tries) {
    const hit = byLower.get(t.toLowerCase());
    if (hit) return hit;
  }
  return null;
}

// Static import/export-from, bare `import(...)`, and `vi.mock` targets.
const SPEC_RE = /(?:from\s*|import\s*\(\s*|import\s+|require\s*\(\s*)["']([^"']+)["']/g;

const reachable = new Set();
const queue = [];

for (const entry of ["main.tsx", "main.ts"]) {
  const p = join(SRC, entry);
  if (existsSync(p)) queue.push(p.toLowerCase());
}
// Storybook/test-only entries must not count as live surface.
while (queue.length) {
  // The queue carries lowercased keys only; mixing in real paths here silently
  // ends the walk on the second hop.
  const key = queue.pop();
  if (reachable.has(key)) continue;
  reachable.add(key);
  const real = byLower.get(key);
  if (!real) continue;
  const src = readFileSync(real, "utf8");
  for (const m of src.matchAll(SPEC_RE)) {
    const hit = resolveSpec(m[1], real);
    if (hit) {
      const key2 = hit.toLowerCase();
      if (!reachable.has(key2)) queue.push(key2);
    }
  }
}

const isTest = (f) => /\.(test|spec|stories|fixture)\.[tj]sx?$|\.d\.ts$/i.test(f);
const live = all.filter((f) => reachable.has(f.toLowerCase()) && !isTest(f) && !f.endsWith(".css"));
const dead = all.filter((f) => !reachable.has(f.toLowerCase()) && !isTest(f));

const rel = (f) => relative(ROOT, f).split(sep).join("/");

const report = {
  totalFiles: all.length,
  liveSurfaceFiles: live.length,
  unreachableFiles: dead.length,
  deadByReason: {
    nonProductionTwin: dead.filter((f) => /\.production\.tsx$/.test(f)).map(rel),
    otherUnreachable: dead
      .filter((f) => !/\.production\.tsx$/.test(f))
      .map(rel)
      .slice(0, 80),
  },
};

writeFileSync(OUT, JSON.stringify(report, null, 2));

console.log(`总文件 ${report.totalFiles}`);
console.log(`入口可达 ${report.liveSurfaceFiles}   不可达 ${report.unreachableFiles}`);
console.log(`\n=== 不可达且是 .production.tsx 的（并行树）: ${report.deadByReason.nonProductionTwin.length} 个 ===`);
for (const f of report.deadByReason.nonProductionTwin.slice(0, 25)) console.log("  " + f);
console.log(`\n=== 其他不可达文件（死代码/仅测试使用）: ${report.deadByReason.otherUnreachable.length}+ 个 ===`);
for (const f of report.deadByReason.otherUnreachable.slice(0, 25)) console.log("  " + f);

// Emit the live file list for the string scanner to consume.
writeFileSync(OUT.replace(/\.json$/, "-live.txt"), live.map(rel).join("\n"), "utf8");