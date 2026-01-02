# Contributing to Detcord

Thank you for your interest in contributing to Detcord! This document provides guidelines and information to make the contribution process smooth and effective.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold this code. Please report unacceptable behavior by opening a GitHub issue.

## Getting Started

### Prerequisites

- Node.js 18 or later
- npm (comes with Node.js)
- A userscript manager (Tampermonkey, Violentmonkey, or Greasemonkey) for testing

### Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/detcord.git
cd detcord

# Install dependencies
npm install

# Verify setup
npm run test
npm run lint
npm run typecheck
```

### Available Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Build ES module and IIFE bundles |
| `npm run build:userscript` | Build userscript with Tampermonkey header |
| `npm run test` | Run tests once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run lint` | Check for linting issues |
| `npm run lint:fix` | Auto-fix linting issues |
| `npm run format` | Format code with Biome |
| `npm run typecheck` | Run TypeScript type checking |

## Ways to Contribute

### Good First Issues

Look for issues labeled [`good first issue`](https://github.com/welshwandering/detcord/labels/good%20first%20issue) - these are specifically chosen as entry points for new contributors.

### Types of Contributions

- **Bug fixes**: Found something broken? We'd love a fix!
- **Documentation**: Improvements to README, code comments, or guides
- **Tests**: Increase coverage or add missing test cases
- **Features**: New functionality (please discuss first in an issue)
- **Accessibility**: Improvements to keyboard navigation, ARIA labels, etc.
- **Performance**: Optimizations that don't change behavior

## Making Changes

### Before You Start

1. **Check existing issues** - someone may already be working on it
2. **Open an issue first** for significant changes to discuss the approach
3. **Read the architecture docs** - see `CLAUDE.md` for code conventions and structure

### Development Workflow

1. **Fork** the repository to your GitHub account
2. **Clone** your fork locally
3. **Create a branch** from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/issue-description
   ```
4. **Make your changes** with clear, incremental commits
5. **Test thoroughly**:
   ```bash
   npm run test
   npm run lint
   npm run typecheck
   ```
6. **Push** to your fork and open a Pull Request

### Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/) for clear history and automated changelogs:

```
type(scope): short description

[optional longer description]

[optional footer with issue references]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Code style (formatting, no logic change)
- `refactor`: Code restructuring (no feature/fix)
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**
```
feat(ui): add countdown animation before deletion

The countdown shows 3-2-1-BOOM sequence with abort option.
User can click anywhere to cancel during countdown.

Closes #42
```

```
fix(api): handle 202 response during search indexing

Discord returns 202 when search index is being built.
Now waits and retries instead of treating as error.
```

### Code Standards

#### TypeScript

- **Strict mode** - no `any` types allowed
- **Explicit return types** on public functions
- **Descriptive names** - avoid abbreviations
- **Small functions** - single responsibility principle

#### Style

- **Biome** handles all formatting
- **Tabs** for indentation
- **Single quotes** for strings
- **Semicolons** required

#### Testing

- **>80% coverage** required for new code
- **Co-located tests** - `foo.test.ts` next to `foo.ts`
- **Descriptive test names** - should read like documentation
- **Mock external dependencies** - don't hit real APIs

#### Documentation

- **JSDoc comments** for all exported functions
- **Update README** if adding user-facing features
- **Update CHANGELOG** for notable changes

### Pull Request Guidelines

1. **Fill out the PR template** completely
2. **Link related issues** using keywords (Closes #123)
3. **Keep PRs focused** - one feature or fix per PR
4. **Include tests** for new functionality
5. **Update docs** if behavior changes
6. **Respond to feedback** promptly

#### PR Title Format

Use the same format as commit messages:
```
feat(ui): add dark mode toggle
fix(token): handle expired session gracefully
docs: add troubleshooting section to README
```

## Testing

Tests use [Vitest](https://vitest.dev/) with jsdom for browser API simulation.

```bash
npm run test           # Run once
npm run test:watch     # Watch mode (recommended during development)
npm run test:coverage  # Generate coverage report
```

### Writing Tests

```typescript
import { describe, it, expect, vi } from 'vitest';
import { myFunction } from './my-module';

describe('myFunction', () => {
    it('should handle normal input', () => {
        expect(myFunction('test')).toBe('expected');
    });

    it('should throw on invalid input', () => {
        expect(() => myFunction(null)).toThrow();
    });
});
```

### Testing in Browser

1. Run `npm run build:userscript`
2. Install `dist/detcord.user.js` in your userscript manager
3. Open Discord in browser and test manually

## Reporting Issues

### Bug Reports

Use the [Bug Report template](https://github.com/welshwandering/detcord/issues/new?template=bug_report.yml) and include:

- Browser name and version
- Userscript manager and version
- Steps to reproduce
- Expected vs actual behavior
- Console errors (F12 → Console tab)
- Screenshots if helpful

### Feature Requests

Use the [Feature Request template](https://github.com/welshwandering/detcord/issues/new?template=feature_request.yml) and describe:

- The problem you're trying to solve
- Your proposed solution
- Alternative approaches you've considered
- Who would benefit from this feature

## Security Vulnerabilities

**Do NOT open public issues for security vulnerabilities.**

Report security issues via [GitHub Security Advisories](https://github.com/welshwandering/detcord/security/advisories/new). See [SECURITY.md](SECURITY.md) for our full security policy.

## Questions and Discussions

- **General questions**: Open a [Discussion](https://github.com/welshwandering/detcord/discussions)
- **Implementation questions**: Comment on the relevant issue
- **Architecture questions**: Check `CLAUDE.md` first, then open an issue

## Recognition

Contributors are recognized in:
- The GitHub contributors graph
- Release notes for significant contributions
- The README for major features

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
