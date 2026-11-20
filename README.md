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

MCP servers live in the Skillset next to skills and are installed with the same `install` command, into each agent's own MCP config.

```sh
skillset mcp add                                                     # search the MCP Registry, then pick
skillset mcp add my-tool --env MY_TOOL_TOKEN -- npx -y my-tool-mcp   # add by hand
skillset mcp up --set my-set                                         # move to the latest versions
```

Secrets are never saved or prompted for. They are written as env var references, and `install` lists the vars to set.

> [!NOTE]
> Agent config paths come from each agent's docs and have not been run against real agents. Supported: `claude-code`, `cursor`, `github-copilot`, `opencode`, `gemini-cli`, `windsurf`, `kiro-cli`, `roo`, `amp`.

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
