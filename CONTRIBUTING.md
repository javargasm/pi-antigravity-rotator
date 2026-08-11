# Contributing to tuxevil-rotator

First off, thanks for taking the time to contribute! :tada:

## Code of Conduct

This project and everyone participating in it is governed by the [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## How Can I Contribute?

### Reporting Bugs

Before submitting a bug report, check the [issues](https://github.com/tuxevil/tuxevil-rotator/issues) to see if it has already been reported. When creating a bug report, include as many details as possible:

- A clear and descriptive title
- Steps to reproduce the behavior
- Expected vs actual behavior
- Your environment (OS, Node.js version, rotator version, Docker or npm install)
- Any relevant logs or screenshots

### Suggesting Features

Open a [discussion](https://github.com/tuxevil/tuxevil-rotator/discussions) first to describe your idea. Once the community agrees on the direction, convert it to an issue or submit a PR.

### Pull Requests

1. **Fork the repo** and create your branch from `main`.
2. **Run quality checks before committing:**
   ```bash
   npm run typecheck
   npm test
   npm run check
   ```
3. **Keep changes focused** — one feature or fix per PR.
4. **Write tests** for new functionality when applicable.
5. **Update documentation** — if you change behavior, update the README or relevant docs.
6. **Add yourself to the Contributors section** in README.md (optional but appreciated).
7. **Open a PR** against the `main` branch with a clear title and description.

### Git History

This repository recently underwent a git history rewrite to fix commit authorship. If your fork was created before July 2026, rebase before opening a PR:

```bash
git remote add upstream https://github.com/tuxevil/tuxevil-rotator.git
git fetch upstream
git rebase upstream/main
```

## Development Setup

```bash
git clone https://github.com/tuxevil/tuxevil-rotator.git
cd tuxevil-rotator
npm install
npm run typecheck
npm test
```

## Project Structure

```
src/           # Runtime TypeScript source
test/          # Test suite (run with: npm test)
bin/           # CLI entry point
tools/         # Ancillary tools (telemetry receiver, etc.)
```

## Coding Conventions

- **TypeScript** with strict mode. Run `npm run typecheck` before committing.
- **ESLint** is configured. Run `npm run lint` to check.
- **No commented-out code** — delete what you don't need.
- Follow the existing patterns in the file you're editing.

## Questions?

Open a [discussion](https://github.com/tuxevil/tuxevil-rotator/discussions) or join the [Discord](https://discord.gg/GgwVqTaKgK).
