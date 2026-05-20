---
title: Verify Recipes Matrix
sidebar_position: 11
---

# Verify Recipes Matrix

Auto-generated from `muonroi-cli/src/verify/recipes.ts` and `muonroi-cli/src/types/index.ts` (`VerifyRecipe`).
Run `node scripts/check-cli-docs-drift.mjs` to detect drift between source and docs.

## VerifyAppKind values

`VerifyAppKind` is the discriminator on each `VerifyRecipe.appKind`. The full union (`src/verify/recipes.ts:9-25`):

`astro`, `cra`, `django`, `dotnet`, `go`, `gradle`, `make`, `maven`, `nextjs`, `node`, `python`, `remix`, `rust`, `sveltekit`, `unknown`, `vite`.

## Matrix

Rows sorted alphabetically by `App kind`. Cell content reflects the literal commands returned by each detector. `—` = empty / not set.

| App kind | Detection marker(s) | Install cmd | Build cmd | Test cmd | Smoke kind | Default port |
|---|---|---|---|---|---|---|
| `astro` | `package.json` with `astro` dep (`src/verify/recipes.ts:222`) | `pnpm install` / `bun install` / `yarn install` / `npm install` (per lockfile) | `scripts.build`, `scripts.typecheck` (via package runner) | `scripts.test`, `scripts.check`, `scripts.lint` | `http` (when start command + port resolvable) | `4321` |
| `cra` | `package.json` with `react-scripts` dep (`src/verify/recipes.ts:230`) | per-lockfile package manager install | `scripts.build`, `scripts.typecheck` | `scripts.test`, `scripts.check`, `scripts.lint` | `http` | `3000` |
| `django` | `manage.py` present OR `django` in pyproject/requirements (`src/verify/recipes.ts:286,295`) | `pip install -r requirements.txt` (or `uv sync` / `poetry install` / `pipenv install` / `pip install -e .` per lockfile) | — | `python manage.py test` | `http` | `8000` |
| `dotnet` | Any `*.sln`, `*.csproj`, or `Directory.Build.props` within 2 levels (`src/verify/recipes.ts:423-487`) | `dotnet restore <target>` | `dotnet build <target> --no-restore` | `dotnet test <target> --no-build --nologo` | `none` | — |
| `go` | `go.mod` (`src/verify/recipes.ts:347-362`) | — | `go build ./...` | `go test ./...` | `none` | — |
| `gradle` | `build.gradle` or `build.gradle.kts` (`src/verify/recipes.ts:400`) | — | `./gradlew build` or `gradle build` | `./gradlew test` or `gradle test` | `none` | — |
| `make` | `Makefile` (`src/verify/recipes.ts:181-204`) | `make <install\|setup\|bootstrap>` (if target exists) | `make <build\|compile>` (if target exists) | `make <test\|check>` (if target exists) | `none` | — |
| `maven` | `pom.xml` (`src/verify/recipes.ts:384`) | — | `mvn package` | `mvn test` | `none` | — |
| `nextjs` | `package.json` with `next` dep (`src/verify/recipes.ts:214`) | per-lockfile package manager install | `scripts.build`, `scripts.typecheck` | `scripts.test`, `scripts.check`, `scripts.lint` | `http` | `3000` |
| `node` | `package.json` present, no web-framework dep matched (`src/verify/recipes.ts:207-274`) | per-lockfile package manager install | `scripts.build`, `scripts.typecheck` | `scripts.test`, `scripts.check`, `scripts.lint` | `http` if `scripts.dev`/`scripts.start` and port resolvable; otherwise `none` | inferred from `--port`/`-p`/`PORT=` in start command |
| `python` | `pyproject.toml`, `requirements.txt`, `setup.py`, or `manage.py` (`src/verify/recipes.ts:276-280`) — FastAPI-flavoured when `fastapi`/`uvicorn` in deps | `pip install -r requirements.txt` (or `uv sync` / `poetry install` / `pipenv install` / `pip install -e .`) | — | `pytest` if `tests/` else `python -m unittest discover` | `http` for FastAPI, otherwise `none` | `8000` (FastAPI) |
| `remix` | `package.json` with `@remix-run/dev` or `@remix-run/react` (`src/verify/recipes.ts:226`) | per-lockfile package manager install | `scripts.build`, `scripts.typecheck` | `scripts.test`, `scripts.check`, `scripts.lint` | `http` | `3000` |
| `rust` | `Cargo.toml` (`src/verify/recipes.ts:365-380`) | — | `cargo build` | `cargo test` | `none` | — |
| `sveltekit` | `package.json` with `@sveltejs/kit` dep (`src/verify/recipes.ts:218`) | per-lockfile package manager install | `scripts.build`, `scripts.typecheck` | `scripts.test`, `scripts.check`, `scripts.lint` | `http` | `5173` |
| `unknown` | No matchers fired (`src/verify/recipes.ts:489-505`) | — | — | — | `none` | — |
| `vite` | `package.json` with `vite` dep (`src/verify/recipes.ts:234`) | per-lockfile package manager install | `scripts.build`, `scripts.typecheck` | `scripts.test`, `scripts.check`, `scripts.lint` | `http` | `5173` |

### Notes per row

- **`dotnet`**: scanner descends two directory levels (skipping dotfiles, `node_modules`, `bin`, `obj`) — covers root and `src/`-nested layouts produced by `Muonroi.BaseTemplate` / `Muonroi.Microservices.Template` / `Muonroi.Modular.Template`. When `Directory.Build.props` is present, `appLabel` becomes `.NET (Muonroi BB)` and a note is added: "run `pwsh scripts/check-modular-boundaries.ps1` after build if the script is present" (`src/verify/recipes.ts:466-472`).
- **Node-family** (`nextjs`, `vite`, `astro`, `sveltekit`, `remix`, `cra`): also emit bootstrap commands (`apt-get install nodejs npm`, optional Bun installer) and shell init (`DEBIAN_FRONTEND=noninteractive`, optional `BUN_INSTALL`/`PATH` exports) — see `getNodeWebShellInitCommands` / `getNodeWebBootstrapCommands` (`src/verify/recipes.ts:88-119`).
- **Package manager** is detected via lockfile presence in `detectPackageManager` (`src/verify/recipes.ts:65-82`): `pnpm-lock.yaml`→`pnpm`, `bun.lock`/`bun.lockb`→`bun`, `yarn.lock`→`yarn`, `package-lock.json`→`npm`, `uv.lock`→`uv`, `poetry.lock`→`poetry`, `Pipfile.lock`→`pipenv`.

## Fallback behavior

`inferFallbackRecipe` (`src/verify/recipes.ts:507-517`) tries detectors in this order:

1. If `package.json` parsed: `detectNodeRecipe` (always wins for JS/TS).
2. Otherwise: `detectPythonRecipe` → `detectGoRecipe` → `detectRustRecipe` → `detectJavaRecipe` → `detectDotnetRecipe` → `detectFallbackRecipe`.

`detectFallbackRecipe` itself tries `detectMakeRecipe` first; only if no `Makefile` exists does it return the `unknown` recipe (`appLabel: "Unknown project type"`, empty commands, evidence `["No known app metadata detected"]`, note instructing the verify sub-agent to derive commands by inspecting the repo). When `unknown` reaches CB-3 (verify gate), the sprint halts and asks the user to provide a manifest.

## How to extend

To add a new ecosystem (e.g. Elixir/Mix):

1. **Detector**: export `detectMixRecipe(cwd: string): VerifyRecipe | null` in `src/verify/recipes.ts`. Return `null` when markers (`mix.exs`) are absent; otherwise return a fully populated `VerifyRecipe` with `ecosystem: "elixir"`, `appKind: "mix"`, install/build/test commands, and evidence strings.
2. **Wire-in**: add `detectMixRecipe(cwd) ??` into the `inferFallbackRecipe` chain (`src/verify/recipes.ts:507-517`) in the priority slot you want.
3. **Union**: add `"mix"` to the `VerifyAppKind` union (`src/verify/recipes.ts:9-25`) AND to the literal array inside `normalizeVerifyAppKind` (`src/verify/recipes.ts:142-165`). Both edits are required — the union gives compile-time safety, the array gates runtime normalization.

Run `bunx tsc --noEmit` after — TypeScript will flag any switch/match expressions that need updating for the new variant. Add a row to this matrix and re-run `node scripts/check-cli-docs-drift.mjs`.
