# CLI design: collection-level vs single-item commands

Research note for Skillset. Question: how do real CLIs let one tool both **apply a whole collection** (manifest, bundle, profile, lockfile) and **install or add one item**, without blurring the two? This note gathers evidence and does not decide anything. The options and open questions for Skillset are at the end.

- Researched: 2026-11-16.
- Sources: only official docs, man pages, `--help` text, source code, and maintainer PRs and issues. Each claim links to its source. Links to source code are pinned to the commit that was read, where the commit was recorded.
- Pinned commits: `vercel-labs/skills` `50894c1d`, `pnpm/pnpm` `7f41ed8f`, `yarnpkg/berry` `f359f65c`, `ruby/rubygems` `5879ffe3`, `jetify-com/devbox` `cbbd7f05`, `microsoft/apm` `f574a62c`, `cli/cli` `0536d5e5`.

## Reading guide

Each tool is described along six axes:

- **(a) Apply collection**: the command that installs everything a collection lists.
- **(b) Add item to collection**: the command that writes one item into the collection (and maybe installs it).
- **(c) Item without collection**: the command that installs or runs one item without recording it in any collection. This can be ephemeral, or global at user level.
- **(d) Collection reference**: how the command finds the collection: an implicit file, a `--file` flag, a positional name, or `--global`.
- **(e) Positional disambiguation**: how the CLI tells a collection reference from an item reference when both could sit in the same argument slot.
- **(f) Rationale**: the reasons maintainers have documented.

## Comparison table

The table is a summary. Each per-tool section below cites the source for every cell.

| Tool | (a) Apply collection | (b) Add item to collection | (c) Item without collection | (d) Collection reference | (e) Positional disambiguation |
| --- | --- | --- | --- | --- | --- |
| Vercel `skills` | `skills install` / `i` with no source (alias of `experimental_install`) | `skills add <source>` (also `install <source>`) installs and records the skill in `skills-lock.json` | `skills use <source>@<skill>` (temp dir, nothing installed) | Implicit `./skills-lock.json` | Arity: no source means restore. `@v1.2.3` or a SHA means a pin, other `@x` means a skill. `remove` tries a skill name first, then an exact source |
| npm | `npm install` (no args), `npm ci` | `npm install <pkg>` (saves by default) | `npm install -g <pkg>`, `npm exec` / `npx` | Implicit `package.json` in package root | Arity. The collection is never positional |
| pnpm | `pnpm install` | `pnpm add <pkg>`. `pnpm install <pkg>` is rewritten to `add` | `pnpm add -g <pkg>`, `pnpm dlx`. `pnpm install -g` is an error | Implicit | Arity (rewrite to `add`) |
| Yarn Berry | `yarn install` / `yarn` | `yarn add` | `yarn dlx` (`yarn global` removed) | Implicit | `install` takes no positionals |
| Yarn Classic | `yarn install` | `yarn add` | `yarn global add` | Implicit | `yarn install <pkg>` is an error that names `yarn add` |
| Bun | `bun install`, `bun ci` | `bun add` (and `bun install <pkg>`) | `bun add -g` / `bun install -g`, `bunx` | Implicit | Arity |
| Deno | `deno install` | `deno add` = `deno install <pkgs>` | `deno install -g`, `deno x` | Implicit `deno.json` / `package.json` | Arity plus the `-g` flag. `jsr:` prefix |
| cargo | No restore verb. `cargo fetch` downloads, the build installs | `cargo add` | `cargo install` (user-level binaries) | `--manifest-path` | Separate verbs |
| Go | Build reads `go.mod` | `go get` (go.mod only, since 1.18) | `go install pkg@version` | Implicit `go.mod` | A `@version` suffix means "ignore the current module" |
| uv | `uv sync` (exact); `uv pip install -r <file>` | `uv add` | `uv tool install`, `uvx` | Implicit `pyproject.toml`; `-r <file>` | Separate verbs and namespaces; `-r` marks a file |
| Poetry | `poetry install` (additive), `poetry sync` (exact) | `poetry add` | none in the Poetry CLI | Implicit `pyproject.toml` | Separate verbs |
| Bundler | `bundle install` | `bundle add <gem>` | (RubyGems `gem install`, not checked here) | Implicit `Gemfile`; `--gemfile` | `install` takes no gem names |
| Homebrew | `brew bundle` / `brew bundle install` | `brew bundle add <name>` | `brew install <formula>` | Implicit `Brewfile`; `--file`; `-g/--global` = global Brewfile | Collection verbs live under the `bundle` namespace |
| mise | `mise install` (no args) | `mise use tool@ver` | `mise install tool@ver` (not recorded), `mise exec` / `x` | Nearest config; `-g` = global config; `-p/--path` | Arity; `TOOL@VERSION` |
| asdf | `asdf install` (no args) | `asdf set <name> <ver>` | `asdf install <name> <ver>` | `.tool-versions`; `set -u` = home file | Arity (0, 1, or 2 args) |
| Claude Code plugins | No bulk restore. Each plugin is installed per clone | `claude plugin install <p>@<mkt> --scope project` writes `enabledPlugins` | `claude --plugin-dir` / `--plugin-url` (session only) | Scope flag picks a settings file | `name@marketplace`; paths must start `./` |
| Docker Compose | `docker compose up` | none: you edit the file | (`docker run`, not checked here) | `-f` (repeatable), `-p` project name | Positional `[SERVICE...]` only picks a subset |
| Helm | `helm dependency build` (lock) / `update` | edit `Chart.yaml` | `helm install [NAME] [CHART]` | Chart directory positional | `repo/chart` reference; `./` path; `oci://` |
| VS Code | Profiles (import); extension packs; workspace recommendations | add id to `extensionPack` / `recommendations` | `code --install-extension <id>` | `--profile <name>` | `publisher.extension` id vs `.vsix` path |
| devbox | `devbox install` | `devbox add <pkg>` | `devbox global add` (global collection) | `-c/--config`; `global` namespace | Separate namespace |
| Nix | profile manifest (`nix profile upgrade`, rollback) | `nix profile add <installable>` | `nix run`, `nix shell` | `--profile <path>` | `flakeref#attr` |
| winget | `winget import -i <file>` | none: you `export` the file | `winget install <query>` (alias `add`) | Flagged file argument | Separate verbs |
| Microsoft APM | `apm install` (no args), `--frozen` | `apm install <ref>` (writes `apm.yml`), `--skill` saved | none; `-g` = user manifest | Implicit `apm.yml`; `-g` = `$APM_HOME/apm.yml` | Arity; `NAME@MARKETPLACE[#ref]`; `./` path |
| `gh skill` (preview) | none (no manifest) | none | `gh skill install <repo> [<skill[@ver]>]` (alias `add`) | n/a | Two positionals; `--from-local` |
| `gh extension` | none | none | `gh extension install <repo>` | n/a | n/a |
| openskills | none (`sync` writes `AGENTS.md`) | none | `openskills install <source>` | n/a | n/a |

## Per-tool notes

### 1. Vercel `skills` CLI

Skillset wraps this CLI, so it is covered in the most detail.

**Commands.** The `--help` text lists `add <package>` (alias `a`), `use <package>@<skill>`, `remove`, `list`/`ls`, `experimental_install` ("Restore skills from skills-lock.json (alias: install, i)") and `experimental_sync` (alias `sync`) ([cli.ts help](https://github.com/vercel-labs/skills/blob/50894c1d98bc45ca1ab127213e59d6525065b5e7/src/cli.ts#L134-L160)). The dispatcher also routes `find`/`search`/`f`/`s`, `init`, `remove`/`rm`/`r`, `check`, and `update`/`upgrade` ([cli.ts dispatch](https://github.com/vercel-labs/skills/blob/50894c1d98bc45ca1ab127213e59d6525065b5e7/src/cli.ts#L355-L428)). The README command table also lists `find`, `list`, `use`, `check`, `update`, `remove` and `init` ([README](https://github.com/vercel-labs/skills/blob/50894c1d98bc45ca1ab127213e59d6525065b5e7/README.md)).

- **(a) Apply collection.** `skills install` and `skills i` with no source are aliases for `experimental_install`. With a source, they behave like `skills add` ([commands.md, Restore](https://github.com/vercel-labs/skills/blob/50894c1d98bc45ca1ab127213e59d6525065b5e7/docs/commands.md)). The code reads: `` // `skills install` with no source restores skills-lock.json, like `npm install` `` ([cli.ts L373-L393](https://github.com/vercel-labs/skills/blob/50894c1d98bc45ca1ab127213e59d6525065b5e7/src/cli.ts#L373-L393)). Restore never prompts. It links to the agents given with `--agent`, else to the agents last chosen with `skills add`, else to the agents detected on the machine. `--frozen-lockfile` is the default in CI ([commands.md](https://github.com/vercel-labs/skills/blob/50894c1d98bc45ca1ab127213e59d6525065b5e7/docs/commands.md); [install.ts L16-L40](https://github.com/vercel-labs/skills/blob/50894c1d98bc45ca1ab127213e59d6525065b5e7/src/install.ts#L16-L40)). Restore reads only the project lock. An issue reporter notes there is no restore from the global lock `~/.agents/.skill-lock.json`, and no maintainer has replied ([#683](https://github.com/vercel-labs/skills/issues/683)).
- **(b) Add item to collection.** `skills add <source>` installs the skill. For project scope, it also records the skill in `skills-lock.json` (v2 entries carry `computedHash`, and `commit` for Git sources) ([README, Lock File Content Hash](https://github.com/vercel-labs/skills/blob/50894c1d98bc45ca1ab127213e59d6525065b5e7/README.md)). So in Vercel's CLI **the lockfile is the collection**. There is no separate manifest that you edit before installing. A second, declarative collection exists in `package.json` (`"skills": [...]`), which `experimental_sync` consumes. A package can publish such an array as a "shareable skill pack" ([commands.md, experimental_sync](https://github.com/vercel-labs/skills/blob/50894c1d98bc45ca1ab127213e59d6525065b5e7/docs/commands.md); [RFC #2323](https://github.com/vercel-labs/skills/issues/2323)).
- **(c) Item without collection.** `skills use <source>@<skill>` writes the skill to a temporary directory. It prints a prompt, or with `--agent` it launches an agent ([commands.md, skills use](https://github.com/vercel-labs/skills/blob/50894c1d98bc45ca1ab127213e59d6525065b5e7/docs/commands.md)). `-g` installs to user directories ("`~/<agent>/skills/`") ([commands.md, Installation Scope](https://github.com/vercel-labs/skills/blob/50894c1d98bc45ca1ab127213e59d6525065b5e7/docs/commands.md)) and is tracked in a separate global lock ([commands.md, remove](https://github.com/vercel-labs/skills/blob/50894c1d98bc45ca1ab127213e59d6525065b5e7/docs/commands.md)).
- **(d) Collection reference.** The collection is always implicit: `skills-lock.json` in the project root, or the global lock with `-g` ([commands.md](https://github.com/vercel-labs/skills/blob/50894c1d98bc45ca1ab127213e59d6525065b5e7/docs/commands.md)). A personal `skills-lock.local.json` merged over the shared lock was proposed and closed without merge ([PR #2730](https://github.com/vercel-labs/skills/pull/2730)).
- **(e) Positional disambiguation.** For `install`, the CLI switches on arity: no source means restore, otherwise add ([cli.ts L379](https://github.com/vercel-labs/skills/blob/50894c1d98bc45ca1ab127213e59d6525065b5e7/src/cli.ts#L373-L393)). For `owner/repo@x`, a value shaped like a version (`v1.2.3`, `1.2.3`, `v1.2`) or a full SHA is a checkout pin. Anything else is a skill name. "A single number such as `v2` is ambiguous and stays a skill name. Branch pins use `#ref`" ([source-parser.ts L446-L456](https://github.com/vercel-labs/skills/blob/50894c1d98bc45ca1ab127213e59d6525065b5e7/src/source-parser.ts#L446-L456), [L691-L711](https://github.com/vercel-labs/skills/blob/50894c1d98bc45ca1ab127213e59d6525065b5e7/src/source-parser.ts#L691-L711)). For `remove <x>`, "Lock keys win". If `x` is not a skill name, it is treated as an exact lock source ([remove.ts L61-L75](https://github.com/vercel-labs/skills/blob/50894c1d98bc45ca1ab127213e59d6525065b5e7/src/remove.ts#L61-L75)). That is a lookup with fallback.
- **(f) Rationale.** PR #2683 (merged 2026-11-06) says `install`/`i` used to be plain aliases for `add`, so a bare `skills install` "failed with `Missing required argument: source`, although AGENTS.md says it restores `skills-lock.json`" ([PR #2683](https://github.com/vercel-labs/skills/pull/2683)). The open PR #2714 graduates the command as `install  Restore skills from skills-lock.json (alias: i) / With a package, works like add` ([PR #2714](https://github.com/vercel-labs/skills/pull/2714)). The original user request asked for `npx skills install` with `npx skills ci` as a strict alias, "mirroring `npm install` vs `npm ci`" ([#549](https://github.com/vercel-labs/skills/issues/549)). An earlier community PR proposed a Brewfile-like `.skills` file with `./.skills` then `~/.skills` lookup and a `--sync` flag. The only maintainer response is a collaborator asking another maintainer for an opinion ([PR #134](https://github.com/vercel-labs/skills/pull/134)).
- **Flags.** `-g/--global` means user scope on `add`, `remove`, `list` ("List only global skills") and `update`. `-a/--agent`, `-s/--skill`, `-y/--yes`, `-l/--list`, `--copy` and `--all` apply to `add`. `-p/--project` applies to `update` ([commands.md](https://github.com/vercel-labs/skills/blob/50894c1d98bc45ca1ab127213e59d6525065b5e7/docs/commands.md)). So in Vercel's CLI, `-g` always means scope, on every subcommand.

### 2. JavaScript package managers

**npm.**
- (a) `npm install` with no arguments "Install[s] the dependencies to the local `node_modules` folder" and installs every module listed in `package.json` ([npm-install](https://github.com/npm/cli/blob/latest/docs/lib/content/commands/npm-install.md)). `npm ci` requires a lockfile, exits instead of updating it, and "can only install entire projects at a time: individual dependencies cannot be added with this command" ([npm-ci](https://github.com/npm/cli/blob/latest/docs/lib/content/commands/npm-ci.md)).
- (b) `npm install <name>` saves the package to `dependencies` by default. `--no-save` prevents this ([npm-install](https://github.com/npm/cli/blob/latest/docs/lib/content/commands/npm-install.md)).
- (c) A global install (`-g`) puts packages under the prefix: "Install it **globally** if you're going to run it on the command line" ([folders](https://github.com/npm/cli/blob/latest/docs/lib/content/configuring-npm/folders.md)). `npm exec` installs missing packages "to a folder in the npm cache" and runs them ([npm-exec](https://github.com/npm/cli/blob/latest/docs/lib/content/commands/npm-exec.md)). With `-g` and no arguments, `npm install` installs the current package globally ([npm-install](https://github.com/npm/cli/blob/latest/docs/lib/content/commands/npm-install.md)).
- (e) A package argument can be a folder, a tarball, a URL (it "must start with `http://` or `https://`"), `name@version`, or a git URL. The collection is never positional ([npm-install](https://github.com/npm/cli/blob/latest/docs/lib/content/commands/npm-install.md)).
- (f) "`package.json` is the source of truth for acceptable version ranges. When the lockfile's versions satisfy the `package.json` ranges, the lockfile wins" ([npm-install](https://github.com/npm/cli/blob/latest/docs/lib/content/commands/npm-install.md)).

**pnpm.** Correction to the brief: pnpm does **not** reject `pnpm install <pkg>`. It rewrites it to `add`. What pnpm rejects is `pnpm install -g`.
- (a) "`pnpm install` is used to install all dependencies for a project." In CI, the install fails if the lockfile needs an update ([pnpm install](https://github.com/pnpm/pnpm.io/blob/main/docs/cli/install.md)).
- (b) `pnpm add <pkg>` ([pnpm add](https://github.com/pnpm/pnpm.io/blob/main/docs/cli/add.md)). The argument parser contains `if (cmd === 'install' && params.length > 0) { cmd = 'add' }` ([parse-cli-args](https://github.com/pnpm/pnpm/blob/7f41ed8f10a7fd4779f0d3b9a6311a44313c489b/pnpm11/cli/parse-cli-args/src/index.ts)). The Rust port keeps this on purpose: "an `install` that was given a package name resolves to `add`, so `pnpm i valibot` saves the dependency instead of installing the project" ([install_as_add.rs](https://github.com/pnpm/pnpm/blob/7f41ed8f10a7fd4779f0d3b9a6311a44313c489b/pnpm/crates/cli/src/install_as_add.rs)). pnpm v2–v4 had a separate docs page titled `pnpm install <pkg>` ([archived v4 docs](https://github.com/pnpm/pnpm.io/blob/main/versioned_docs_archived/version-4.x/pnpm-install-pkg.md)).
- (c) `pnpm add -g sax` "Install package globally" ([pnpm add](https://github.com/pnpm/pnpm.io/blob/main/docs/cli/add.md)). `pnpm install -g` throws `"pnpm install -g" is not supported. Use "pnpm add -g <pkg>" to install global packages.` ([install.ts L231-L233](https://github.com/pnpm/pnpm/blob/7f41ed8f10a7fd4779f0d3b9a6311a44313c489b/pnpm11/installing/commands/src/install.ts#L231-L233)). `pnpm dlx` "Fetches a package from the registry without installing it as a dependency" ([pnpm dlx](https://pnpm.io/cli/dlx)).

**Yarn Berry (Modern).**
- (a) "Running `yarn` is enough to run an install! It's an alias to `yarn install`." (b) "Adding or updating a dependency to a single package is done with `yarn add`" ([usage.mdx](https://github.com/yarnpkg/berry/blob/f359f65c1f8bb2efb051b3e55edcdc3cb461d159/packages/docusaurus/docs/getting-started/basics/usage.mdx)). The `install` command declares only options and no positional arguments ([install.ts](https://github.com/yarnpkg/berry/blob/f359f65c1f8bb2efb051b3e55edcdc3cb461d159/packages/plugin-essentials/sources/commands/install.ts)). `--immutable` defaults to true in CI (same file).
- (c) and (f): "Yarn focuses on *project management*, and managing system-wide packages was deemed to be outside of our scope. As a result, `yarn global` got removed and needs to be replaced by `yarn dlx` to run one off scripts" ([migrating/steps.mdx](https://github.com/yarnpkg/berry/blob/f359f65c1f8bb2efb051b3e55edcdc3cb461d159/packages/docusaurus/docs/getting-started/migrating/steps.mdx); [berry#821](https://github.com/yarnpkg/berry/issues/821)).

**Yarn Classic (1.x).** `yarn install <args>` raises `` `install` has been replaced with `add` to add new dependencies. Run $0 instead. `` With `--global`, it raises `` `--global` has been deprecated. Please run $0 instead. `` and suggests `global add` ([install.js L1160-L1191](https://github.com/yarnpkg/yarn/blob/master/src/cli/commands/install.js#L1160-L1191); [en.js](https://github.com/yarnpkg/yarn/blob/master/src/reporters/lang/en.js)). This is the clearest "hard verb split" with a teaching error.

**Bun.**
- (a) `bun install` installs all dependencies. For reproducible installs, use `--frozen-lockfile` or `bun ci` ([bun install](https://github.com/oven-sh/bun/blob/main/docs/pm/cli/install.mdx)).
- (b) `bun add preact` ([bun add](https://github.com/oven-sh/bun/blob/main/docs/pm/cli/add.mdx)). `bun install react` is also documented under "Basic Usage" ([bun install](https://github.com/oven-sh/bun/blob/main/docs/pm/cli/install.mdx)).
- (c) `bun add --global` (aliases `bun install -g`) "does not modify the `package.json` of your current project, or one in your home directory: Bun keeps its own in the global directory" ([bun add](https://github.com/oven-sh/bun/blob/main/docs/pm/cli/add.mdx)). So the global install is still a hidden collection. `bunx` auto-installs and runs packages ([bunx](https://github.com/oven-sh/bun/blob/main/docs/pm/bunx.mdx)).

**Deno.**
- (a) `deno install` with no arguments installs all dependencies in `deno.json` and/or `package.json`. (b) `deno install [PACKAGES]` adds packages to `deno.json` or `package.json`, and "`deno add` … is an alias to `deno install [PACKAGES]`" ([deno install](https://github.com/denoland/docs/blob/main/runtime/reference/cli/install.md); [deno add](https://github.com/denoland/docs/blob/main/runtime/reference/cli/add.md)).
- (c) `deno install --global [PACKAGE_OR_URL]` creates "a thin, executable shell script" in the installation root ([deno install](https://github.com/denoland/docs/blob/main/runtime/reference/cli/install.md)). `deno x` "executes a package from npm or JSR without installing it permanently" ([deno x](https://github.com/denoland/docs/blob/main/runtime/reference/cli/x.md)).
- (e) The `--global` flag switches `install` into a different operation. JSR packages need a `jsr:` prefix "to stay unambiguous", and unprefixed names are npm packages since Deno 2.8 ([deno install](https://github.com/denoland/docs/blob/main/runtime/reference/cli/install.md)).

### 3. cargo, Go, uv, pip, Poetry, Bundler

**cargo.**
- (a) There is no restore verb. `cargo fetch` downloads all dependencies in `Cargo.lock` so later commands can run offline ([cargo fetch](https://doc.rust-lang.org/cargo/commands/cargo-fetch.html)).
- (b) "`cargo add` — Add dependencies to a Cargo.toml manifest file" ([cargo add](https://doc.rust-lang.org/cargo/commands/cargo-add.html)).
- (c) `cargo install` "manages Cargo's local set of installed binary crates" and "operates on system or user level, not project level" ([cargo install](https://doc.rust-lang.org/cargo/commands/cargo-install.html)).
- (d) `--manifest-path` selects the `Cargo.toml` ([cargo fetch](https://doc.rust-lang.org/cargo/commands/cargo-fetch.html)).

**Go.** This is the strongest documented rationale for splitting the verbs. Since Go 1.18, `go get` only edits `go.mod`. `go install example.com/cmd@v1.2.3` "does not read or update the `go.mod` file in the current directory". The reason given: "the `go get` command has been used both to update dependencies in go.mod and to install commands. This combination is frequently confusing and inconvenient: in most cases, developers want to update a dependency or install a command but not both at the same time" ([go-get-install-deprecation](https://go.dev/doc/go-get-install-deprecation)). Note that a version suffix is what tells Go "ignore the collection" (same page).

**uv.**
- (a) `uv sync` syncs the environment. It performs "exact" syncing by default, which "will remove any packages that are not selected for installation", unless you pass `--inexact` ([sync.md](https://github.com/astral-sh/uv/blob/main/docs/concepts/projects/sync.md)). The pip interface takes a file with a flag: `uv pip install -r requirements.txt` ([pip/packages.md](https://github.com/astral-sh/uv/blob/main/docs/pip/packages.md)).
- (b) `uv add httpx` adds an entry to `project.dependencies`. `uv add -r requirements.txt` imports a whole file into the project ([dependencies.md](https://github.com/astral-sh/uv/blob/main/docs/concepts/projects/dependencies.md)).
- (c) `uv tool install` puts the tool on `PATH` in a persistent isolated environment. `uvx` (= `uv tool run`) uses a disposable environment. "In most cases, executing a tool with `uvx` is more appropriate than installing the tool" ([tools.md](https://github.com/astral-sh/uv/blob/main/docs/concepts/tools.md)). Tool operations live under the `uv tool` namespace ([CLI reference](https://docs.astral.sh/uv/reference/cli/)).

**pip.** `-r, --requirement <file>`: "Install from the given requirements file" ([pip install](https://pip.pypa.io/en/stable/cli/pip_install/)). The collection is a flagged argument, and positionals are always packages.

**Poetry.**
- (a) `poetry install` reads `pyproject.toml` and uses `poetry.lock` when it exists. `poetry sync` "additionally removes packages that are not tracked in the lock file". The docs say: "Normally, you should prefer `poetry sync` to `poetry install` to avoid untracked outdated packages" ([cli.md](https://github.com/python-poetry/poetry/blob/main/docs/cli.md)).
- (b) "The `add` command adds required packages to your `pyproject.toml` and installs them". Adding a package that is already present is an error unless you give a constraint (same file). The `install` docs show options only, with no package argument.

**Bundler.**
- (a) `bundle install` installs "the gems specified in your Gemfile". Its synopsis lists options only, and `--gemfile=GEMFILE` selects the file ([bundle-install.1.ronn](https://github.com/ruby/rubygems/blob/5879ffe34b67b2a46bf5d5ce54143972476b4407/lib/bundler/man/bundle-install.1.ronn)).
- (b) `bundle add <GEM_NAME>` "Adds the named gem to the Gemfile and run `bundle install`". `--skip-install` skips the install. Flag letters: `-g` = `--group`, `-s` = `--source` ([bundle-add.1.ronn](https://github.com/ruby/rubygems/blob/5879ffe34b67b2a46bf5d5ce54143972476b4407/lib/bundler/man/bundle-add.1.ronn)).

### 4. Homebrew: `brew install` vs `brew bundle`

- (a) "`brew bundle` [`install`|`upgrade`]: Install and upgrade (by default) all dependencies from the `Brewfile`. Use this to restore a recorded installed state" ([Manpage, bundle](https://github.com/Homebrew/brew/blob/main/docs/Manpage.md)). `brew bundle check` reports whether an install would do anything ([Brew-Bundle-and-Brewfile](https://github.com/Homebrew/brew/blob/main/docs/Brew-Bundle-and-Brewfile.md)).
- (b) `brew bundle add <name>` / `brew bundle remove <name>` edit the `Brewfile`. Type flags (`--cask`, `--vscode`, `--cargo`, `--uv`, `--npm`…) pick the entry kind ([Manpage](https://github.com/Homebrew/brew/blob/main/docs/Manpage.md)). `brew bundle add` creates a `Brewfile` if it is missing ([Homebrew/brew#19922](https://github.com/Homebrew/brew/pull/19922)). `brew bundle dump` is "Homebrew's installed-state snapshot command": it writes the installed state into a `Brewfile` ([Brew-Bundle-and-Brewfile](https://github.com/Homebrew/brew/blob/main/docs/Brew-Bundle-and-Brewfile.md)).
- (c) `brew install <formula>` stays the single-item verb outside the `bundle` namespace. The docs describe `brew bundle install` as running `brew install` for each entry ([Brew-Bundle-and-Brewfile](https://github.com/Homebrew/brew/blob/main/docs/Brew-Bundle-and-Brewfile.md)).
- (d) `--file` reads or writes the `Brewfile` at a given location (`--file=-` uses stdin/stdout), and `$HOMEBREW_BUNDLE_FILE` does the same. **`-g, --global` selects the global `Brewfile`**: `$HOMEBREW_BUNDLE_FILE_GLOBAL`, else `${XDG_CONFIG_HOME}/homebrew/Brewfile`, else `~/.homebrew/Brewfile` or `~/.Brewfile` ([Manpage](https://github.com/Homebrew/brew/blob/main/docs/Manpage.md)). Here `-g` picks *which collection*, not an install scope. This is the closest analogue to a Skillset User Skillset, including an XDG-style lookup chain.
- Apply semantics: install is additive. `brew bundle cleanup --force --file=…` is a separate step that removes what the file does not list ([Brew-Bundle-and-Brewfile](https://github.com/Homebrew/brew/blob/main/docs/Brew-Bundle-and-Brewfile.md)).
- (e) Collection verbs are namespaced under `bundle`, so a positional is never a collection reference.

### 5. mise and asdf

**mise.**
- (a) With no arguments, `mise install` "installs every tool version your config requests that is not installed yet" ([mise install](https://github.com/jdx/mise/blob/main/docs/cli/install.md)).
- (b) `mise use` "Installs missing tool versions and records the requests in a config file". `-g/--global` means "Write to the global config instead of the project config". `-p/--path` names an explicit file ([mise use](https://github.com/jdx/mise/blob/main/docs/cli/use.md)).
- (c) "Installing does not add a tool to your config … Use `mise use` to install a tool and add it to mise.toml, or `mise exec <TOOL>@<VERSION> -- <COMMAND>` to run it once" ([mise install](https://github.com/jdx/mise/blob/main/docs/cli/install.md); [mise exec](https://github.com/jdx/mise/blob/main/docs/cli/exec.md)).
- So mise has `install` with args that does **not** mutate the collection, the opposite of npm. The verb that mutates is `use`. `-g` on `use` selects the global *collection file*.

**asdf.** The help text reads: `asdf install` "Install all the package versions listed in the .tool-versions file". `asdf install <name>` installs one tool "at the version specified in the .tool-versions file". `asdf install <name> <version>` installs a specific version. `asdf set [-u] [-p] <name> <versions...>` writes the version to `.tool-versions` ([help.txt](https://github.com/asdf-vm/asdf/blob/master/internal/help/help.txt)). `-u/--home` writes to `$HOME/.tool-versions`, and `-p/--parent` finds the closest parent file ([versions.md](https://github.com/asdf-vm/asdf/blob/master/docs/manage/versions.md)). The meaning changes with the number of arguments: 0 means the whole collection, 1 means one item *as the collection pins it*, 2 means an explicit version outside the collection.

### 6. Claude Code plugins and marketplaces

- **Collection of items, two levels.** A marketplace is "a catalog of plugins". You add it once (`/plugin marketplace add <source>` or `claude plugin marketplace add`). After that, plugins install as `<plugin>@<marketplace>` ([Install and manage plugins](https://code.claude.com/docs/en/discover-plugins)). The plugin reference is **namespaced by its collection**.
- (b) `claude plugin install <name>@<marketplace> [--scope user|project|local]`. The scope decides which settings file records the plugin in `enabledPlugins`: `~/.claude/settings.json`, `.claude/settings.json` (committed), or `.claude/settings.local.json`. Local overrides project, and project overrides user ([Install and manage plugins](https://code.claude.com/docs/en/discover-plugins); [CLI reference](https://code.claude.com/docs/en/plugins/cli-reference)). The short flag is `-s, --scope` ([CLI reference](https://code.claude.com/docs/en/plugins/cli-reference)).
- (a) There is no bulk restore. Committing `.claude/settings.json` "turns the plugin on for your collaborators but doesn't download it to their machines. Each collaborator also runs `claude plugin install <name>@<marketplace> --scope project` once per clone" ([Install and manage plugins](https://code.claude.com/docs/en/discover-plugins); [Loading](https://code.claude.com/docs/en/plugins/loading)). The CLI reference lists `install`, `uninstall`, `enable`, `disable`, `update`, `list`, `details`, `configure`, `prune` and others, but no restore or sync verb ([CLI reference](https://code.claude.com/docs/en/plugins/cli-reference)).
- (c) `--plugin-dir <path>` and `--plugin-url <url>` "load a plugin for one session only, without installing it". Such plugins appear as `<name>@inline` ([CLI reference](https://code.claude.com/docs/en/plugins/cli-reference)).
- (e) For marketplace sources, "Start a relative path with `./` or `../`, because Claude Code reads a bare `name/name` as a GitHub repository". A bare host path like `gitlab.example.com/…` is read as `owner/repo` shorthand and rejected ([Install and manage plugins](https://code.claude.com/docs/en/discover-plugins)). The one-step form `claude plugin install deploy-helper --marketplace your-org/plugins` takes a bare plugin name plus a flagged collection source, and adds the marketplace if it is missing ([Install and manage plugins](https://code.claude.com/docs/en/discover-plugins)).

### 7. Other tools

**Docker Compose.** The usage is `docker compose up [OPTIONS] [SERVICE...]` ([docker_compose_up.yaml](https://github.com/docker/compose/blob/main/docs/reference/docker_compose_up.yaml)). With no service, it starts every service. The positional only picks a *subset of the collection* and never adds an item. `-f` names one or more Compose files, which are merged in order. `-p` sets a project name, with documented precedence: `-p`, then `COMPOSE_PROJECT_NAME`, then top-level `name:`, then the directory basename ([compose.md](https://github.com/docker/compose/blob/main/docs/reference/compose.md)). The subcommand list has no command that edits the Compose file (same page).

**Helm.** `helm install [NAME] [CHART]`. A chart can be a reference (`example/mariadb`), a packaged `.tgz` path, an unpacked directory (`./nginx`), a URL, `--repo <url> <chart>`, or `oci://`. With "a repo prefix ('example/mariadb'), Helm will look in the local configuration for a chart repository named 'example'" ([helm install](https://github.com/helm/helm-www/blob/main/docs/helm/helm_install.md)). That is a namespaced item reference against a registered collection. For a chart's own dependencies, `helm dependency update` re-resolves `Chart.yaml` and writes a lock. `helm dependency build` rebuilds `charts/` "from the Chart.lock file" and "will not re-negotiate dependencies" ([dependency update](https://github.com/helm/helm-www/blob/main/docs/helm/helm_dependency_update.md); [dependency build](https://github.com/helm/helm-www/blob/main/docs/helm/helm_dependency_build.md)).

**VS Code.** `--install-extension <extension-id> | <extension-vsix-path>` takes `publisher.extension[@version]`. "Use `--profile` argument to install for a certain profile" ([command-line](https://github.com/microsoft/vscode-docs/blob/main/docs/configure/command-line.md)). Profiles are named sets of customizations, including extensions. You can export them to a gist or a file and import them ([profiles](https://github.com/microsoft/vscode-docs/blob/main/docs/configure/profiles.md)). An extension pack lists ids in `extensionPack`. Rationale: "An Extension Pack should not have any functional dependencies with its bundled extensions and the bundled extensions should be manageable independent of the pack" ([extension-manifest](https://github.com/microsoft/vscode-docs/blob/main/api/references/extension-manifest.md)). Workspace recommendations in `.vscode/extensions.json` prompt users to install ([extension-marketplace](https://github.com/microsoft/vscode-docs/blob/main/docs/configure/extensions/extension-marketplace.md)).

**devbox.** `devbox add <pkg>...` "Add a new package to your devbox". `devbox install` "Install all packages mentioned in devbox.json" ([add.go](https://github.com/jetify-com/devbox/blob/cbbd7f05245fab257e97601cb203c9a5a14fbafb/internal/boxcli/add.go); [install.go](https://github.com/jetify-com/devbox/blob/cbbd7f05245fab257e97601cb203c9a5a14fbafb/internal/boxcli/install.go)). `devbox global` re-mounts the same subcommands (`add`, `install`, `list`, `pull`, `push`, `remove`, …) against a global `devbox.json` and hides `--config` ([global.go](https://github.com/jetify-com/devbox/blob/cbbd7f05245fab257e97601cb203c9a5a14fbafb/internal/boxcli/global.go)). `pull <file> | <url>` will "Pull a config from a file or URL", which is a way to share a user-level collection ([pull.go](https://github.com/jetify-com/devbox/blob/cbbd7f05245fab257e97601cb203c9a5a14fbafb/internal/boxcli/pull.go)). The project file is chosen with `-c/--config` ([config.go](https://github.com/jetify-com/devbox/blob/cbbd7f05245fab257e97601cb203c9a5a14fbafb/internal/boxcli/config.go)).

**Nix profiles.** A profile "is a set of packages that can be installed and upgraded independently from each other". Profiles are versioned and can be rolled back ([profile.md](https://github.com/NixOS/nix/blob/master/src/nix/profile.md)). `nix profile add nixpkgs#hello` adds an installable, and `nix profile install` remains an alias ([profile-add.md](https://github.com/NixOS/nix/blob/master/src/nix/profile-add.md)). The rationale for the rename: "The verb `add` is a better antonym for the verb `remove`. Nix also does not have install hooks or general behavior often associated with 'installing'" ([NixOS/nix#13224](https://github.com/NixOS/nix/pull/13224)). `--profile <path>` is "The profile to operate on" ([command.cc](https://github.com/NixOS/nix/blob/master/src/libcmd/command.cc)). `nix run nixpkgs#vim` is the ephemeral form ([run.md](https://github.com/NixOS/nix/blob/master/src/nix/run.md)). Item references `flakeref#attr` carry the collection and its pin (`nixpkgs/<rev>#hello`) ([profile-add.md](https://github.com/NixOS/nix/blob/master/src/nix/profile-add.md)).

**winget.** `winget import [-i] <import-file>` "imports a JSON file of apps to install". "The import command combined with the export command allows you to batch install applications" ([import](https://learn.microsoft.com/en-us/windows/package-manager/winget/import)). `winget export [-o] <output>` writes the file ([export](https://learn.microsoft.com/en-us/windows/package-manager/winget/export)). `winget install [[-q] <query>]` has the alias `add`. `-m, --manifest` installs one package from a local YAML manifest, and `-s, --source` restricts the source ([install](https://learn.microsoft.com/en-us/windows/package-manager/winget/install)). Collection and item use **different verbs**, and the collection file is a flagged argument.

**Microsoft APM (Agent Package Manager).** It exists as `microsoft/apm` and targets agent skills, plugins and MCP servers ([README](https://github.com/microsoft/apm/blob/f574a62c2a35f3c6b271763931df8dd1ed20fe21/README.md)).
- (a) and (b): "With no arguments it installs everything from `apm.yml`. With one or more `PACKAGE_REF` arguments it adds those packages to `apm.yml` (creating one if needed) and installs only what was added" ([apm install](https://github.com/microsoft/apm/blob/f574a62c2a35f3c6b271763931df8dd1ed20fe21/docs/src/content/docs/reference/cli/install.md)).
- `--frozen` replays the lock and is "Mutually exclusive with `--update`, positional package additions, and `--mcp`" (same page).
- `--skill NAME` selects a subset and is persisted. Repeated calls take the union, and `--skill '*'` resets to all skills (same page). The README pitches it to `npx skills add` users: `apm install vercel-labs/agent-skills --skill deploy-to-vercel   # one skill, persisted to apm.yml` ([README](https://github.com/microsoft/apm/blob/f574a62c2a35f3c6b271763931df8dd1ed20fe21/README.md)).
- (d) `-g, --global` means "Install to user scope under the APM home (`$APM_HOME`, default `~/.apm`)". The user scope has its own manifest, `$APM_HOME/apm.yml` ([apm install](https://github.com/microsoft/apm/blob/f574a62c2a35f3c6b271763931df8dd1ed20fe21/docs/src/content/docs/reference/cli/install.md)). So `-g` switches *both* the collection and the install scope at once.
- (e) `PACKAGE_REF` accepts `owner/repo`, Git URLs, `host/owner/repo`, local paths (`./`, `/`, `~/`), bundles, and "marketplace refs (`NAME@MARKETPLACE[#ref]`)" (same page).

**`gh skill` (GitHub CLI, preview).** It is real: `gh skill <command>`, "Install and manage agent skills (preview)", with `install`, `list`, `preview`, `publish`, `search` and `update` ([skills.go](https://github.com/cli/cli/blob/0536d5e5288458c696ccbeac0e68d87128300069/pkg/cmd/skills/skills.go)). The usage is `install <repository> [<skill[@version]>]`, with alias `add`. The item is a *second positional*, not a suffix. `--from-local` marks a local directory, `--scope` is `project` or `user`, `--pin` and `@VERSION` pin a version, and `--all` installs every skill. There is no manifest. "Installed skills have source tracking metadata injected into their frontmatter", which `gh skill update` uses ([install.go](https://github.com/cli/cli/blob/0536d5e5288458c696ccbeac0e68d87128300069/pkg/cmd/skills/install/install.go)).

**`gh extension install <repository>`.** A single item installed at user level, with no collection file. `--pin` takes a tag or commit ([extension/command.go](https://github.com/cli/cli/blob/0536d5e5288458c696ccbeac0e68d87128300069/pkg/cmd/extension/command.go)).

**openskills.** Commands are `install <source>`, `sync` (which updates `AGENTS.md`, not installs), `list`, `read`, `update` and `remove`. `--global` installs to `~/.claude/skills`. There is no collection manifest ([README](https://github.com/numman-ali/openskills/blob/main/README.md)).

## Skillset today (for reference)

- A Skillset is the collection, and Install "Place[s] a Skillset's Entries … When given a Source, it first Adds Entries from that Source, then Installs every Entry in the Skillset" ([GLOSSARY.md](../../GLOSSARY.md)).
- `install [source]`: a positional that matches the bare-name pattern `^[a-zA-Z0-9][a-zA-Z0-9_.-]*$` and does not end in `.json` is a User Skillset name. Otherwise it is a Source, which is added and then installed. A name cannot be combined with `--set` ([src/commands/install.ts L228-L252](../../src/commands/install.ts); [src/user-skillset.ts L7-L12](../../src/user-skillset.ts)).
- `--set` takes a path ending in `.json` or a bare name, which always means a User Skillset, never looked up in the project ([ADR 0002](../adr/0002-bare-name-means-user-skillset.md)).
- `-g`: on `install` it means global install scope. On `ls` it lists User Skillset names ([src/commands/install.ts L224](../../src/commands/install.ts); [src/commands/list.ts L13-L19](../../src/commands/list.ts); [README](../../README.md)).
- Argument-order pitfall: "put the User Skillset name before `-s` … otherwise it is treated as another skill name". The same goes for `-a` when the name matches an agent ID ([README](../../README.md); [src/argv.ts](../../src/argv.ts)).
- Apply semantics are additive: "Skills outside the Skillset are never removed" ([README](../../README.md)).

## Synthesis: recurring patterns

### P1. Manifest-first `install` that switches on arity

`install` with no arguments applies the collection. `install <item>` adds the item to the collection and installs it.
- Who: npm ([npm-install](https://github.com/npm/cli/blob/latest/docs/lib/content/commands/npm-install.md)), pnpm by rewriting to `add` ([install_as_add.rs](https://github.com/pnpm/pnpm/blob/7f41ed8f10a7fd4779f0d3b9a6311a44313c489b/pnpm/crates/cli/src/install_as_add.rs)), Bun, Deno, APM, and Vercel `skills` since PR #2683 ([PR #2683](https://github.com/vercel-labs/skills/pull/2683)).
- Pro: one verb to learn, and it matches what Vercel users expect.
- Con: the same verb either restores or mutates, depending on argument count. Strict and CI modes must then forbid positionals: `npm ci` forbids "individual dependencies" ([npm-ci](https://github.com/npm/cli/blob/latest/docs/lib/content/commands/npm-ci.md)), and APM `--frozen` forbids "positional package additions" ([apm install](https://github.com/microsoft/apm/blob/f574a62c2a35f3c6b271763931df8dd1ed20fe21/docs/src/content/docs/reference/cli/install.md)).
- Variant P1b: arity selects scope, but `install` never mutates. In asdf, 0 args means all and `<name>` means one item at the collection's version ([help.txt](https://github.com/asdf-vm/asdf/blob/master/internal/help/help.txt)). In mise, "Installing does not add a tool to your config" ([mise install](https://github.com/jdx/mise/blob/main/docs/cli/install.md)). Both put mutation on a different verb (`set`, `use`).

### P2. Hard verb split: `install`/`sync` applies, `add` mutates

- Who: Yarn Berry and Classic (Classic has a teaching error) ([install.js](https://github.com/yarnpkg/yarn/blob/master/src/cli/commands/install.js#L1160-L1191)), Poetry, Bundler, uv, devbox, and Homebrew (`bundle add` vs `bundle install`).
- Rationale on record: Go says doing both in one verb "is frequently confusing and inconvenient … developers want to update a dependency or install a command but not both at the same time" ([go-get-install-deprecation](https://go.dev/doc/go-get-install-deprecation)). Nix says "`add` is a better antonym for … `remove`" ([NixOS/nix#13224](https://github.com/NixOS/nix/pull/13224)).
- Pro: each verb has one meaning, and `add`/`remove`/`list` form a clean set of collection-editing verbs.
- Con: users coming from npm or Vercel type `install <x>`. The tool must either reject it with a hint (Yarn Classic) or alias it (pnpm, which effectively drops the split).

### P3. A separate verb or namespace for "one item, no collection"

- Who: `uvx` and `uv tool install`, `cargo install`, `go install …@v`, `npx`/`pnpm dlx`/`yarn dlx`/`bunx`/`deno x`, `mise exec`, `nix run`, `skills use`, Claude `--plugin-dir`.
- Rationale on record:
  - uv: "In most cases, executing a tool with `uvx` is more appropriate than installing the tool" ([tools.md](https://github.com/astral-sh/uv/blob/main/docs/concepts/tools.md)).
  - Yarn: system-wide management is "outside of our scope" ([steps.mdx](https://github.com/yarnpkg/berry/blob/f359f65c1f8bb2efb051b3e55edcdc3cb461d159/packages/docusaurus/docs/getting-started/migrating/steps.mdx)).
  - cargo: "operates on system or user level, not project level" ([cargo install](https://doc.rust-lang.org/cargo/commands/cargo-install.html)).
- Pro: the quick path never touches a curated collection.
- Con: one more verb. Also, "global" installs often keep a hidden collection anyway: Bun "keeps its own [package.json] in the global directory" ([bun add](https://github.com/oven-sh/bun/blob/main/docs/pm/cli/add.mdx)), and Vercel `-g` writes a global lock ([commands.md](https://github.com/vercel-labs/skills/blob/50894c1d98bc45ca1ab127213e59d6525065b5e7/docs/commands.md)).

### P4. A collection namespace subcommand

- Who: `brew bundle {install,add,remove,list,check,cleanup,dump}`, `devbox global {add,install,pull,push,…}`, `uv tool …`, `nix profile …`, `claude plugin marketplace …`, `helm dependency …`, `winget import/export`.
- Pro: no positional is ever ambiguous, and the namespace can reuse the familiar verbs (`add`, `remove`, `list`) for the collection.
- Con: longer commands. Two `add` verbs can exist (top level and namespaced), so docs must say which one mutates which file.
- devbox `global` is notable. It re-hosts the project command set against a user-level file and adds `pull <url>` for sharing ([global.go](https://github.com/jetify-com/devbox/blob/cbbd7f05245fab257e97601cb203c9a5a14fbafb/internal/boxcli/global.go); [pull.go](https://github.com/jetify-com/devbox/blob/cbbd7f05245fab257e97601cb203c9a5a14fbafb/internal/boxcli/pull.go)).

### P5. Collection chosen by flag; positionals are always items

- Who: brew `--file`/`-g`, compose `-f`/`-p`, devbox `-c`, Nix and VS Code `--profile`, Bundler `--gemfile`, pip and uv `-r`, winget `-i`, cargo `--manifest-path`, mise `-p`/`-g`, asdf `set -u`. Sources for each are in the per-tool sections above.
- Pro: no ambiguity at all. Skillset's `--set` already follows this pattern ([ADR 0002](../adr/0002-bare-name-means-user-skillset.md)).
- Con: applying a named collection is more typing (`install --set my-set` vs `install my-set`).
- Named rather than path-based collection references exist too: Compose `-p <name>` ([compose.md](https://github.com/docker/compose/blob/main/docs/reference/compose.md)) and VS Code `--profile "<name>"` ([command-line](https://github.com/microsoft/vscode-docs/blob/main/docs/configure/command-line.md)).

### P6. Namespaced item references: `item@collection` / `collection#item`

- Who: Claude `name@marketplace` ([discover-plugins](https://code.claude.com/docs/en/discover-plugins)), APM `NAME@MARKETPLACE[#ref]` ([apm install](https://github.com/microsoft/apm/blob/f574a62c2a35f3c6b271763931df8dd1ed20fe21/docs/src/content/docs/reference/cli/install.md)), Helm `repo/chart` ([helm install](https://github.com/helm/helm-www/blob/main/docs/helm/helm_install.md)), Nix `flakeref#attr` ([profile-add.md](https://github.com/NixOS/nix/blob/master/src/nix/profile-add.md)), Vercel `owner/repo@skill` ([source-parser.ts](https://github.com/vercel-labs/skills/blob/50894c1d98bc45ca1ab127213e59d6525065b5e7/src/source-parser.ts#L691-L711)), and the two-positional form of `gh skill install <repo> <skill>` ([install.go](https://github.com/cli/cli/blob/0536d5e5288458c696ccbeac0e68d87128300069/pkg/cmd/skills/install/install.go)).
- Pro: you can pick one item *out of* a collection without applying all of it, and the reference says where the item comes from.
- Con: `@` is overloaded. It means a version in npm, Go, uv, mise and Poetry, but a skill or marketplace in Vercel, Claude and APM. Vercel needs a heuristic, and `v2` stays a skill name ([source-parser.ts L446-L456](https://github.com/vercel-labs/skills/blob/50894c1d98bc45ca1ab127213e59d6525065b5e7/src/source-parser.ts#L446-L456)). Registered collections must be added first (Claude marketplace, `helm repo`) unless an inline flag is offered (Claude `--marketplace <source>`).
- For Skillset there are two different "single items": *one skill from a Source* (Vercel style) and *one Entry from a Skillset* (Claude/Helm style). Only the first exists today.

### P7. How positional ambiguity is resolved, from weakest to strongest

1. **Lookup with fallback.** Vercel `remove`: lock key first, else source ([remove.ts](https://github.com/vercel-labs/skills/blob/50894c1d98bc45ca1ab127213e59d6525065b5e7/src/remove.ts#L61-L75)). Skillset's ADR 0002 rejected this for `--set`, because the result depends on which files happen to exist ([ADR 0002](../adr/0002-bare-name-means-user-skillset.md)).
2. **Shape-based.** Vercel's version-pin regex, Skillset's bare-name regex, npm's "must start with http:// or https://".
3. **Prefix-based.** Claude, APM and Helm require `./` for local paths. Deno uses `jsr:`. ADR 0002 uses the `.json` suffix.
4. **Flag-based.** pip `-r`, winget `-i`/`-m`, `gh skill --from-local`, Claude `--marketplace`, `--set`.
5. **Verb- or namespace-based.** P2 and P4: no shared slot exists at all.

### P8. Apply semantics: additive vs exact

- Additive by default: `npm install`, `poetry install`, `brew bundle install`, Skillset.
- Exact by default, or offered as a separate verb: `uv sync` (`--inexact` to opt out) ([sync.md](https://github.com/astral-sh/uv/blob/main/docs/concepts/projects/sync.md)), `poetry sync` ([cli.md](https://github.com/python-poetry/poetry/blob/main/docs/cli.md)), `brew bundle cleanup` ([Brew-Bundle-and-Brewfile](https://github.com/Homebrew/brew/blob/main/docs/Brew-Bundle-and-Brewfile.md)), and Vercel `experimental_sync`, which removes what is no longer provided but preserves skills installed with `skills add` ([commands.md](https://github.com/vercel-labs/skills/blob/50894c1d98bc45ca1ab127213e59d6525065b5e7/docs/commands.md)).
- If Skillset ever offers an "exact" mode, prior art puts it on a separate verb or flag, never on the default `install`.

### P9. Shared collection without a restore verb is a known gap

- Claude Code: a committed `enabledPlugins` "doesn't download it", and each collaborator installs per plugin per clone ([discover-plugins](https://code.claude.com/docs/en/discover-plugins)).
- Vercel: before PR #2683, `skills install` failed without a source ([PR #2683](https://github.com/vercel-labs/skills/pull/2683)). There is still no global restore ([#683](https://github.com/vercel-labs/skills/issues/683)).
- Skillset's core value (install a named collection anywhere) sits in exactly this gap.

### P10. User-level collections: one file vs many named ones

- One global collection: brew `--global`, devbox `global`, mise `-g`, asdf `-u`, APM `-g` (`$APM_HOME/apm.yml`).
- Many named collections: VS Code Profiles (export/import) ([profiles](https://github.com/microsoft/vscode-docs/blob/main/docs/configure/profiles.md)), Nix `--profile <path>` ([command.cc](https://github.com/NixOS/nix/blob/master/src/libcmd/command.cc)), Compose `-p <name>`.
- Skillset's User Skillsets are many named collections addressed by bare name. That is closer to VS Code Profiles than to `brew bundle --global`. In tools with one global collection, `-g` can safely mean "the user collection". With many named ones, a name is needed anyway, so `-g` stays free for something else.

## Flag and verb meanings across tools

| Token | Meanings found |
| --- | --- |
| `-g` | Global **install scope**: npm, pnpm `add`, Bun, Vercel `skills` (on `add`, `remove`, `ls`, `update`), APM (which also switches the manifest). Global **collection file**: `brew bundle`, `mise use`. `--group`: `bundle add`. Skillset: install scope on `install`, but "list User Skillsets" on `ls` |
| `-s` | `--skill`: Vercel `skills`, Skillset. `--scope`: `claude plugin install`. `--source`: `winget install`, `bundle add` |
| `-a` | `--agent`: Vercel `skills`, Skillset. `--architecture`: `winget install` |
| `-p` | `--project`: Vercel `update`. `--path`: `mise use`. Project name: Compose. `--parent`: `asdf set` |
| `sync` | Exact env from lock: uv, Poetry. Sync from `node_modules`: Vercel `experimental_sync`. Rewrite `AGENTS.md`: openskills |
| `install <x>` | Add to manifest and install: npm, pnpm (rewritten), Bun, Deno, APM, Vercel. Install without recording: mise, asdf. User-global: `cargo install`, `go install @v`, `deno install -g`. Error naming `add`: Yarn Classic. Not accepted: Yarn Berry, Bundler |
| `add` | Mutate manifest: pnpm, Yarn, Bun, Deno, cargo, uv, Poetry, Bundler, brew bundle, devbox, Nix profile. Alias of `install`: winget, `gh skill` |
| `@` | Version: npm, Go, uv, mise, Poetry, `gh skill`. Skill name (or version pin by shape): Vercel. Marketplace: Claude, APM |

Sources for each cell are in the per-tool sections. The Vercel `ls -g` entry comes from [commands.md](https://github.com/vercel-labs/skills/blob/50894c1d98bc45ca1ab127213e59d6525065b5e7/docs/commands.md). The Skillset `ls -g` entry comes from [src/commands/list.ts](../../src/commands/list.ts).

Specific pitfalls for Skillset:

- `skillset ls -g` lists User Skillsets, while `skills ls -g` lists globally *installed* skills. A Vercel user would expect the second.
- `skillset install my-set -g` combines two different "user-level" ideas in one line: a user collection and a global install scope. APM conflates them on purpose with `-g`. Homebrew's `-g` means only the collection, because Homebrew has no project install scope.
- When the short flag for a value-taking option is followed by space-separated values, the collection name must come before the flag ([README](../../README.md)). Tools with a fixed positional order (`gh skill install <repo> <skill>`, `helm install [NAME] [CHART]`) or with flagged collections avoid this.

## Options for Skillset (evidence only, no decision)

The options below are combinations of the patterns above. They are not exclusive.

- **Option A: keep the arity and shape switch (P1 + P7.2).** `install` applies `./skillset.json`. `install <name>` applies a User Skillset. `install <source>` adds, then installs. This is closest to Vercel (`install` = restore, `install <source>` = add) and to APM. Cost: three meanings in one positional slot, told apart only by shape. The quick path always mutates a Skillset, which is the "muddying" the owner wants to avoid. A frozen or CI mode would need to forbid `<source>`, as `npm ci` and APM `--frozen` do.
- **Option B: hard split (P2 + P3).** `install [name]` only applies Skillsets. `add` is the only verb that mutates. A separate verb, or a pass-through to `skills add`/`skills use`, handles "one skill, no Skillset". This is backed by the Go and Nix rationale and by Yarn's teaching error. Cost: it breaks `skillset install <source>` parity with `skills install <source>`. It needs a hint or alias for users who type `install owner/repo`.
- **Option C: namespaced single-Entry install (P6).** For example, `install <skill>@<set>` or `install <set> -s <skill>` installs one Entry from a Skillset without the rest, like Claude's `name@marketplace` or Helm's `repo/chart`. This keeps the collection primary, and "one item" means one Entry *of a collection*. Cost: `@` already means a pin in Sources (`owner/repo@v1.2.3`), so a `<skill>@<set>` form would need a rule that keeps it apart from Source syntax.
- **Option D: collections only by flag (P5).** `install --set my-set` vs `install owner/repo`. ADR 0002 already defines `--set`. Positional names would become sugar, or be removed. Cost: the README quick start uses `skillset install my-set`.
- **Option E: a namespace for User Skillsets (P4 / P10).** devbox `global …` and `brew bundle --global` show one shape. Commands like `skillset ls -g` (list sets) would move to a namespace, which frees `-g` to mean only install scope, as it does in Vercel. Cost: more verbs, and it may clash with the glossary's "_Avoid_: Global skillset".

## Open questions for Skillset

1. Should `install <source>` still mutate a Skillset (Vercel and APM parity), or should mutation be `add`-only (Yarn, Poetry, Bundler, brew bundle, Go rationale)?
2. Is the quick workflow "one skill from a Source" (Vercel), "one Entry from a Skillset" (Claude, Helm), or both? Should either one write to any Skillset at all?
3. If "one skill, no Skillset" is supported, should it be its own verb (like `uvx`, `skills use`, `mise exec`) or delegated to `skills add` directly?
4. Should a positional ever name a Skillset, or only `--set` (P5)? If positional names stay, is shape-only detection (bare name vs `/`, `:`, `.json`) enough? A bare word could also be a local directory, and ADR 0002 forbids looking it up.
5. Should `-g` mean only "global install scope", as in Vercel and npm? Then listing User Skillsets would move to another flag or verb, ending the `ls -g` mismatch with `skills ls -g`.
6. When a User Skillset is installed with `-g`, should both "user" ideas (user collection, user scope) stay separate flags, or be linked as APM does?
7. Should applying a Skillset stay additive only, or gain an exact mode (`uv sync`, `poetry sync`, `brew bundle cleanup`)? If it gains one, which verb or flag, given that the README promises "Skills outside the Skillset are never removed"?
8. Should a frozen or CI mode exist (`npm ci`, pnpm/Yarn/Vercel CI defaults, APM `--frozen`)? If it does, it must reject positional additions.
9. Vercel restores only the project `skills-lock.json` ([#683](https://github.com/vercel-labs/skills/issues/683)). Should Skillset's install of a User Skillset write or depend on that lock, given that the Skillset file already holds the Pins?
10. Should `add`/`remove` stay the only collection-editing verbs (the Nix rationale) and `install` the only verb that places files, so the glossary rule "Add … changes only the Skillset file" holds without exception?

## Not checked

- `gem install`, `docker run` and `pipx` were not read from their primary docs. Their table cells are in parentheses.
- Deno's design rationale for repurposing `deno install` (Deno 2) was not found in a PR or issue. Only the current docs are cited.
- Links that are not pinned (docs sites and `main`/`master` branches) may drift after 2026-11-16.
