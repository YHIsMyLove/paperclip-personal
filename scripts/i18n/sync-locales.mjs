// Keep en.json and zh-CN.json in step with the rewritten components.
//
// en.json is the authoritative catalog — locale-validation throws at startup if
// a translation introduces a namespace English does not have. The English text
// already exists as each call site's `defaultValue`, so it is derived from the
// manifest rather than retyped. Only the Chinese is authored by hand.
//
// Existing entries in both packs are preserved: this merges, never replaces.
import { readFileSync, writeFileSync } from "node:fs";

// One batch rarely spans a single manifest — the components tree and the pages
// tree were rewritten separately, and a translation set can cover both. Accept a
// comma-separated list so a single run can finish the job.
const MANIFESTS = process.argv[2].split(",").map((p) => p.trim()).filter(Boolean);
const ZH = process.argv[3];      // hand-authored { "ns.key": "中文" }, may be partial
const EN_OUT = process.argv[4];
const ZH_OUT = process.argv[5];

const manifest = Object.assign({}, ...MANIFESTS.map((p) => JSON.parse(readFileSync(p, "utf8"))));
const zhAuthored = ZH && ZH !== "-" ? JSON.parse(readFileSync(ZH, "utf8")) : {};
const en = JSON.parse(readFileSync(EN_OUT, "utf8"));
const zh = JSON.parse(readFileSync(ZH_OUT, "utf8"));

function setPath(root, dotted, value) {
  const parts = dotted.split(".");
  let node = root;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof node[parts[i]] !== "object" || node[parts[i]] === null) node[parts[i]] = {};
    node = node[parts[i]];
  }
  node[parts[parts.length - 1]] = value;
}

function getPath(root, dotted) {
  return dotted.split(".").reduce((n, k) => (n == null ? undefined : n[k]), root);
}

let enAdded = 0;
let zhAdded = 0;
let zhMissing = [];

for (const entry of Object.values(manifest)) {
  for (const [key, english] of Object.entries(entry.keys)) {
    // English first — this is what makes the namespace legal at all.
    if (getPath(en, key) === undefined) {
      setPath(en, key, english);
      enAdded++;
    }
    const translated = zhAuthored[key];
    if (translated !== undefined) {
      setPath(zh, key, translated);
      zhAdded++;
    } else if (getPath(zh, key) === undefined) {
      zhMissing.push(key);
    }
  }
}

// Keys the author wrote that no component references are almost always typos.
const known = new Set();
for (const entry of Object.values(manifest)) for (const k of Object.keys(entry.keys)) known.add(k);
const orphans = Object.keys(zhAuthored).filter((k) => !known.has(k));

writeFileSync(EN_OUT, JSON.stringify(en, null, 2) + "\n", "utf8");
writeFileSync(ZH_OUT, JSON.stringify(zh, null, 2) + "\n", "utf8");

console.log(`en.json  新增 ${enAdded} 个 key`);
console.log(`zh-CN.json 新增 ${zhAdded} 个 key`);
console.log(`尚未翻译（会回退英文）: ${zhMissing.length} 个`);
if (zhMissing.length) {
  const byNs = new Map();
  for (const k of zhMissing) {
    const ns = k.split(".").slice(0, 2).join(".");
    byNs.set(ns, (byNs.get(ns) ?? 0) + 1);
  }
  for (const [ns, n] of [...byNs].sort((a, b) => b[1] - a[1])) console.log(`    ${String(n).padStart(4)}  ${ns}`);
}
if (orphans.length) {
  console.log(`\n⚠ 翻译里有 ${orphans.length} 个 key 在代码中不存在（可能是拼错）:`);
  for (const k of orphans.slice(0, 20)) console.log(`    ${k}`);
}