# Own per-Agent MCP writers instead of `add-mcp`

`skills` has no MCP support, so Skillset writes MCP Entries into each Agent's MCP configuration itself, through an `Agent` abstraction whose `installMcp` knows that Agent's project and global file, key path, entry shape and env reference syntax. `add-mcp` (Neon) covers 25 Agents as a library, but it writes env references unchanged (OpenCode needs `{env:VAR}`, Cursor and Windsurf need `${env:VAR}`), rewrites Codex's TOML and loses its comments, lacks Amp, Roo and Continue, and uses different Agent ids from `skills`. Working around those gaps would need per-Agent knowledge anyway, and the Agents' formats change rarely. Skill Entries still install through `skills`' batch `installSkills`, because it writes the shared `.agents/skills` directory once for all Universal agents and updates `skills-lock.json`.

## Considered Options

- **`add-mcp` as a library.** Rejected for the gaps above.
- **Each Agent's own CLI (`claude mcp add-json`, `codex mcp add`).** Rejected: it works only for Agents that have such a command and are installed.
- **`installSkill` on each `Agent`.** Rejected: it would break the shared Universal agents directory and `skills-lock.json`.

## Consequences

- The first Agents are Claude Code, Cursor, GitHub Copilot, OpenCode, Gemini CLI, Windsurf (Devin Desktop paths), Kiro, Roo and Amp: JSON or JSONC files, edited in place so comments are kept, and all supporting env references. Other selected Agents are skipped with a notice.
- Codex (TOML), Goose and Continue (YAML), and Zed and Cline (no env references) are left out for now.
- Claude Code and GitHub Copilot share the project `.mcp.json`, which is written once. OpenCode gets the V2 shape unless its file already uses V1.
- A server of the same name that differs from the MCP Entry is never overwritten without consent: interactive installs ask (default no), `-y` keeps the existing one and warns. Agent configuration files are user data and may hold values typed by hand.
