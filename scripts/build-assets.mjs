#!/usr/bin/env node
/**
 * Cross-platform build-asset helper.
 *
 * Several package.json `build` scripts used to shell out to `mkdir -p`, `cp`,
 * `cp -R`, `rm -rf`, and `chmod +x`. Those are POSIX commands, so every one of
 * those packages failed to build on Windows with "The syntax of the command is
 * incorrect" — which broke `pnpm build` for the whole workspace, including the
 * UI bundle.
 *
 * This is the replacement. It only uses Node built-ins, so it behaves the same
 * on every platform the repo supports.
 *
 * Usage:
 *   node scripts/build-assets.mjs mkdir <dir> [<dir> ...]
 *   node scripts/build-assets.mjs copy <destDir> <src> [<src> ...]
 *   node scripts/build-assets.mjs copy-tree <srcDir> <destDir> [<srcDir> <destDir> ...]
 *   node scripts/build-assets.mjs rm <path> [<path> ...]
 *   node scripts/build-assets.mjs chmod <file> [<file> ...]
 *
 * `copy` takes `cp` semantics — destination first, then the sources — so
 * `cp a b dest` ports across unchanged. A source ending in `*` expands to the
 * files in that directory (`src/migrations/*` → `src/migrations`), which is how
 * the migration SQL glob is expressed without a shell.
 */
import fs from "node:fs";
import path from "node:path";

const [command, ...args] = process.argv.slice(2);

function fail(message) {
  console.error(`build-assets: ${message}`);
  process.exit(1);
}

/** A source ending in `*` means "the files in this directory", like `cp dir/* dest`. */
function isGlobSource(source) {
  return source.endsWith("*");
}

function expand(source) {
  if (!isGlobSource(source)) return [source];
  const dir = source.slice(0, -1).replace(/[/\\]$/, "");
  if (!fs.existsSync(dir)) fail(`glob source directory does not exist: ${dir}`);
  return fs
    .readdirSync(dir)
    .map((name) => path.join(dir, name))
    .filter((entry) => fs.statSync(entry).isFile());
}

function copyTree(sourceDir, destDir) {
  if (!fs.existsSync(sourceDir)) fail(`source directory does not exist: ${sourceDir}`);
  fs.mkdirSync(destDir, { recursive: true });
  // `recursive: true` on copyFileSync is Node 22+; do it by hand so the script
  // works on every Node the repo's engines range allows.
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const from = path.join(sourceDir, entry.name);
    const to = path.join(destDir, entry.name);
    if (entry.isDirectory()) copyTree(from, to);
    else fs.copyFileSync(from, to);
  }
}

switch (command) {
  case "mkdir": {
    if (args.length === 0) fail("mkdir needs at least one directory");
    for (const dir of args) fs.mkdirSync(dir, { recursive: true });
    break;
  }

  case "copy": {
    // `cp` semantics: destination first, then sources.
    if (args.length < 2) fail("copy needs <destDir> <src> [<src> ...]");
    const [destDir, ...sources] = args;
    if (sources.length === 0) fail("copy needs at least one source");
    fs.mkdirSync(destDir, { recursive: true });
    for (const source of sources) {
      for (const file of expand(source)) {
        fs.copyFileSync(file, path.join(destDir, path.basename(file)));
      }
    }
    break;
  }

  case "copy-tree": {
    if (args.length < 2 || args.length % 2 !== 0) fail("copy-tree needs <srcDir> <destDir> pairs");
    for (let i = 0; i < args.length; i += 2) copyTree(args[i], args[i + 1]);
    break;
  }

  case "rm": {
    if (args.length === 0) fail("rm needs at least one path");
    for (const target of args) fs.rmSync(target, { recursive: true, force: true });
    break;
  }

  case "chmod": {
    // Only meaningful on POSIX. On Windows the execute bit does not exist, and
    // shelling out to `chmod` there is what broke the build in the first place.
    if (process.platform === "win32") break;
    for (const file of args) {
      try {
        fs.chmodSync(file, 0o755);
      } catch {
        // A missing or already-conventional mode is not worth failing a build.
      }
    }
    break;
  }

  default:
    fail(`unknown command ${command ? `"${command}"` : "(none)"}`);
}