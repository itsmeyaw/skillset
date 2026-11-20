---
"@itsmeyaw/skillset": minor
---

Add MCP server support. A Skillset can now hold MCP Entries next to skills, in an optional `mcp` array of the v1 file. Add them with `mcp add` from the official MCP Registry, from another Registry with `--registry`, or by hand with `-- <command>` or `--url`; update them with `mcp up` and remove them with `mcp rm`. `install` writes selected MCP Entries into the MCP config of Claude Code, Cursor, GitHub Copilot, OpenCode, Gemini CLI, Windsurf, Kiro, Roo Code and Amp, selected with the new `-m/--mcp` flag. Secrets are never saved: they are written as env var references and install lists the env vars to set. `ls` shows MCP Entries in their own section.

Skill commands move under `skill`: `skill add`, `skill rm` and `skill up`. The top-level `add`, `rm` and `up` (and their long and short aliases) still work, print a deprecation notice, and will be removed in 1.0. Older CLI versions reject a Skillset file that contains `mcp`.
