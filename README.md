<p align="center">
  <img src="https://raw.githubusercontent.com/itsmeyaw/skillset/main/assets/skillset.svg" alt="Skillset: Easily manage, install, and share multiple skills at once. Based on Vercel’s Skill CLI." width="640">
</p>

**Curate a shareable list of agent skills pinned to Git commits, then install them together.**

A _Skillset_ is one `skillset.json` file listing skills and the exact commits they were reviewed at. Share the file, and anyone can install every skill in it. Skillset is built on [Vercel's Skills CLI](https://github.com/vercel-labs/skills), which handles the actual installation.

## Requirements

- Node.js 22.20.0 or later
- Git

## Install

```sh
npm install -g @itsmeyaw/skillset
```

Or run without installing: `npx @itsmeyaw/skillset --help`.

## Quick start

Create a Skillset:

```sh
skillset add mattpocock/skills --list       # see available skills
skillset add mattpocock/skills -s grilling  # add a skill to ./skillset.json
skillset update                             # refresh skills to the latest commits
```

Install it (from the project that should receive the skills):

```sh
skillset install                          # interactive: choose skills, agents, scope
skillset install -y --set ./skillset.json   # no prompts, install everything
```

Skills outside the Skillset are never removed. Installs are recorded in `skills-lock.json`.

## Commands

| Command                    | Description                                                          |
| -------------------------- | -------------------------------------------------------------------- |
| `add [source]`, `a`        | Pin skills from a source to the Skillset.                            |
| `remove [skills...]`, `rm` | Remove skills from the Skillset (`--all` removes everything).        |
| `update [skills...]`, `up` | Refresh pins to the latest commits. Version-pinned sources are kept. |
| `list`, `ls`               | Show each skill's name, source, and short commit.                    |
| `install [source]`, `i`    | Install the Skillset, optionally adding skills from a source first.  |

Every command accepts `--set <value>` (default `./skillset.json`) and `--help`. `add` and `install <source>` create the file if it is missing.

| Flag                 | Used by          | Description                                  |
| -------------------- | ---------------- | -------------------------------------------- |
| `-s, --skill <name>` | `add`, `install` | Select skills. Repeat or pass several names. |
| `--all`              | `add`, `install` | Select all skills from the source.           |
| `-l, --list`         | `add`            | List available skills without writing.       |
| `-a, --agent <id>`   | `install`        | Select agents.                               |
| `-g, --global`       | `install`        | Install globally instead of per project.     |
| `--copy`             | `install`        | Copy files instead of symlinking.            |
| `-y, --yes`          | `add`, `install` | Skip all prompts.                            |

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
skillset ls -g                            # list your User Skillsets
```

They are stored in the first of `$SKILLSET_HOME`, `$XDG_CONFIG_HOME/skillset`, or `~/.skillset`. To use a file in the current directory, give a path ending in `.json`.

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
