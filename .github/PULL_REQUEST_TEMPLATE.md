## Problem

<!-- Describe the user or contributor problem. Link the issue where possible. -->

## Root cause

<!-- For a fix, identify the code path and why the old behaviour failed. Remove this section for non-fixes. -->

## What changed

<!-- Name the important files, functions, interfaces, and data flows. State what is deliberately out of scope. -->

## Validation

<!-- List the commands and manual browser cases run. Include a regression test for each fix. -->

```text
npm run typecheck
npm run lint
npx vitest run --coverage
npm run build:userscript
```

- [ ] UI changes follow DESIGN.md (tokens, both themes, contrast, reduced motion).

## Related issues

<!-- Use Fixes #123 or Closes #123 when this pull request fully resolves an issue. -->
