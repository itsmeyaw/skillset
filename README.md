<div align="center">

<img src="https://raw.githubusercontent.com/itsmeyaw/skillset/main/assets/skillset.svg" alt="Skillset: Easily manage, install, and share multiple agent skills at once. Based on Vercel’s Skills CLI (skills.sh)." width="800">

[![npm version](https://img.shields.io/npm/v/@itsmeyaw/skillset?style=flat-square)](https://www.npmjs.com/package/@itsmeyaw/skillset)
[![Build Status](https://img.shields.io/github/actions/workflow/status/itsmeyaw/skillset/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/itsmeyaw/skillset/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/Node.js->=22.20.0-3c873a?style=flat-square)](https://nodejs.org)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)

[Features](#features) • [Installation](#installation) • [Quick start](#quick-start) • [Commands](#commands) • [MCP servers](#mcp-servers) • [Skillset file](#skillset-file-format)

</div>

Skillset is a CLI for curating agent skills and MCP servers into a pinned, shareable list and installing that list into any project in one step. It wraps [Vercel's Skills CLI](https://github.com/vercel-labs/skills) ([skills.sh](https://skills.sh)), so skills land in the same agent directories and the same `skills-lock.json` file that `npx skills` uses. MCP servers are written into each agent's own MCP config.

## Features

- **Pinned to commits**: every skill records the exact Git commit it came from, so an install gives you exactly what you reviewed until you run `skill up`.
- **MCP servers too**: add servers from the official MCP Registry, from any other Registry, or by hand, and install them into every agent's MCP config. Secrets are never saved; they are written as env var references.
- **One list, every project**: keep a named Skillset in your home directory, or commit `./skillset.json` so your team shares it.
- **Mix sources**: combine skills from several repositories, branches, tags, or Git URLs into one Skillset.
- **Works with your agents**: installs for Universal agents (`.agents/skills`), Claude Code, and any detected agent by default, or for any agent you pick.
- **Interactive or scripted**: run a command without arguments to be prompted, or pass flags. `-y` skips every prompt.
- **Safe by default**: an install only adds skills and MCP servers. Anything that isn't in the Skillset is never removed, and an existing MCP server is never overwritten without asking.

## Installation

You need [Node.js](https://nodejs.org) 22.20.0 or later and [Git](https://git-scm.com).

```sh
npm install -g @itsmeyaw/skillset
```

Or run it without installing:

```sh
npx @itsmeyaw/skillset --help
```

## Quick start

Build your Skillset once, then install it in every project.

<p align="center">
  <img src="https://raw.githubusercontent.com/itsmeyaw/skillset/main/assets/demo.gif" alt="Terminal demo: create a Skillset with skills from mattpocock/skills, then install it into a project with skillset install --set my-set." width="720">
</p>

**1. Create your Skillset.** `--set my-set` names a Skillset you can use from any project:

```sh
skillset skill add --set my-set
```

You are asked for:

1. **Source?** Type a repository such as `mattpocock/skills`.
2. **Which skills?** Search and tick the skills you want.
3. **Add another source?** Answer `y` to mix in skills from more repositories, or `n` when you're done.
4. **Install skillset?** Answer `n` for now.

`skillset ls --set my-set` shows what is in it.

**2. Install it in any project.** From each project that should get the skills:

```sh
cd ~/projects/some-project
skillset install my-set
```

You are asked which skills, which agents, project or global scope, and symlink or copy, then to confirm.

**3. Keep it fresh.** Nothing changes until you update the pins:

```sh
skillset skill up --set my-set   # move pins to the latest commits
skillset skill rm --set my-set   # pick skills to drop
```

Re-run `skillset install my-set` in a project to pick up the changes.

> [!TIP]
> Coming from `npx skills add`? Add skills from one repository and install the whole Skillset in one command:
>
> ```sh
> skillset skill add mattpocock/skills -s grilling --install
> ```
>
> Leave out `--set` to use `./skillset.json` in the current project, which you can commit so your team shares it.

## Concepts

| Term          | Meaning                                                                                                          |
| ------------- | ---------------------------------------------------------------------------------------------------------------- |
| Skillset      | A shareable list of skills and MCP servers to install together, stored as a JSON file.                           |
| Entry         | One item in a Skillset: a Skill Entry or an MCP Entry, identified by its name.                                   |
| Skill Entry   | One skill in a Skillset: its name, Source, and Pin.                                                              |
| MCP Entry     | One MCP server in a Skillset: how an agent starts or reaches it, and which inputs it needs. Never holds secrets. |
| Source        | Where a Skill Entry comes from, such as `owner/repo`.                                                            |
| Pin           | The exact commit of the Source that a Skill Entry was taken from. MCP Entries have versions, not Pins.           |
| Registry      | A service that publishes MCP servers through the MCP Registry API, such as the official MCP Registry.            |
| User Skillset | A Skillset kept by name outside any project, such as `my-set`, so every project can use it.                      |

`skill add|rm|up` and `mcp add|rm|up` only change a Skillset. `install` only installs one. `skill add --install` and `mcp add --install` run both steps, one after the other. A Skill Entry and an MCP Entry may share a name; names are unique within each kind.

## Commands

Commands that edit Entries take a noun first, `skill` or `mcp`. `install` and `ls` work on the whole Skillset, both kinds at once.

| Command                                 | Description                                                                       |
| --------------------------------------- | --------------------------------------------------------------------------------- |
| `skill add [source]`                    | Pin skills from a Source to the Skillset; `--install` also installs.              |
| `skill rm [skills...]`                  | Remove Skill Entries from the Skillset (`--all` removes everything).              |
| `skill up [skills...]`                  | Move pins to the latest commits. Sources pinned to a version are kept.            |
| `mcp add [name[@version]]`              | Add an MCP server from a Registry; `--install` also installs.                     |
| `mcp add <name> -- <command> [args...]` | Add a local MCP server by hand.                                                   |
| `mcp add <name> --url <https-url>`      | Add a remote MCP server by hand.                                                  |
| `mcp rm [names...]`                     | Remove MCP Entries from the Skillset (`--all` removes everything).                |
| `mcp up [names...]`                     | Move Registry MCP Entries to the latest active version.                           |
| `list`, `ls`                            | Show Skill Entries and MCP Entries, or User Skillset names with `--user`.         |
| `install [set]`, `i`                    | Install the Skillset: skills at their Pins, MCP servers into each agent's config. |

`ls` prints Skill Entries as before, then, only if there are any, an `MCP servers:` section with each name, its kind (`registry` or `manual`) and how it runs.

Every command accepts `--set <value>` (default `./skillset.json`) and `--help`. `skill add` and `mcp add` create the Skillset file if it is missing. `install [set]` takes a name, `.json` path, or HTTPS URL, but you can't combine it with `--set`.

| Flag                 | Used by                                                 | Description                                                                                                   |
| -------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `-s, --skill <name>` | `skill add`, `install`                                  | Select skills from the Source for `skill add`, or Skill Entries for `install`.                                |
| `-m, --mcp <name>`   | `install`                                               | Select MCP Entries to install.                                                                                |
| `--all`              | `skill add`, `skill rm`, `mcp rm`                       | Select all skills from the Source, or remove every Entry.                                                     |
| `-l, --list`         | `skill add`                                             | List available skills without writing.                                                                        |
| `--install`          | `skill add`, `mcp add`                                  | After adding, install the whole Skillset.                                                                     |
| `-a, --agent <id>`   | `skill add`, `mcp add`, `install`                       | Select agents; on `skill add` and `mcp add`, requires `--install`.                                            |
| `-g, --global`       | `skill add`, `mcp add`, `install`                       | Install globally instead of per project; requires `--install` on `add`.                                       |
| `--copy`             | `skill add`, `mcp add`, `install`                       | Copy skills instead of symlinking; requires `--install` on `add`.                                             |
| `-y, --yes`          | `skill add`, `skill rm`, `mcp add`, `mcp rm`, `install` | Skip prompts in every step. On `mcp add`, pick the first package, or the first remote if there is no package. |
| `--registry <url>`   | `mcp add`                                               | Use another Registry (`https` only) instead of the official one.                                              |
| `--name <name>`      | `mcp add`                                               | Name the MCP Entry; defaults to the part of the Registry name after the last `/`.                             |
| `--url <url>`        | `mcp add`                                               | Add a remote server by hand.                                                                                  |
| `--env <NAME>`       | `mcp add`                                               | Declare an env var a manual local server needs. Repeatable. Names only.                                       |
| `--header <NAME>`    | `mcp add`                                               | Declare a header a manual remote server needs. Repeatable. Names only.                                        |
| `--user`             | `list`                                                  | List User Skillset names; cannot be combined with `--set`.                                                    |

To select several skills, MCP servers, or agents, repeat the flag or list the names after it. For `install`, when the last `-s` or `-m` has multiple space-separated values and no other Skillset is given (a positional name or `--set`), the final value is treated as the Skillset name. To select multiple Entries from the default Project Skillset, repeat the flag (for example, `install -s alpha -s beta`) or use `--set ./skillset.json`. If you decline or a `--install` step fails, the added Entries stay in the Skillset.

When you pass any of `-s` or `-m` to `install`, only the selected Entries are installed, of either kind: `install -s foo` writes no MCP config. Without them, `install` asks "Which skills?", then, only if the Skillset has MCP Entries, "Which MCP servers?" with everything selected. One agent choice and one confirmation cover both kinds.

Without `-a`, installs go to Universal agents (`.agents/skills`), Claude Code, and any detected agent. `-y` and non-interactive runs use these defaults without asking. MCP servers go to the same agents; see [MCP servers](#mcp-servers) for which agents can take them.

### Deprecated aliases

The top-level `add` (`a`), `remove` (`rm`) and `update` (`up`) still work as aliases of `skill add`, `skill rm` and `skill up`. They print a one-line deprecation notice and will be removed in 1.0. Move scripts to the `skill` commands.

### Sources

- `owner/repo`
- `owner/repo#branch`
- `owner/repo@v1.2.3` or `owner/repo@<full-sha>`
- GitHub tree URLs
- Other remote Git URLs

Quote sources that contain `#` in your shell. Private repositories use your existing Git credentials. Local paths and direct downloads cannot be pinned.

### User Skillsets

Pass a bare name to `--set` (or to `install`) to keep a Skillset outside any project:

```sh
skillset skill add mattpocock/skills -s grilling --set my-set
skillset install my-set
skillset ls --user   # list your User Skillsets
```

They are stored in the first of `$SKILLSET_HOME`, `$XDG_CONFIG_HOME/skillset`, or `~/.skillset`. To use a file in the current directory instead, give a path ending in `.json`, such as `skillset install ./team.json`.

> [!IMPORTANT]
> Put the Skillset name before `-s`, as in `skillset install my-set -s grilling`. Otherwise it is read as another skill name. Likewise, put it before `-a` if the name matches a supported agent ID.

### Remote Skillsets

Install a published Skillset directly from an HTTPS URL:

```sh
skillset install https://example.com/team.json
skillset install --set https://github.com/owner/repo/blob/main/skillset.json -y
```

GitHub blob links are converted to raw URLs. Remote Skillsets are fetched on every install, never saved, and can be listed with `ls --set <url>` but cannot be edited: `skill add|rm|up` and `mcp add|rm|up` reject them. Interactive installs show the Entries and ask for confirmation; for each MCP Entry the full launch command or URL is shown, because it runs on your machine. Use `-y` for unattended installs. Only HTTPS URLs are supported, with no authentication; downloads are limited to 1 MB and 10 seconds.

## MCP servers

A Skillset can hold MCP servers next to skills. Each is an MCP Entry: a reviewed snapshot of how to run or reach one server. `install` reads only the Skillset file and never contacts a Registry, so it works when the Registry is down or has changed.

### Adding a server

**From the official Registry.** Give the Registry name, optionally with an exact version:

```sh
skillset mcp add io.github.example/weather            # latest active version
skillset mcp add io.github.example/weather@1.4.2      # a specific version
skillset mcp add                                      # asks for a search term, then lists matches
```

- The Entry is named after the part of the Registry name after the last `/`. Use `--name` to pick another name. Names may use letters, digits, `.`, `_` and `-`, and must be unique among MCP Entries.
- A deprecated or deleted version is refused.
- If the server offers several packages or remotes, you pick one. With `-y` the first package wins, or the first remote if there is no package.
- Package types `npm`, `pypi`, `nuget` and `oci` are supported, plus remotes (`streamable-http` and `sse`). `cargo` and `mcpb` packages are rejected; choose a remote or another package, or add the server by hand.
- A search term must be at least 3 characters.
- The package version and the server version are stored exactly.

**From another Registry.** Pass the base URL of any service that serves the same API (GitHub's MCP registry, a company registry). Only `https` URLs are accepted, and the CLI adds `/v0.1` itself:

```sh
skillset mcp add microsoft/markitdown --registry https://api.mcp.github.com
```

The Registry is remembered on the Entry, so `mcp up` asks the same one later. Registry responses are limited to 1 MB and 10 seconds.

**By hand.** Use this for servers that no Registry lists. A local server is a command and its arguments after `--`. A remote server takes `--url`:

```sh
skillset mcp add my-tool --env MY_TOOL_TOKEN -- npx -y my-tool-mcp --verbose
skillset mcp add docs --url https://mcp.example.com/docs --header Authorization
```

The command is stored as an argument list and never run through a shell. `--env` and `--header` declare the names of inputs the server needs; `NAME=value` is rejected so you never save a secret by accident. The URL must use `https`. `--registry` and `--name` apply only to Registry servers.

`mcp add` writes the Skillset file first. Add `--install` (with `-a`, `-g`, `--copy`, `-y`) to then install the whole Skillset.

### Updating and removing

`mcp up [names...]` moves Registry Entries to the latest active version, including those added with `@version`. It takes a fresh snapshot of the same kind of package or remote. It leaves an Entry that is already current alone, skips manual Entries with a note, and skips with a warning an Entry whose newer version no longer offers the stored package type. If you edited the env var name of a secret, it is kept.

`mcp rm [names...]` (or `--all`) removes MCP Entries from the Skillset file only. It never edits an agent's config; remove servers from the agent yourself.

### Installing

`skillset install` writes each selected MCP Entry into the MCP config of each chosen agent, in that agent's own file, format and key. Use `-g` for the global config, otherwise the project config is used. Existing comments and unrelated settings in those files are kept, and a missing file (with its parent directories) is created.

- An identical server already in the file is left alone.
- A different server with the same name is shown next to the new one and you are asked before it is overwritten, with "no" as the default. With `-y` the existing server is kept and a warning is printed.
- A failure for one agent does not stop the others. Any failure gives a non-zero exit code. A selected agent that cannot take MCP servers gets a "not supported" notice and no error.
- A file that is not valid JSON is left untouched and reported.
- Files are written with a temporary file and an atomic rename, keeping the file's mode.

### Secrets and env vars

Skillset files are shared and agent project files such as `.mcp.json` are often committed, so no secret value is ever saved. An MCP Entry declares its inputs (env vars, headers, and `{var}` placeholders in arguments, URLs and headers) by name only. On install:

- A **secret** input is never prompted for. It is written as an env reference in the agent's own syntax: `${VAR}` for Claude Code, GitHub Copilot, Gemini CLI, Kiro and Amp; `${env:VAR}` for Cursor, Roo Code and Windsurf; `{env:VAR}` for OpenCode.
- A **non-secret** input uses its default, or the value you type when asked. Under `-y` or without a terminal, a required input with no value is written as an env reference too, so unattended installs never fail on inputs.
- The install ends with a list of the env vars to set, naming each server.
- A secret `{var}` in an argument, header or URL defaults to the env var `<ENTRY>_<VAR>` in upper snake case, such as `DOCS_AUTHORIZATION`. Edit the input's `env` in the Skillset file to match your conventions. An `env` input uses its own name.

A literal secret pasted into a hand-edited file (a well-known token shape such as `ghp_...` or `sk-...`, a `Bearer` credential, an `Authorization`, API key or token header without a `{var}`, or a default on a secret input) is rejected when the file is loaded. This check is best-effort and cannot catch every case.

### Supported agents

| Agent (`-a` id)                   | Project config                        | Global config                                                               |
| --------------------------------- | ------------------------------------- | --------------------------------------------------------------------------- |
| Claude Code (`claude-code`)       | `.mcp.json`                           | `~/.claude.json`                                                            |
| Cursor (`cursor`)                 | `.cursor/mcp.json`                    | `~/.cursor/mcp.json`                                                        |
| GitHub Copilot (`github-copilot`) | `.mcp.json` (shared with Claude Code) | `~/.copilot/mcp-config.json` (`$COPILOT_HOME`)                              |
| OpenCode (`opencode`)             | `opencode.json` or `opencode.jsonc`   | `~/.config/opencode/opencode.json` or `.jsonc`                              |
| Gemini CLI (`gemini-cli`)         | `.gemini/settings.json`               | `~/.gemini/settings.json`                                                   |
| Windsurf / Devin (`windsurf`)     | `.devin/mcp_config.json`              | `~/.config/devin/mcp_config.json`                                           |
| Kiro (`kiro-cli`)                 | `.kiro/settings/mcp.json`             | `~/.kiro/settings/mcp.json`                                                 |
| Roo Code (`roo`)                  | `.roo/mcp.json`                       | `mcp_settings.json` in the VS Code global storage of the Roo Code extension |
| Amp (`amp`)                       | `.amp/settings.json` or `.jsonc`      | `~/.config/amp/settings.json` or `.jsonc`                                   |

Other selected agents are skipped with a "not supported" notice. Codex (TOML), Goose and Continue (YAML) are not supported yet because they need other file formats, and Zed and Cline are left out because they cannot reference env vars, so they could not receive MCP servers without plain-text secrets.

The agent paths come from each agent's documentation and have not been run against real agents. Choosing `Universal` installs MCP servers for each detected Universal agent in the table.

### Caveats

- **Claude Code global config.** A running Claude Code rewrites `~/.claude.json` and can overwrite servers you installed with `-g`. Close it first, or install again after it exits.
- **Trust.** Project configs take effect only after you approve them: Claude Code asks you to approve servers in `.mcp.json`, Copilot CLI loads `.mcp.json` only after you trust the folder, and Amp needs `amp mcp approve <name>` for servers in `.amp/settings.json`.
- **Env var expansion.** Gemini CLI does not expand env references in arguments or URLs, so a secret `{var}` there stays literal. Copilot CLI and Kiro document expansion only in env and headers. Prefer env or header inputs for secrets.
- **JSON edits.** Servers are added to the config in place. Comments and trailing commas in `.jsonc` files are kept, and new entries follow the file's indentation and line endings. Existing OpenCode files that keep servers directly under `mcp` keep that shape; others get `mcp.servers`. Amp uses the flat key `amp.mcpServers`.
- **Concurrent writers.** Edits are not merged with a running agent that rewrites the same file.
- **Older CLIs.** A Skillset file with an `mcp` array is rejected as "Invalid Skillset file" by CLI versions without MCP support.

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
  ],
  "mcp": [
    {
      "name": "docs",
      "launch": {
        "type": "remote",
        "transport": "streamable-http",
        "url": "https://mcp.example.com/docs",
        "headers": [{ "name": "Authorization", "value": "Bearer {token}" }]
      },
      "inputs": [
        {
          "name": "token",
          "kind": "variable",
          "description": "Docs API token",
          "required": true,
          "secret": true,
          "env": "DOCS_MCP_TOKEN"
        }
      ]
    },
    {
      "name": "weather",
      "launch": {
        "type": "package",
        "registryType": "npm",
        "identifier": "@example/weather-mcp",
        "version": "1.4.2",
        "runtimeHint": "npx",
        "packageArguments": ["--region", "{region}"],
        "transport": "stdio"
      },
      "inputs": [
        {
          "name": "WEATHER_API_KEY",
          "kind": "env",
          "description": "Weather API key",
          "required": true,
          "secret": true
        },
        { "name": "region", "kind": "variable", "description": "Region to query", "default": "eu" }
      ],
      "origin": {
        "registry": "https://registry.modelcontextprotocol.io",
        "name": "io.github.example/weather",
        "version": "1.4.2"
      }
    }
  ]
}
```

The file stays on schema v1. The optional `mcp` array is sorted by name and is left out when empty, so a Skillset without MCP Entries is written exactly as before. Entries are checked when the file is loaded, and errors name the path to the problem. Point your editor at the [JSON Schema](schemas/skillset/v1.json) for validation and completion.

An MCP Entry has a `name`, one `launch`, optional `inputs`, and an `origin` for Registry Entries only.

| `launch.type` | Fields                                                                                                                                                                        |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package`     | `registryType` (`npm`, `pypi`, `nuget`, `oci`), `identifier`, exact `version`, `runtimeHint`, `runtimeArguments`, `packageArguments` (lists of tokens), `transport` (`stdio`) |
| `remote`      | `transport` (`streamable-http` or `sse`), `url` (`https`, may hold `{var}`), `headers` (list of `name` and `value`)                                                           |
| `command`     | `command` and `args`, for servers added by hand                                                                                                                               |

Each item of `inputs` declares a name and never a value:

| Key           | Meaning                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------- |
| `name`        | The env var name (`kind: "env"`) or the `{name}` placeholder (`kind: "variable"`).                      |
| `kind`        | `env` for an environment variable of the server, `variable` for a `{var}` in arguments, URL or headers. |
| `description` | Shown when asked for a value.                                                                           |
| `required`    | A required input without a value is written as an env reference.                                        |
| `secret`      | A secret is never prompted for or stored; it is written as an env reference.                            |
| `format`      | `string`, `number`, `boolean` or `filepath`.                                                            |
| `default`     | Used for a non-secret input when you give no value. Not allowed on a secret.                            |
| `choices`     | The values the server accepts.                                                                          |
| `env`         | The env var that a secret `variable` input reads. Edit it to match your conventions.                    |

`origin` holds the `registry` base URL, the Registry `name` of the server and its `version`, so `mcp up` can look for newer versions.

## Shell completions

Print a completion script for `bash`, `zsh`, `fish`, `sh`, `powershell`, or `pwsh`:

```sh
skillset --completions zsh > ~/.zfunc/_skillset
```

## Telemetry

> [!NOTE]
> Skillset collects no data itself. However, the [Vercel Skills CLI](https://github.com/vercel-labs/skills) library it uses sends anonymous usage telemetry by default. See [what is collected](https://github.com/vercel-labs/skills/blob/main/docs/troubleshooting.md#telemetry).

To turn it off, set `DISABLE_TELEMETRY=1` or `DO_NOT_TRACK=1`:

```sh
DISABLE_TELEMETRY=1 skillset install my-set
```
