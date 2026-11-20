<div align="center">

<img src="https://raw.githubusercontent.com/itsmeyaw/skillset/main/assets/skillset.svg" alt="Skillset: Easily manage, install, and share multiple agent skills at once. Based on Vercel’s Skills CLI (skills.sh)." width="800">

[![npm version](https://img.shields.io/npm/v/@itsmeyaw/skillset?style=flat-square)](https://www.npmjs.com/package/@itsmeyaw/skillset)
[![Build Status](https://img.shields.io/github/actions/workflow/status/itsmeyaw/skillset/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/itsmeyaw/skillset/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/Node.js->=22.20.0-3c873a?style=flat-square)](https://nodejs.org)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)

[Installation](#installation) • [Quick start](#quick-start) • [MCP servers](#mcp-servers) • [Commands](#commands)

</div>

Skillset is a CLI for curating agent skills and MCP servers into a pinned, shareable list (a **Skillset**) and installing that list into any project in one step. It wraps [Vercel's Skills CLI](https://github.com/vercel-labs/skills), so skills land in the same agent directories and `skills-lock.json` that `npx skills` uses. MCP servers are written into each agent's own MCP config.

- **Pinned**: every skill records the exact Git commit it came from. Nothing changes until you run `skill up`.
- **Skills and MCP servers together**: one list, one `install`.
- **No secrets saved**: MCP secrets are written as env var references, never as values.
- **Additive**: `install` never removes anything that isn't in the Skillset.

## Installation

Requires [Node.js](https://nodejs.org) 22.20.0 or later and [Git](https://git-scm.com).

```sh
npm install -g @itsmeyaw/skillset
```

Or run it without installing: `npx @itsmeyaw/skillset --help`.

## Quick start

<p align="center">
  <img src="https://raw.githubusercontent.com/itsmeyaw/skillset/main/assets/demo.gif" alt="Terminal demo: create a Skillset with skills from mattpocock/skills, then install it into a project with skillset install --set my-set." width="720">
</p>

```sh
skillset skill add mattpocock/skills --set my-set   # pick skills, pinned to their commits
skillset mcp add --set my-set                       # search the MCP Registry and pick a server
cd ~/projects/some-project
skillset install my-set                             # skills and MCP servers, into your agents
```

`--set my-set` names a Skillset kept in your home directory, usable from any project. Leave `--set` out to use `./skillset.json` in the current project, which you can commit so your team shares it.

To refresh, run `skillset skill up --set my-set` (and `mcp up`), then `install` again.

## MCP servers

MCP servers are stored in the Skillset next to skills, as a reviewed snapshot of how to run or reach each one. `install` reads only the Skillset file and never contacts a Registry.

**Add from the official MCP Registry:**

```sh
skillset mcp add io.github.example/weather          # latest version
skillset mcp add io.github.example/weather@1.4.2    # exact version
skillset mcp add                                    # search, then pick
skillset mcp add microsoft/markitdown --registry https://api.mcp.github.com   # another Registry
```

**Add by hand** (for servers no Registry lists):

```sh
skillset mcp add my-tool --env MY_TOOL_TOKEN -- npx -y my-tool-mcp   # local
skillset mcp add docs --url https://mcp.example.com/docs --header Authorization   # remote, https only
```

`--env` and `--header` take names only. `NAME=value` is rejected so you never save a secret by accident.

**Install:** `skillset install` writes each MCP server into the config of every selected agent, in that agent's own file and format (`-g` for the global config). Comments and unrelated settings are kept. An identical server is left alone; a different server with the same name is shown and you are asked before it is replaced.

**Secrets:** a secret input is never prompted for or saved. It is written as an env reference in the agent's syntax (such as `${VAR}`), and the install ends with the list of env vars to set.

**Update and remove:** `mcp up` moves Registry servers to the latest version. `mcp rm` removes them from the Skillset only; it never edits an agent's config.

**Supported agents** (`-a <id>`): `claude-code`, `cursor`, `github-copilot`, `opencode`, `gemini-cli`, `windsurf`, `kiro-cli`, `roo`, `amp`. Other agents are skipped with a "not supported" notice.

> [!WARNING]
> Agent config paths come from each agent's docs and have not been run against real agents. A running Claude Code rewrites `~/.claude.json`, so close it before `install -g`. Project configs such as `.mcp.json` need your approval in the agent before they take effect.

## Commands

Commands that edit entries take a noun first: `skill` or `mcp`. `install` and `ls` cover both.

| Command                    | Description                                                          |
| -------------------------- | -------------------------------------------------------------------- |
| `skill add [source]`       | Pin skills from a repository to the Skillset.                        |
| `skill rm [skills...]`     | Remove skills from the Skillset.                                     |
| `skill up [skills...]`     | Move pins to the latest commits.                                     |
| `mcp add [name[@version]]` | Add an MCP server (see [MCP servers](#mcp-servers)).                 |
| `mcp rm [names...]`        | Remove MCP servers from the Skillset.                                |
| `mcp up [names...]`        | Move Registry MCP servers to their latest version.                   |
| `list`, `ls`               | Show what is in the Skillset, or your named Skillsets with `--user`. |
| `install [set]`, `i`       | Install skills and MCP servers into your agents.                     |

Common flags: `--set <name>` picks the Skillset, `-a <id>` picks agents, `-g` installs globally, `--copy` copies instead of symlinking, `--install` installs right after `skill add` or `mcp add`, and `-y` skips every prompt. Run any command with `--help` for the rest.

Skill sources: `owner/repo`, `owner/repo#branch`, `owner/repo@v1.2.3`, GitHub tree URLs, or any Git URL. `install` also accepts a `.json` path or an HTTPS URL to a published Skillset; those are never saved or edited.

> [!IMPORTANT]
> Put the Skillset name before `-s`, as in `skillset install my-set -s grilling`. Otherwise it is read as another skill name.

The Skillset file is plain JSON with a [JSON Schema](schemas/skillset/v1.json) for editor validation.

## Telemetry

Skillset collects no data itself, but the [Vercel Skills CLI](https://github.com/vercel-labs/skills) it uses sends anonymous usage telemetry. Set `DISABLE_TELEMETRY=1` or `DO_NOT_TRACK=1` to turn it off.
