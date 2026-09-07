# Release runbook

Detcord releases are tag-driven. A version tag starts CI; the release job publishes the matching userscript only after validation and asset checks succeed.

## Prerequisites

- Maintainer access to `canaryframe/detcord`
- A clean, up-to-date `main` branch
- Node.js 22.12 or later; Node.js 24 recommended
- npm
- GitHub CLI authenticated as a maintainer
- Working commit and tag signing

`npm version` creates a version commit and tag. Configure Git and npm so both are signed before starting:

```bash
git config commit.gpgSign true
npm config set sign-git-tag true
```

If signing fails, stop. Do not publish an unsigned version commit or tag.

## Standard release

### 1. Prepare the changelog

Move the relevant entries from `Unreleased` to the release version and date. Confirm that user-visible changes, security changes, removals, and known limitations are represented.

### 2. Validate the release candidate

```bash
npm ci
npm run typecheck
npm run lint
npx vitest run --coverage
npm run build:userscript
test -s dist/detcord.user.js
```

Install `dist/detcord.user.js` in a clean userscript-manager profile and check the target, preview, confirmation, Stop, and completion flow.

### 3. Create the signed version commit and tag

Choose the Semantic Versioning increment:

```bash
npm version minor
```

Use `npm version patch` for a backwards-compatible fix or `npm version major` for a breaking release.

Inspect the generated version and tag:

```bash
git --no-pager show --stat --oneline HEAD
git tag --points-at HEAD
git verify-commit HEAD
version=$(node -p "'v' + require('./package.json').version")
git tag -v "$version"
```

### 4. Push the commit and tag

```bash
git push origin main --follow-tags
```

The tag, not an ordinary branch push, starts the release process.

### 5. Watch CI

The tag workflow must complete these stages:

1. Install with `npm ci` on Node.js 24.
2. Run Biome.
3. Run TypeScript checking.
4. Run Vitest with coverage.
5. Build `dist/detcord.user.js`.
6. Verify that the asset exists and is not empty.
7. Create the GitHub release for the tag.
8. Upload `detcord.user.js`.
9. Verify that the release contains the asset.

The release job must fail rather than publish a release without `detcord.user.js`.

### 6. Check the published release

Confirm the release and permanent download URL:

```bash
version=$(node -p "'v' + require('./package.json').version")
gh release view "$version"
curl --fail --location --output /tmp/detcord.user.js \
  https://github.com/canaryframe/detcord/releases/latest/download/detcord.user.js
test -s /tmp/detcord.user.js
```

Open the downloaded file and confirm that its userscript banner contains the released version. Perform a fresh install through the permanent URL.

## Hotfix

1. Reproduce and fix the problem from current `main`.
2. Add a regression test and update the changelog.
3. Run the full release-candidate validation.
4. Create a signed patch version with `npm version patch`.
5. Push the version commit and tag.
6. Verify the replacement release and permanent download URL.

Do not reuse or move an existing release tag.

## Bad release and rollback

GitHub immutable releases must not be edited to replace an asset or change release contents. A bad release is superseded by a new version.

1. Open an issue describing the impact and affected version unless the matter is security-sensitive.
2. Revert or fix the faulty change on `main`.
3. Add a regression test.
4. Update the changelog with the affected and replacement versions.
5. Create a new signed patch version.
6. Push the new tag and allow CI to publish a new release.
7. Verify that `/releases/latest/download/detcord.user.js` resolves to the replacement.

Do not delete, retag, or edit the immutable bad release. Its history remains available for diagnosis.

## Versioning

- **Major**: incompatible behaviour or distribution change
- **Minor**: backwards-compatible feature release
- **Patch**: backwards-compatible bug or security fix

## Release completion

A release is complete only when:

- The signed version commit and tag are on GitHub.
- CI, tests, type checking, linting, and build have passed.
- The GitHub release exists for the tag.
- `detcord.user.js` is present and non-empty.
- The permanent download URL returns that asset.
- A fresh browser installation succeeds.
