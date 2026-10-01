// Which JSX props actually carry user-facing copy?
//
// The backlog scanner uses a prop whitelist. This reports the real frequency of
// every prop holding a string value, so the whitelist can be checked against
// evidence instead of guesswork.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = process.argv[2];

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(e.name) && !/\.(test|spec|stories|fixture)\./.test(e.name)) out.push(full);
  }
  return out;
}

const counts = new Map();
const samples = new Map();

// Only lowercase-hyphen props: capitalised names are React components, not props.
const PROP = /\b([a-z][a-zA-Z]*(?:-[a-zA-Z]+)*)="([^"]{2,90})"/g;

for (const file of walk(SRC)) {
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(PROP)) {
    const prop = m[1];
    const value = m[2].trim();
    if (!/[A-Za-z]/.test(value)) continue;
    // Skip obvious non-copy values.
    if (/^(https?:|[a-z-]+$|\/|[.#])/.test(value)) continue;
    if (/^[a-z]+[A-Z]/.test(value) && !/\s/.test(value)) continue; // camelCase id
    counts.set(prop, (counts.get(prop) ?? 0) + 1);
    if (!samples.has(prop)) samples.set(prop, []);
    if (samples.get(prop).length < 3) samples.get(prop).push(value);
  }
}

const rows = [...counts].sort((a, b) => b[1] - a[1]);
const total = rows.reduce((s, [, n]) => s + n, 0);

console.log(`字符串型 prop 出现总次数: ${total}，共 ${rows.length} 种 prop\n`);
console.log("=== Top 45 prop ===");
for (const [prop, n] of rows.slice(0, 45)) {
  const s = samples.get(prop).map((v) => `"${v.slice(0, 34)}"`).join("  ");
  console.log(`${String(n).padStart(5)}  ${prop.padEnd(24)} ${s}`);
}