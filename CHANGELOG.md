# @itsmeyaw/skillset

## 0.4.0

### Minor Changes

- [#69](https://github.com/itsmeyaw/skillset/pull/69) [`249935d`](https://github.com/itsmeyaw/skillset/commit/249935d3b90c6d5234741c647ed18f74b6b735fd) Thanks [@itsmeyaw](https://github.com/itsmeyaw)! - Add MCP server support. A Skillset can now hold MCP Entries next to skills, in an optional `mcp` array of the v1 file. Add them with `mcp add` from the official MCP Registry, from another Registry with `--registry`, or by hand with `-- <command>` or `--url`; update them with `mcp up` and remove them with `mcp rm`. `install` writes selected MCP Entries into the MCP config of Claude Code, Cursor, GitHub Copilot, OpenCode, Gemini CLI, Windsurf, Kiro, Roo Code and Amp, selected with the new `-m/--mcp` flag. Secrets are never saved: they are written as env var references and install lists the env vars to set. `ls` shows MCP Entries in their own section.

  Skill commands move under `skill`: `skill add`, `skill rm` and `skill up`. The top-level `add`, `rm` and `up` (and their long and short aliases) still work, print a deprecation notice, and will be removed in 1.0. Older CLI versions reject a Skillset file that contains `mcp`.

- [#54](https://github.com/itsmeyaw/skillset/pull/54) [`6ade49d`](https://github.com/itsmeyaw/skillset/commit/6ade49d3c93816cfd6ded9c9bfcfed8d0f38e2e4) Thanks [@itsmeyaw](https://github.com/itsmeyaw)! - Install published Skillsets directly from HTTPS URLs with confirmation and bounded downloads.

- [#34](https://github.com/itsmeyaw/skillset/pull/34) [`8fc5d3c`](https://github.com/itsmeyaw/skillset/commit/8fc5d3ce28b012058e6209cc226a0f8cc2bc26c7) Thanks [@itsmeyaw](https://github.com/itsmeyaw)! - Use a searchable multi-select for install skill selection, with all Entries initially selected. Share install planning and prompt handling across install, add, and remove. Remove the unused `searchSelect` prompt ([#17](https://github.com/itsmeyaw/skillset/issues/17)).

- [#69](https://github.com/itsmeyaw/skillset/pull/69) [`249935d`](https://github.com/itsmeyaw/skillset/commit/249935d3b90c6d5234741c647ed18f74b6b735fd) Thanks [@itsmeyaw](https://github.com/itsmeyaw)! - List the Universal agent first in the agent prompt. Skill, MCP server and agent prompts now show Ctrl+A to select all and Ctrl+N to select none of the matching choices.

### Patch Changes

- [#78](https://github.com/itsmeyaw/skillset/pull/78) [`9b78372`](https://github.com/itsmeyaw/skillset/commit/9b783729f065d6c139813a2826893b28ffdbaf2c) Thanks [@itsmeyaw](https://github.com/itsmeyaw)! - Write through a symlinked Agent config or Skillset file instead of replacing the link with a plain file.

- [#35](https://github.com/itsmeyaw/skillset/pull/35) [`680136e`](https://github.com/itsmeyaw/skillset/commit/680136e5a78a418e85fecf003cd2d8670728cfe6) Thanks [@itsmeyaw](https://github.com/itsmeyaw)! - Derive argument expansion from command definitions and obtain supported agent IDs through Upstream, preserving existing CLI behavior.

- [#30](https://github.com/itsmeyaw/skillset/pull/30) [`8c15b53`](https://github.com/itsmeyaw/skillset/commit/8c15b53240568fc5cf43e71b3f57aaafee24e44f) Thanks [@itsmeyaw](https://github.com/itsmeyaw)! - Fix Skillset names and paths after space-separated install skill flags. Repeat `-s` or specify `--set ./skillset.json` when selecting multiple skills from the default Project Skillset.

- [#77](https://github.com/itsmeyaw/skillset/pull/77) [`7967a4b`](https://github.com/itsmeyaw/skillset/commit/7967a4b481b72603b3568b7fcdf336e8359ccf0b) Thanks [@itsmeyaw](https://github.com/itsmeyaw)! - Fail the install with a clear message when no chosen Agent can receive MCP Entries, instead of silently skipping them.

- [#81](https://github.com/itsmeyaw/skillset/pull/81) [`b73aaba`](https://github.com/itsmeyaw/skillset/commit/b73aaba63dd54c725307aa6dd5aad7a468edd5d9) Thanks [@itsmeyaw](https://github.com/itsmeyaw)! - Stop MCP input and template lookups from reading Object.prototype keys such as constructor.

- [#80](https://github.com/itsmeyaw/skillset/pull/80) [`6b3b1d5`](https://github.com/itsmeyaw/skillset/commit/6b3b1d558b2068d37c89f2ff6640219cc9547380) Thanks [@itsmeyaw](https://github.com/itsmeyaw)! - Merge the duplicated unique-name filters for Skill Entries and MCP Entries into one helper, leaving the schema and error messages unchanged.

- [#34](https://github.com/itsmeyaw/skillset/pull/34) [`8fc5d3c`](https://github.com/itsmeyaw/skillset/commit/8fc5d3ce28b012058e6209cc226a0f8cc2bc26c7) Thanks [@itsmeyaw](https://github.com/itsmeyaw)! - Preserve the existing default agent order and supported-agent check during install planning.

- [#79](https://github.com/itsmeyaw/skillset/pull/79) [`a80708e`](https://github.com/itsmeyaw/skillset/commit/a80708e163c9822c7c79891520f735efdb615af5) Thanks [@itsmeyaw](https://github.com/itsmeyaw)! - Reject Registry responses whose server names, versions, package identifiers or URLs contain control characters.

- [#54](https://github.com/itsmeyaw/skillset/pull/54) [`6ade49d`](https://github.com/itsmeyaw/skillset/commit/6ade49d3c93816cfd6ded9c9bfcfed8d0f38e2e4) Thanks [@itsmeyaw](https://github.com/itsmeyaw)! - Rename the internal Entry type and helpers to Skill Entry and update command descriptions to match the glossary. Skillset files and CLI behavior are unchanged.

- [#33](https://github.com/itsmeyaw/skillset/pull/33) [`78ba609`](https://github.com/itsmeyaw/skillset/commit/78ba609e8c7680d4fa6a0fd50cac43840a5a98a1) Thanks [@itsmeyaw](https://github.com/itsmeyaw)! - Report skipped skill targets and list only skills that were installed, including when a later install fails.

- [#82](https://github.com/itsmeyaw/skillset/pull/82) [`657c50e`](https://github.com/itsmeyaw/skillset/commit/657c50e65314d2a5a0a6540bb22a4ee545334fa5) Thanks [@itsmeyaw](https://github.com/itsmeyaw)! - Share the identical Amp and Kiro entry builder and the single `isObject` helper between agent files.

- [#32](https://github.com/itsmeyaw/skillset/pull/32) [`62a9de8`](https://github.com/itsmeyaw/skillset/commit/62a9de8cee89ce8e5c9f067dd486781a5b6b0cc2) Thanks [@itsmeyaw](https://github.com/itsmeyaw)! - Reuse each pinned Source when adding and installing, avoiding a second clone during `add --install`. Handle branch, tree URL, and GitHub alias Sources consistently across add and install, and reject executable Git transports before invoking Git.

- [#55](https://github.com/itsmeyaw/skillset/pull/55) [`587bc8a`](https://github.com/itsmeyaw/skillset/commit/587bc8a1229446b7a5739a7e97982631416ed732) Thanks [@itsmeyaw](https://github.com/itsmeyaw)! - Add the `skill` command group with `skill add`, `skill rm` and `skill up`. The top-level `add`, `remove`, `update` commands and their short aliases still work and print a deprecation notice; they will be removed in 1.0.

- [#31](https://github.com/itsmeyaw/skillset/pull/31) [`ce80957`](https://github.com/itsmeyaw/skillset/commit/ce80957dfa10839c4de70cff6107ddf8742fa0f0) Thanks [@itsmeyaw](https://github.com/itsmeyaw)! - Unify Skillset file resolution and errors across commands. Validate existing files before adding or listing Source skills with `add -l`.

## 0.3.0

### Minor Changes

- [`478bde4`](https://github.com/itsmeyaw/skillset/commit/478bde43a87aadcde2e66c7975aef7119bb0edb1) Thanks [@itsmeyaw](https://github.com/itsmeyaw)! - Add shared default agent selection for install and searchable prompt choices, with a fallback when no default agent exists. Fix empty Skillset installs, atomic Skillset saves, preserved file permissions, rejection of control characters and existing temp files, wide-text prompt wrapping, and named Skillsets placed after agent arguments.

- [`b07d6c2`](https://github.com/itsmeyaw/skillset/commit/b07d6c2f1a8803ce47b25c5b8bf65f29791a6fd2) Thanks [@itsmeyaw](https://github.com/itsmeyaw)! - `install` now accepts only a Skillset name or `.json` path. Replace `install <source>` with `add <source> --install` to add skills and install the whole Skillset. Replace `ls -g` with `ls --user` to list User Skillsets; `-g` now means global installation scope only.

## 0.2.4

### Patch Changes

- [`6f15798`](https://github.com/itsmeyaw/skillset/commit/6f15798d1620149d2133060fbaa2f98f200e4a3e) Thanks [@itsmeyaw](https://github.com/itsmeyaw)! - First publish using changeset
