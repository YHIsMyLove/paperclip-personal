# i18n tooling

Scripts used to localise the Paperclip UI. They exist because the interface is
large (≈5500 untranslated strings once dead code and feature-flag-hidden pages
are excluded) and the work is repetitive enough that doing it by hand invites
mistakes that only show up as broken tests much later.

## Pipeline

Run in this order. Each step is independent and re-runnable.

### 1. Inventory — what is actually on screen

```sh
node scripts/i18n/reachability.mjs ui out/reach.json
node scripts/i18n/i18n-backlog.mjs ui out/reach-live.txt out/backlog.json
```

`reachability.mjs` walks imports from the entrypoint and reports which modules
are reachable. This matters more than it sounds: the repo keeps a parallel
`*.production.tsx` tree that `App.tsx` actually renders, alongside non-production
twins, and `App.tsx` picks between them with a feature flag
(`enableStreamlinedUi`). A grep counts both, so a naive scan reports thousands of
strings nobody will ever see.

`i18n-backlog.mjs` then splits the remainder into live copy, copy behind a
disabled feature gate, internal-only pages, and dead code.

### 2. Audit the assumptions

```sh
node scripts/i18n/prop-audit.mjs ui/src
```

Prints every JSX prop that holds a string value, by frequency. Run this before
extending the prop whitelist in the scripts below — the whitelist was last built
from this output, not from guesswork.

```sh
node scripts/i18n/sanity.mjs ui/src/pages/IssueDetail.tsx
```

Shows which candidate strings the prose filter rejects, so a filter that is too
aggressive is visible instead of silently dropping copy.

### 3. Rewrite call sites

```sh
node scripts/i18n/rewrite-i18n.mjs ui \
  components/NewIssueDialog.tsx=issues.newTask \
  pages/Inbox.tsx=inbox \
  --manifest out/manifest.json --write
```

Converts `label="Foo"` to `label={t("ns.key", { defaultValue: "Foo" })}` and JSX
text runs to `{t(...)}`, then adds `import { t } from "@/i18n";`.

Notes on the two choices this makes:

- **`defaultValue` always carries the English.** A locale pack that lacks a key
  renders English instead of a raw key, and an upgraded component that drops a
  call site does not break the other 39 packs.
- **`t` is imported as a plain function, not via the `useTranslation` hook.** A
  hook must be called inside a component body, and these edits land in module
  option arrays, helpers and nested callbacks that have no single correct home
  for it. `StatusIcon.tsx` uses the same import and renders on every surface.

Dry run is the default. Pass `--write` to modify files.

Two things the rewriter will not do, both deliberate:

- It skips `label="Assignee"` on `AttributionAvatar`. That prop is typed
  `"Assignee" | "Originating"` and is lowercased to build a `data-testid`, so
  translating it changes the test selector rather than the interface.
- It requires JSX text to start with an uppercase letter. Without that,
  `new Set<RequestItemVerdictValue>` matches as copy.

### JSX padding

The rewriter captures the whitespace on both sides of a text run and re-emits
it. That is load-bearing, not tidiness: JSX renders the space between a text
run and an inline element, so wrapping `>grants access only to <span>Ada<`
has to produce `{t(...)} <span>Ada</span>`. An earlier version used
`>\s*(text)\s*<`, which silently dropped that space and rendered "only toAda"
in every non-CJK locale.

`repair-i18n-spacing.mjs` puts those spaces back for call sites already
written. It reads the pre-rewrite revision out of git per file, so it needs the
commit that preceded the first rewrite:

```sh
node scripts/i18n/repair-i18n-spacing.mjs . <commit-before-first-rewrite> --write
```

### 4. Translate and sync

Author Chinese in a flat dotted map, then merge:

```sh
node scripts/i18n/sync-locales.mjs \
  out/manifest.json out/zh.json \
  ui/src/i18n/locales/en.json ui/src/i18n/locales/zh-CN.json
```

`en.json` is the authoritative catalog — `locale-validation.ts` throws at
startup if a translation introduces a namespace English does not have. English
text already exists as each call site's `defaultValue`, so it is derived from the
manifest rather than retyped; only the Chinese is hand-authored. The merge
preserves existing entries in both packs.

`zh-task-center.json` is the reference translation set: 420 keys covering the
inbox, task list, kanban, task detail, properties sidebar, new-task dialog,
issue chat and its recovery cards, and task documents.

## After every batch

```sh
cd ui && pnpm exec tsc --noEmit -p tsconfig.json
cd .. && pnpm exec vitest run --root ui
pnpm check:token-gates
```

Run the tests for the touched files on their own before the full suite. Under
full-suite parallel load, several UI suites (Secrets.render, IssuesList,
codemirror-single-instance, IssueProperties) time out intermittently; that
failure set changes between runs and is not a signal about the change.

`chat-ui-contract.test.ts` and `IssueProperties.test.tsx` fail on a clean tree.