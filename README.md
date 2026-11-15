# Skillset

Curate a shareable list of agent skills pinned to Git commits, then install them together with `skills`.

Requires Node.js **22.20.0 or later** and Git. After the package is published, run it without a global install:

```sh
pnpx @itsmeyaw/skillset --help
```

The examples below use `skillset` for brevity. Replace it with `pnpx @itsmeyaw/skillset`, or install the package globally with `npm install -g @itsmeyaw/skillset` after publication.

## Curate a Skillset

```sh
# List available skills without changing the Skillset file.
skillset add mattpocock/skills --list

# Create ./skillset.json if needed and pin the selected skills.
skillset add mattpocock/skills -s grilling
skillset list

# Refresh Pins, inspect the changes, and share the file.
skillset update
git diff -- skillset.json
```

`add`, `remove`, and `update` change the Skillset file only; they do not install or remove skills. Commit and share the file with users. Use `--set <path>` on any command to choose a different file.

## Install a Skillset

Run this from the project that should receive the skills:

```sh
skillset list --set ./skillset.json
skillset install --set ./skillset.json
```

Interactive installation asks for skills, agents, project or global scope, and symlink or copy mode, then shows a summary for confirmation. Declining exits successfully without installing. Flags can skip individual prompts; `-y` skips them all:

```sh
skillset install -y -s grilling -a universal --copy --set ./skillset.json
```

Without `-s`, `-y` selects all Entries. Without `-a`, it uses the `skills add -y` default agent choice. It defaults to project scope and automatic install mode. A non-interactive terminal uses the same defaults as `-y`. Install checks all selected Sources at their Pins before writing. If a write fails, it stops without rolling back earlier writes. Skills outside the Skillset are not removed; installs are recorded in `skills-lock.json`.

## Command reference

Every command accepts `--set <path>` (default `./skillset.json`). Only `add` creates a missing file. Use `--help` on any command for its usage.

### `add <source>`

Resolve a Source to a commit, check its skills, and add selected Entries. Re-adding a name from the same Source refreshes its Pin; a name already belonging to a different Source is rejected.

- `-s, --skill <name>` selects skills; repeat the flag or supply multiple names, e.g. `-s one two`.
- `--all` selects all skills from the Source.
- `-l, --list` lists available skills without writing. With no selection, `add` also lists skills and gives a selection hint.

Sources include `owner/repo`, `owner/repo#branch`, `owner/repo@v1.2.3`, `owner/repo@<full-sha>`, GitHub tree URLs, and other remote Git URLs. Quote Sources containing `#` in shells. A GitHub tree URL with a skill path selects its last path component and stores the URL through its ref, without the skill path; `-s` or `--all` overrides that selection. `@` on shorthand Sources accepts versions or full SHAs, not skill names; use `-s` to select a skill. Local paths, well-known URLs, and direct downloads cannot be pinned. Private repositories use your existing Git credentials; GitHub is the tested host.

Tree URLs use the first segment after `tree/` as the ref, as `skills` does. If a longer matching ref exists, the URL is ambiguous and rejected; use `owner/repo#<branch-with-slashes> -s <skill>` instead. Tree URL segments are not percent-decoded.

### `remove [skills...]`

Remove named Entries from the file, or use `--all` to empty it. A name or `--all` is required. Unknown names cause exit code 1; known names are still removed.

### `update [skills...]`

Refresh all Entries or only the named Entries. Unknown names are reported; known Entries still update, and the command exits 1. Version-pinned Sources remain unchanged. Each changed Pin is printed as `name  old → new` using short SHAs. If a skill disappeared at its Source, or the Source cannot be checked, its old Pin is retained, other Entries can still update, and the command exits 1.

### `list`

Print each Entry's name, Source, and short Pin.

### `install`

- `-s, --skill <name>` selects Entries; repeat the flag or supply multiple names.
- `-a, --agent <id>` selects agents; repeat the flag or supply multiple IDs.
- `-g, --global` installs globally instead of asking for scope.
- `--copy` copies files instead of asking for the install mode.
- `-y, --yes` skips all prompts, including confirmation.

An unknown selected skill is an error. Explicit selection, agent, scope, and mode flags skip their respective prompts.

### Global flags

- `-h, --help` shows help; `-v, --version` shows the version.
- `--wizard` starts interactive command wizard mode.
- `--completions <bash|zsh|fish|powershell|sh|pwsh>` prints shell completions.
- `--log-level <all|trace|debug|info|warn|warning|error|fatal|none>` sets the minimum log level.

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

Each Entry has a unique nonempty `name`, a nonempty Git `source`, and a `commit` Pin of exactly 40 lowercase hexadecimal characters. The `$schema` URL identifies the format version; unknown URLs and invalid files are rejected. Files are written with Entries sorted by name, two-space indentation, and a trailing newline. The CLI checks name uniqueness; the JSON Schema alone cannot express it.

A Pin is the Git commit SHA: Git content-addresses the commit and its tree, so it identifies the files reviewed by the Curator. No separate artifact digest is stored. A Pin does not establish trust in the Curator or Source. See [ADR 0001](https://github.com/itsmeyaw/skillset/blob/main/docs/adr/0001-own-skillset-format-over-wellknown-index.md) for why Skillset uses its own format instead of a V2 well-known index.

## Development

Install dependencies with `pnpm install`. Run `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, and `pnpm build` to verify changes. Run `pnpm schema:generate` after changing the Skillset file schema.
