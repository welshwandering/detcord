# Release Runbook

This document describes the release process for Detcord.

## Automated Releases

Releases are automatically created when changes are merged to `main` (excluding documentation-only changes).

The GitHub Actions workflow (`release.yml`) will:
1. Run all tests
2. Build the userscript
3. Create a GitHub release with the version from `package.json`
4. Attach `detcord.user.js` as a release asset

## Manual Release Process

If you need to create a release manually:

### Prerequisites
- Write access to the repository
- Node.js 18+ installed
- GitHub CLI (`gh`) installed and authenticated

### Steps

1. **Update version in package.json**
   ```bash
   npm version patch  # or minor/major
   ```

2. **Update CHANGELOG.md**
   - Add a new section for the version
   - Document all notable changes

3. **Create a PR for the version bump**
   ```bash
   git checkout -b release/v1.x.x
   git add package.json package-lock.json CHANGELOG.md
   git commit -m "chore: bump version to 1.x.x"
   git push -u origin release/v1.x.x
   gh pr create --title "Release v1.x.x" --body "Version bump for release"
   ```

4. **Merge the PR**
   - Wait for CI to pass
   - Get approval if required
   - Merge to main

5. **Verify release was created**
   - Check [Releases](https://github.com/welshwandering/detcord/releases)
   - Verify the userscript is attached
   - Test installation in a fresh browser

### Versioning

We follow [Semantic Versioning](https://semver.org/):

- **MAJOR** (1.0.0 -> 2.0.0): Breaking changes
- **MINOR** (1.0.0 -> 1.1.0): New features, backwards compatible
- **PATCH** (1.0.0 -> 1.0.1): Bug fixes, backwards compatible

### Hotfix Process

For urgent fixes:

1. Create a hotfix branch from `main`
   ```bash
   git checkout main && git pull
   git checkout -b hotfix/issue-description
   ```

2. Make the fix, update version (patch bump)

3. Create PR with `hotfix` label

4. Fast-track review and merge

### Rollback Process

If a release has critical issues:

1. Create a revert PR
   ```bash
   git revert HEAD
   git push -u origin revert-release
   gh pr create --title "Revert: v1.x.x" --body "Reverting due to critical issue"
   ```

2. Merge quickly

3. Delete the problematic release from GitHub

4. Investigate and fix the issue in a new PR

## Release Checklist

Before any release:

- [ ] All tests pass (`npm run test`)
- [ ] TypeScript compiles (`npm run typecheck`)
- [ ] Lint passes (`npm run lint`)
- [ ] Build succeeds (`npm run build:userscript`)
- [ ] CHANGELOG.md updated
- [ ] Version bumped in package.json
- [ ] Tested manually in browser

## Post-Release

After a release:

1. Verify the release page looks correct
2. Test fresh installation of the userscript
3. Monitor GitHub Issues for bug reports
4. Update documentation if needed
