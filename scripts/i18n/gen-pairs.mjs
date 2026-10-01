// Generate `file=namespace` pairs for rewrite-i18n.mjs from a list of files.
//
// Hand-maintaining the pairs for a few hundred files is where typos live, and a
// typo here means two components share a key namespace. The namespace is
// derived from the path: src/adapters/openclaw-gateway/config-fields.tsx becomes
// adapters.openclawGateway — generic trailing segments like config-fields are
// dropped because they add nothing and several adapters share them.
import { readFileSync, writeFileSync } from "node:fs";

const [, , listFile, outFile] = process.argv;
const files = readFileSync(listFile, "utf8").split(/\r?\n/).filter(Boolean);

// Trailing segments that say nothing about which component this is.
const GENERIC = new Set([
  "config-fields", "config-fields.production", "config-sections", "index", "main",
]);

const camel = (s) =>
  s
    .replace(/[^A-Za-z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ""))
    .replace(/^[A-Z]/, (c) => c.toLowerCase());

const pairs = files.map((f) => {
  // rewrite-i18n.mjs joins ROOT + "src" + rel and checks that path with
  // existsSync, so the pair must drop the src/ prefix but keep the extension.
  const rel = f.replace(/^src\//, "");
  const segments = rel.replace(/\.tsx?$/, "").split("/").filter(Boolean);

  while (segments.length > 1 && GENERIC.has(segments[segments.length - 1])) segments.pop();

  return `${rel}=${segments.map(camel).join(".")}`;
});

writeFileSync(outFile, pairs.join("\n"), "utf8");
console.log(`${pairs.length} 对已写入 ${outFile}`);
for (const p of pairs) console.log("  " + p);