// Sanity-check the scanner against one file: does the prose filter throw away
// copy a user actually reads?
import { readFileSync } from "node:fs";

const file = process.argv[2];
const src = readFileSync(file, "utf8");

const jsxAll = [...src.matchAll(/>\s*([A-Za-z][^<>{}]*?)\s*</g)].map((m) => m[1].trim());
const strAll = [...src.matchAll(/"([^"\n]{2,80})"/g)].map((m) => m[1]);

console.log(`文件: ${file}`);
console.log(`行数: ${src.split("\n").length}`);
console.log(`双引号字符串字面量: ${strAll.length}`);
console.log(`JSX 文本节点: ${jsxAll.length}`);
console.log(`其中被判为"非文案"而丢弃的:`);

function isProse(t) {
  const s = t.trim();
  if (!s || s.length < 2 || s.length > 200) return false;
  if (!/[A-Za-z]/.test(s)) return false;
  if (/^[a-z]+[A-Z]/.test(s) && !/\s/.test(s)) return false;
  if (/^[a-z0-9_]+(\.[a-z0-9_]+)+$/.test(s)) return false;
  if (/^[a-z0-9_-]+$/.test(s)) return false;
  if (/^[/#.\-*]/.test(s)) return false;
  return true;
}

const dropped = jsxAll.filter((t) => !isProse(t));
const droppedUserFacing = dropped.filter((t) => /^[A-Z]/.test(t.trim()) && /[a-z]/.test(t));
console.log(`  共 ${dropped.length} 个被丢弃，其中首字母大写且含小写（很可能是真文案）: ${droppedUserFacing.length}`);
for (const t of droppedUserFacing.slice(0, 25)) console.log(`    '${t}'`);
console.log(`\n被判为文案的样本:`);
for (const t of jsxAll.filter(isProse).slice(0, 15)) console.log(`    '${t}'`);