# Skillset

**Curate a shareable list of agent skills pinned to Git commits, then install them together.**

Skillset lets a _Curator_ publish one `skillset.json` file. Anyone can install every skill in it at exactly the commits the Curator reviewed. Installation is handled by [`skills`](https://www.npmjs.com/package/skills).

## Features

- **Pinned** — every skill is locked to a full Git commit SHA.
- **Shareable** — one JSON file with a published [JSON Schema](schemas/skillset/v1.json).
- **Safe curation** — `add`, `remove`, and `update` only edit the file; nothing is installed.
- **Flexible install** — pick skills, agents, scope (project or global), and symlink or copy mode, interactively or with flags.

## Requirements

- Node.js **22.20.0 or later** (required by `skills@1.8.1`)
- Git

## Usage

Run without installing:

```sh
pnpx @itsmeyaw/skillset --help
```

Or install globally with `npm install -g @itsmeyaw/skillset`. The examples below use `skillset` for brevity.

> [!NOTE]
> The package may not be published yet. Until it is, build from source (see [Development](#development)).

### Curate a Skillset

```sh
# List available skills without changing anything.
skillset add mattpocock/skills --list

# Create ./skillset.json if needed and pin the selected skills.
skillset add mattpocock/skills -s grilling
skillset list

# Refresh Pins, review the diff, then share the file.
skillset update
git diff -- skillset.json
```

### Install a Skillset

Run this from the project that should receive the skills:

```sh
skillset list --set ./skillset.json
skillset install --set ./skillset.json

# Add skills from a Source, then install every Entry in the Skillset.
skillset install mattpocock/skills -s grilling
```

Interactive mode asks for skills, agents, scope, and install mode, then shows a summary to confirm. Declining exits successfully without installing. Use flags to skip prompts, or `-y` to skip them all:

```sh
skillset install -y -s grilling -a universal --copy --set ./skillset.json
```

- Without a Source or `-s`, `-y` selects all Entries.
- Without `-a`, `-y` uses the `skills add -y` default agent choice.
- Defaults are project scope and automatic install mode. A non-interactive terminal behaves like `-y`.
- All selected Sources are checked at their Pins before anything is written. If a write fails, earlier writes are not rolled back.
- Skills outside the Skillset are never removed. Installs are recorded in `skills-lock.json`.
- With a Source, `-s` or `--all` selects what to add; installation still includes every Entry. Without a selection, non-interactive use lists available skills instead.
- A Source install checks all Entries, confirms the plan, writes the Skillset file, then installs. A failed install does not roll back the file or earlier writes.

## Commands

Every command accepts `--set <path>` (default `./skillset.json`). `add` and `install <source>` create a missing file. Use `--help` on any command for usage.

| Command                    | Description                                                               |
| -------------------------- | ------------------------------------------------------------------------- |
| `add [source]`, `a`        | Resolve a Source to a commit and add selected Entries.                    |
| `remove [skills...]`, `rm` | Remove named Entries, or all with `--all`.                                |
| `update [skills...]`, `up` | Refresh Pins for all or named Entries.                                    |
| `list`, `ls`               | Print each Entry's name, Source, and short Pin.                           |
| `install [source]`, `i`    | Optionally add Entries from a Source, then install Entries at their Pins. |

Global flags: `-h, --help`, `-v, --version`.

### `add [source]`

Resolves the Source, checks its skills, and adds the selected Entries. Re-adding a name from the same Source refreshes its Pin. A name that already belongs to a different Source is rejected.

On a TTY, omitting the Source prompts for it; omitting a selection opens a searchable multiselect. Without a TTY or with `-y`, an omitted selection lists the skills instead. An empty Source is an error.

| Flag                 | Description                                                          |
| -------------------- | -------------------------------------------------------------------- |
| `-s, --skill <name>` | Select skills. Repeat the flag or pass several names (`-s one two`). |
| `--all`              | Select all skills from the Source.                                   |
| `-l, --list`         | List available skills without writing.                               |
| `-y, --yes`          | Skip interactive prompts.                                            |

Supported Sources:

- `owner/repo`
- `owner/repo#branch`
- `owner/repo@v1.2.3` or `owner/repo@<full-sha>`
- GitHub tree URLs
- Other remote Git URLs

Notes:

- Quote Sources containing `#` in your shell.
- On shorthand Sources, `@` takes a version or full SHA, not a skill name. Use `-s` for skills.
- A GitHub tree URL with a skill path selects the last path component and stores the URL through its ref, without the skill path. `-s` or `--all` overrides that selection.
- Local paths, well-known URLs, and direct downloads cannot be pinned.
- Private repositories use your existing Git credentials. GitHub is the tested host.

> [!WARNING]
> Tree URLs use the first segment after `tree/` as the ref, as `skills` does. If a longer matching ref exists, or the ref contains an encoded slash, the URL is ambiguous and rejected. Use `owner/repo#<branch-with-slashes> -s <skill>` instead. Tree URL segments are not percent-decoded.

### `remove [skills...]`

On a TTY, omitting names and `--all` opens an unselected searchable multiselect. Without a TTY or with `-y`, a name or `--all` is required. Unknown names cause exit code 1; known names are still removed.

### `update [skills...]`

- Version-pinned Sources are left unchanged.
- Each changed Pin is printed as `name  old → new` using short SHAs.
- Unknown names are reported and the command exits 1; known Entries still update.
- If a skill disappeared at its Source, or the Source cannot be checked, the old Pin is kept, other Entries still update, and the command exits 1.

### `install [source]`

| Flag                 | Description                                                                              |
| -------------------- | ---------------------------------------------------------------------------------------- |
| `-s, --skill <name>` | Select Entries, or skills to add when a Source is supplied. An unknown name is an error. |
| `--all`              | With a Source, add all its skills.                                                       |
| `-a, --agent <id>`   | Select agents.                                                                           |
| `-g, --global`       | Install globally instead of asking for scope.                                            |
| `--copy`             | Copy files instead of asking for the install mode.                                       |
| `-y, --yes`          | Skip all prompts, including confirmation.                                                |

Explicit selection, agent, scope, and mode flags skip their own prompts.

Searchable pickers filter names as you type; agent pickers also match IDs. Use ↑/↓ to move, Space to toggle, Ctrl+A to select all matching choices, and Enter to confirm. Escape or Ctrl+C cancels without writing and exits 130.

## Skillset file format

```json
{
  "$schema": "https://raw.githubusercontent.com/itsmeyaw/skillset/main/schemas/skillset/v1.json",
  "skills": [
    {
      "name": "grilling",
      "source": "mattpocock/skills",
      "commit": "5863806dd4e15c63174bee4e7515a4256792ecfa"
    }
  ]
}
```

- Each Entry has a unique, nonempty `name`, a nonempty Git `source`, and a `commit` Pin of exactly 40 lowercase hex characters.
- The `$schema` URL is the format version. Unknown URLs and invalid files are rejected.
- Files are written with Entries sorted by name, two-space indentation, and a trailing newline.
- The CLI enforces name uniqueness; the JSON Schema alone cannot.

> [!IMPORTANT]
> A Pin is a Git commit SHA. Git content-addresses the commit and its tree, so it identifies the exact files the Curator reviewed. No separate digest is stored. A Pin does **not** establish trust in the Curator or the Source.

See [ADR 0001](docs/adr/0001-own-skillset-format-over-wellknown-index.md) for why Skillset uses its own format instead of a well-known index, and [GLOSSARY.md](GLOSSARY.md) for the terms used here (Skillset, Entry, Source, Pin, Curator).

## Development

```sh
pnpm install
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build
```

Run `pnpm schema:generate` after changing the Skillset file schema.

Run `pnpm install:local` to build and link the `skillset` command globally for manual testing. It uses `npm link` because pnpm 11 dropped `pnpm link --global`; rebuild with `pnpm build` after changes, and `npm unlink -g @itsmeyaw/skillset` removes it.
