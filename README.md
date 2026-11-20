<div align="center">

<img src="https://raw.githubusercontent.com/itsmeyaw/skillset/main/assets/skillset.svg" alt="Skillset: Easily manage, install, and share multiple agent skills at once. Based on Vercel’s Skills CLI (skills.sh)." width="800">

[![npm version](https://img.shields.io/npm/v/@itsmeyaw/skillset?style=flat-square)](https://www.npmjs.com/package/@itsmeyaw/skillset)
[![Build Status](https://img.shields.io/github/actions/workflow/status/itsmeyaw/skillset/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/itsmeyaw/skillset/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/Node.js->=22.20.0-3c873a?style=flat-square)](https://nodejs.org)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)

[Installation](#installation) • [Quick start](#quick-start) • [Skills](#skills) • [MCP servers](#mcp-servers) • [Commands](#commands)

</div>

Skillset is a CLI for curating agent skills and MCP servers into one pinned, shareable list (a **Skillset**) and installing it into any project in one step. It wraps [Vercel's Skills CLI](https://github.com/vercel-labs/skills), so skills land in the same agent directories and `skills-lock.json` that `npx skills` uses. MCP servers are written into each agent's own MCP config.

- **Skills pinned to commits**: every skill records the exact Git commit it came from, so an install gives you what you reviewed.
- **MCP servers alongside**: add them from the MCP Registry or by hand. Secrets are never saved.
- **One list, every project**: keep a named Skillset in your home directory, or commit `./skillset.json` for your team.
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
skillset mcp add --set my-set                       # search the MCP Registry, pick a server
cd ~/projects/some-project
skillset install my-set                             # skills and MCP servers, into your agents
```

`--set my-set` names a Skillset kept in your home directory, usable from any project. Leave `--set` out to use `./skillset.json` in the current project.

## Skills

```sh
skillset skill add mattpocock/skills -s grilling   # add one skill
skillset skill up                                  # move pins to the latest commits
skillset skill rm                                  # pick skills to drop
```

- **Sources:** `owner/repo`, `owner/repo#branch`, `owner/repo@v1.2.3` (tag or full SHA), GitHub tree URLs, or any Git URL. Private repositories use your Git credentials.
- **Pins:** nothing changes until you run `skill up`. Sources pinned to a tag or SHA are kept.
- **Install:** `install` asks which skills, which agents, project or global scope, and symlink or copy. Without `-a`, skills go to Universal agents (`.agents/skills`), Claude Code and any detected agent.

## MCP servers

MCP servers are stored in the Skillset as a reviewed snapshot of how to run or reach each one. `install` reads only the Skillset file and never contacts a Registry.

```sh
skillset mcp add io.github.example/weather@1.4.2      # from the official Registry (version optional)
skillset mcp add                                      # search the Registry, then pick
skillset mcp add my-tool --env MY_TOOL_TOKEN -- npx -y my-tool-mcp               # by hand, local
skillset mcp add docs --url https://mcp.example.com/docs --header Authorization  # by hand, remote
```

- **Registries:** use another Registry with `--registry <https-url>`. `mcp up` moves Registry servers to their latest version.
- **Secrets:** `--env` and `--header` take names only; `NAME=value` is rejected. At install, a secret is written as an env reference in the agent's syntax (such as `${VAR}`), and the install ends with the env vars to set.
- **Install:** each server goes into every selected agent's own config file (`-g` for global). Comments and unrelated settings are kept. A different server with the same name is shown and you are asked before it is replaced.
- **Agents:** `claude-code`, `cursor`, `github-copilot`, `opencode`, `gemini-cli`, `windsurf`, `kiro-cli`, `roo`, `amp`. Others are skipped with a notice.
- **Remove:** `mcp rm` edits the Skillset only, never an agent's config.

> [!WARNING]
> Agent config paths come from each agent's docs and have not been run against real agents. A running Claude Code rewrites `~/.claude.json`, so close it before `install -g`. Project configs such as `.mcp.json` need your approval in the agent.

## Commands

Commands that edit entries take a noun first: `skill` or `mcp`. `install` and `ls` cover both.

| Command                    | Description                                                          |
| -------------------------- | -------------------------------------------------------------------- |
| `skill add [source]`       | Pin skills from a repository to the Skillset.                        |
| `skill rm [skills...]`     | Remove skills from the Skillset.                                     |
| `skill up [skills...]`     | Move pins to the latest commits.                                     |
| `mcp add [name[@version]]` | Add an MCP server from a Registry or by hand.                        |
| `mcp rm [names...]`        | Remove MCP servers from the Skillset.                                |
| `mcp up [names...]`        | Move Registry MCP servers to their latest version.                   |
| `list`, `ls`               | Show what is in the Skillset, or your named Skillsets with `--user`. |
| `install [set]`, `i`       | Install skills and MCP servers into your agents.                     |

Common flags: `--set <name>` picks the Skillset, `-s`/`-m` select skills/MCP servers on `install`, `-a <id>` picks agents, `-g` installs globally, `--copy` copies instead of symlinking, `--install` installs right after an `add`, and `-y` skips every prompt. Run any command with `--help` for the rest.

`install` also accepts a `.json` path or an HTTPS URL to a published Skillset. Those are fetched each time and never saved or edited. The Skillset file is plain JSON with a [JSON Schema](schemas/skillset/v1.json) for editor validation.

> [!IMPORTANT]
> Put the Skillset name before `-s`, as in `skillset install my-set -s grilling`. Otherwise it is read as another skill name.

## Telemetry

Skillset collects no data itself, but the [Vercel Skills CLI](https://github.com/vercel-labs/skills) it uses sends anonymous usage telemetry. Set `DISABLE_TELEMETRY=1` or `DO_NOT_TRACK=1` to turn it off.
