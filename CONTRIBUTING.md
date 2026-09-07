# Contributing to Detcord

Contributions are welcome when they are focused, tested, and consistent with the browser-only security model.

## Code of conduct

Participation is governed by the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). Report public conduct concerns through a [GitHub issue](https://github.com/canaryframe/detcord/issues); use a [private security advisory](https://github.com/canaryframe/detcord/security/advisories/new) when a report contains sensitive information.

## Before starting

1. Search [existing issues](https://github.com/canaryframe/detcord/issues).
2. Open an issue before a substantial feature or architectural change.
3. Read [AGENTS.md](AGENTS.md) for the architecture, API contracts, security rules, and testing conventions.

GitHub Discussions is not enabled. Use Issues for support, questions, design proposals, and implementation discussion.

## Prerequisites

- Node.js 22.12 or later; Node.js 24 is recommended and used in CI
- npm
- Tampermonkey or Violentmonkey for browser testing

## Development setup

```bash
git clone https://github.com/YOUR_USERNAME/detcord.git
cd detcord
npm install
npm run typecheck
npm run lint
npm run test
```

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server. |
| `npm run build` | Build the development bundles. |
| `npm run build:userscript` | Build `dist/detcord.user.js`. |
| `npm run test` | Run the Vitest suite once. |
| `npm run test:watch` | Run Vitest in watch mode. |
| `npm run test:coverage` | Run tests and produce the coverage report. |
| `npm run lint` | Check the repository with Biome. |
| `npm run lint:fix` | Apply safe Biome fixes. |
| `npm run format` | Format supported files with Biome. |
| `npm run typecheck` | Run strict TypeScript checking. |

## Ways to contribute

- Fix a reproducible bug.
- Add tests for an uncovered behaviour.
- Improve documentation or accessibility.
- Reduce browser work or memory use without changing behaviour.
- Propose a feature through an issue before implementing it.

Issues labelled [`good first issue`](https://github.com/canaryframe/detcord/labels/good%20first%20issue) are intended to have limited scope and enough context for a first contribution.

## Workflow

1. Fork the repository and create a branch from `main`.
2. Make one focused change.
3. Add a test that fails against the old behaviour for every fix.
4. Run the relevant tests, then the complete validation commands.
5. Update user and developer documentation when behaviour changes.
6. Push the branch and open a pull request using a Conventional Commit title.

Example branch names:

```text
fix/resume-cursor
feat/dry-run
docs/chromium-install
```

## Commit messages

Commits follow [Conventional Commits](https://www.conventionalcommits.org/) and are checked in CI. Contributors remain responsible for checking messages before pushing.

```text
fix(engine): preserve filters during retry

Keep the configured content and attachment filters when a search is
retried after Discord returns a temporary indexing response.

Closes #42
```

Common types are `feat`, `fix`, `docs`, `refactor`, `test`, `ci`, and `chore`.

## Code standards

### TypeScript

- Keep strict type checking enabled, including `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`.
- Do not introduce `any` or unsafe type assertions to bypass a contract.
- Add JSDoc to exported functions.
- Reuse shared validators, storage helpers, and typed errors.
- Keep functions below Biome's cognitive-complexity limit.

### Formatting

- Use two spaces for indentation.
- Use single quotes in TypeScript.
- Use semicolons.
- Run Biome rather than formatting files by hand.

### Browser and security constraints

- The production result must remain a single browser userscript without runtime dependencies.
- Tokens must never be logged, persisted, or sent outside `discord.com`.
- Only the signed-in user's messages may be deleted.
- API pacing and Discord's rate-limit responses must be respected.
- User-controlled content must be rendered safely.

## Testing

Tests use Vitest with jsdom and are co-located with source files.

- Stub `fetch`; tests must never call Discord.
- Use the actual `DiscordApiError` shapes produced by the API client.
- Cover both the success path and the relevant failure or cancellation path.
- Use fake timers carefully and restore them after each test.
- Keep browser-only APIs isolated behind small helpers where possible.

Tests run in CI on every pull request; coverage is reported.

Before opening a pull request, run:

```bash
npm run typecheck
npm run lint
npx vitest run --coverage
npm run build:userscript
```

For manual browser testing:

1. Build with `npm run build:userscript`.
2. Install `dist/detcord.user.js` in a userscript manager.
3. Test at [discord.com/app](https://discord.com/app) using messages you can safely delete.
4. Check preview, cancellation, Stop, resume, and completion reporting where relevant.

## Pull requests

Explain the problem, root cause, and exact change. Name affected functions and data flows where useful. Link the issue with `Closes #123` when the pull request fully resolves it.

Keep unrelated formatting and refactoring out of the change. Pull requests that alter behaviour need regression tests and corresponding documentation.

## Reporting bugs and requesting features

- Use the [bug report form](https://github.com/canaryframe/detcord/issues/new?template=bug_report.yml) for reproducible faults.
- Use the [feature request form](https://github.com/canaryframe/detcord/issues/new?template=feature_request.yml) for proposals.
- Use a normal [GitHub issue](https://github.com/canaryframe/detcord/issues/new/choose) for questions that do not fit either form.

Never include a Discord token or private message content in an issue.

## Security reports

Do not report vulnerabilities publicly. Use [GitHub Security Advisories](https://github.com/canaryframe/detcord/security/advisories/new) and follow [SECURITY.md](SECURITY.md).

## Releases

Maintainers follow the tag-driven process in [docs/RELEASE_RUNBOOK.md](docs/RELEASE_RUNBOOK.md). A release is not complete until CI has attached and verified `detcord.user.js`.

## Licence

By contributing, you agree that your contribution is licensed under the [MIT Licence](LICENSE).
