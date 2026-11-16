<p align="center">
  <img src="https://raw.githubusercontent.com/itsmeyaw/skillset/main/assets/skillset.svg" alt="Skillset: Easily manage, install, and share multiple agent skills at once. Based on Vercel’s Skills CLI (skills.sh)." width="800">
</p>

<p align="center">
  Skillset is a wrapper around <a href="https://github.com/vercel-labs/skills">Vercel's Skills CLI</a> (<a href="https://skills.sh">skills.sh</a>) that installs a predefined list of skills at once.
</p>

## Requirements

- Node.js 22.20.0 or later
- Git

## Install

```sh
npm install -g @itsmeyaw/skillset
```

Or run without installing: `npx @itsmeyaw/skillset --help`.

## Quick start

Build your own Skillset once, then reuse it in every project. Run commands without arguments and Skillset prompts you for everything.

For a quick single-Source flow, add skills and install the whole Skillset in one command:

```sh
skillset add owner/repo --install
```

<p align="center">
  <img src="https://raw.githubusercontent.com/itsmeyaw/skillset/main/assets/demo.gif" alt="Terminal demo: create a Skillset with skills from mattpocock/skills, then install it into a project with skillset install --set my-set." width="720">
</p>

**1. Create your Skillset.** `--set my-set` names a Skillset that you can use in all your projects:

```sh
skillset add --set my-set
```

You are asked for:

1. **Source?** Type a repo such as `mattpocock/skills`.
2. **Which skills?** Search and tick the skills you want.
3. **Add another source?** Answer `n` when finished.
4. **Install skillset?** Answer `n` for now.

Run it again with another source to mix skills from several repos into the same Skillset. `skillset ls --set my-set` shows what is in it.

**2. Use it in any project.** From each project that should receive the skills:

```sh
cd ~/projects/some-project
skillset install my-set
```

You are asked which skills, which agents, project or global scope, and symlink or copy, then to confirm.

**3. Keep it fresh.** Skills are pinned to commits, so nothing changes until you update:

```sh
skillset update --set my-set   # move pins to the latest commits
skillset rm --set my-set       # pick skills to drop
```

Re-run `skillset install my-set` in a project to pick up the changes.

Skills outside the Skillset are never removed. Installs are recorded in `skills-lock.json`. Every prompt has a flag, so the same steps work in scripts; see [Commands](#commands).

Prefer a Skillset that lives in a repo so teammates share it? Omit `--set` to use `./skillset.json` and commit it. See [User Skillsets](#user-skillsets).

## Commands

| Command                    | Description                                                          |
| -------------------------- | -------------------------------------------------------------------- |
| `add [source]`, `a`        | Pin skills from a Source to the Skillset; `--install` also installs. |
| `remove [skills...]`, `rm` | Remove skills from the Skillset (`--all` removes everything).        |
| `update [skills...]`, `up` | Refresh pins to the latest commits. Version-pinned sources are kept. |
| `list`, `ls`               | Show Entries, or User Skillset names with `--user`.                  |
| `install [set]`, `i`       | Install the Skillset at its Pins.                                    |

Every command accepts `--set <value>` (default `./skillset.json`) and `--help`. `add` creates the file if it is missing. `install [set]` accepts the same name or `.json` path as `--set`, but cannot be combined with `--set`.

| Flag                 | Used by          | Description                                                             |
| -------------------- | ---------------- | ----------------------------------------------------------------------- |
| `-s, --skill <name>` | `add`, `install` | Select Source skills for `add` or Entries for `install`.                |
| `--all`              | `add`            | Select all skills from the Source.                                      |
| `-l, --list`         | `add`            | List available skills without writing.                                  |
| `--install`          | `add`            | After adding, install the whole Skillset.                               |
| `-a, --agent <id>`   | `add`, `install` | Select agents; on `add`, requires `--install`.                          |
| `-g, --global`       | `add`, `install` | Install globally instead of per project; requires `--install` on `add`. |
| `--copy`             | `add`, `install` | Copy instead of symlinking; requires `--install` on `add`.              |
| `-y, --yes`          | `add`, `install` | Skip prompts in both steps.                                             |
| `--user`             | `list`           | List User Skillset names; cannot be combined with `--set`.              |

Repeat `-s` or pass several names. On `add`, `-s` and `--all` select Source skills only; `--install` installs the entire Skillset. Declining or failing installation leaves the added Entries in the file.

### Sources

- `owner/repo`
- `owner/repo#branch`
- `owner/repo@v1.2.3` or `owner/repo@<full-sha>`
- GitHub tree URLs
- Other remote Git URLs

Quote sources containing `#` in your shell. Private repositories use your existing Git credentials. Local paths and direct downloads cannot be pinned.

### User Skillsets

Pass a bare name to `--set` to keep a Skillset outside any project, so every project can use it:

```sh
skillset add mattpocock/skills -s grilling --set my-set
skillset install my-set
skillset ls --user                        # list your User Skillsets
```

When selecting skills, put the User Skillset name before `-s` (for example,
`skillset install my-set -s grilling`); otherwise it is treated as another skill name.
Likewise, put the name before `-a` if it matches a supported agent ID.

They are stored in the first of `$SKILLSET_HOME`, `$XDG_CONFIG_HOME/skillset`, or `~/.skillset`. To use a file in the current directory, give a path ending in `.json`, such as `skillset install ./team.json`.

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

You can use the [JSON Schema](schemas/skillset/v1.json) for editor validation.

## Telemetry

Skillset collects no data itself. However, [Vercel's Skills CLI](https://github.com/vercel-labs/skills) library sends anonymous usage telemetry by default. See [what is collected](https://github.com/vercel-labs/skills/blob/main/docs/troubleshooting.md#telemetry). To turn it off, set `DISABLE_TELEMETRY=1` or `DO_NOT_TRACK=1`:

```sh
DISABLE_TELEMETRY=1 skillset install my-set
```

## License

This project is licensed under the [MIT](LICENSE)
