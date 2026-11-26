# @itsmeyaw/skillset

## 0.4.1

### Patch Changes

- [`4a08656`](https://github.com/itsmeyaw/skillset/commit/4a086560c2c33bd6770a66e67f191da0ba7a2d9c) Thanks [@itsmeyaw](https://github.com/itsmeyaw)! - The deprecated top-level `add`, `remove` and `update` commands no longer appear in `skillset --help`. They still run, with their aliases, and print the deprecation notice.

## 0.4.0

### Minor Changes

- [#94](https://github.com/itsmeyaw/skillset/pull/94) [`adc16df`](https://github.com/itsmeyaw/skillset/commit/adc16df26d53bcc48e7ad5a17c6b658e782b59f0) Thanks [@itsmeyaw](https://github.com/itsmeyaw)! - `mcp add` now asks "Install skillset?" after writing the Entry when `--install` is absent, as `skill add` does. `-y` and a missing terminal still skip the question.

- [#69](https://github.com/itsmeyaw/skillset/pull/69) [`249935d`](https://github.com/itsmeyaw/skillset/commit/249935d3b90c6d5234741c647ed18f74b6b735fd) Thanks [@itsmeyaw](https://github.com/itsmeyaw)! - Add MCP server support. A Skillset can now hold MCP Entries next to skills, in an optional `mcp` array of the v1 file. Add them with `mcp add` from the official MCP Registry, from another Registry with `--registry`, or by hand with `-- <command>` or `--url`; update them with `mcp up` and remove them with `mcp rm`. `install` writes selected MCP Entries into the MCP config of Claude Code, Cursor, GitHub Copilot, OpenCode, Gemini CLI, Windsurf, Kiro, Roo Code and Amp, selected with the new `-m/--mcp` flag. Secrets are never saved: they are written as env var references and install lists the env vars to set. `ls` shows MCP Entries in their own section.

  Skill commands move under `skill`: `skill add`, `skill rm` and `skill up`. The top-level `add`, `rm` and `up` (and their long and short aliases) still work, print a deprecation notice, and will be removed in 1.0. Older CLI versions reject a Skillset file that contains `mcp`.

- [#54](https://github.com/itsmeyaw/skillset/pull/54) [`6ade49d`](https://github.com/itsmeyaw/skillset/commit/6ade49d3c93816cfd6ded9c9bfcfed8d0f38e2e4) Thanks [@itsmeyaw](https://github.com/itsmeyaw)! - Install published Skillsets directly from HTTPS URLs with confirmation and bounded downloads.

- [#34](https://github.com/itsmeyaw/skillset/pull/34) [`8fc5d3c`](https://github.com/itsmeyaw/skillset/commit/8fc5d3ce28b012058e6209cc226a0f8cc2bc26c7) Thanks [@itsmeyaw](https://github.com/itsmeyaw)! - Use a searchable multi-select for install skill selection, with all Entries initially selected. Share install planning and prompt handling across install, add, and remove. Remove the unused `searchSelect` prompt ([#17](https://github.com/itsmeyaw/skillset/issues/17)).

- [#69](https://github.com/itsmeyaw/skillset/pull/69) [`249935d`](https://github.com/itsmeyaw/skillset/commit/249935d3b90c6d5234741c647ed18f74b6b735fd) Thanks [@itsmeyaw](https://github.com/itsmeyaw)! - List the Universal agent first in the agent prompt. Skill, MCP server and agent prompts now show Ctrl+A to select all and Ctrl+N to select none of the matching choices.

### Patch Changes

- [#96](https://github.com/itsmeyaw/skillset/pull/96) [`3ae9cae`](https://github.com/itsmeyaw/skillset/commit/3ae9cae724cde2a74f124da83e3dba1cb676585d) Thanks [@itsmeyaw](https://github.com/itsmeyaw)! - Describe each Agent's MCP file, key path and entry shape as data and write them all through one shared JSON writer, with no change to the files written.

- [#78](https://github.com/itsmeyaw/skillset/pull/78) [`9b78372`](https://github.com/itsmeyaw/skillset/commit/9b783729f065d6c139813a2826893b28ffdbaf2c) Thanks [@itsmeyaw](https://github.com/itsmeyaw)! - Write through a symlinked Agent config or Skillset file instead of replacing the link with a plain file.

- [#35](https://github.com/itsmeyaw/skillset/pull/35) [`680136e`](https://github.com/itsmeyaw/skillset/commit/680136e5a78a418e85fecf003cd2d8670728cfe6) Thanks [@itsmeyaw](https://github.com/itsmeyaw)! - Derive argument expansion from command definitions and obtain supported agent IDs through Upstream, preserving existing CLI behavior.

- [#114](https://github.com/itsmeyaw/skillset/pull/114) [`cbf5e8a`](https://github.com/itsmeyaw/skillset/commit/cbf5e8ac6485d14db4f7de4b0fa772bbd6bd838b) Thanks [@itsmeyaw](https://github.com/itsmeyaw)! - Installing globally with an empty HOME now fails with "Cannot install globally: HOME is empty" instead of writing the global config into the current directory.

- [#118](https://github.com/itsmeyaw/skillset/pull/118) [`727e083`](https://github.com/itsmeyaw/skillset/commit/727e083cc32e1ce442b167730ca6448f12ea196a) Thanks [@itsmeyaw](https://github.com/itsmeyaw)! - Using a User Skillset with an empty HOME now fails with "Cannot resolve the User Skillset directory: HOME is empty" instead of reading and writing `.skillset` in the current directory.

- [#30](https://github.com/itsmeyaw/skillset/pull/30) [`8c15b53`](https://github.com/itsmeyaw/skillset/commit/8c15b53240568fc5cf43e71b3f57aaafee24e44f) Thanks [@itsmeyaw](https://github.com/itsmeyaw)! - Fix Skillset names and paths after space-separated install skill flags. Repeat `-s` or specify `--set ./skillset.json` when selecting multiple skills from the default Project Skillset.

- [#97](https://github.com/itsmeyaw/skillset/pull/97) [`0b209fc`](https://github.com/itsmeyaw/skillset/commit/0b209fcab82505345b9809133f161288b9a3555e) Thanks [@itsmeyaw](https://github.com/itsmeyaw)! - Resolve the MCP Agents, their answers and the Universal expansion once when the Install plan is built, and list the MCP Agents when confirming it.

- [#113](https://github.com/itsmeyaw/skillset/pull/113) [`3d772f0`](https://github.com/itsmeyaw/skillset/commit/3d772f06e30883f1776d0748a75476da74b01c03) Thanks [@itsmeyaw](https://github.com/itsmeyaw)! - Running skillset in parallel on the same Skillset file or Agent config no longer silently loses edits: the run that would overwrite another run's change now fails with a clear message and a non-zero exit code.

- [#77](https://github.com/itsmeyaw/skillset/pull/77) [`7967a4b`](https://github.com/itsmeyaw/skillset/commit/7967a4b481b72603b3568b7fcdf336e8359ccf0b) Thanks [@itsmeyaw](https://github.com/itsmeyaw)! - Fail the install with a clear message when no chosen Agent can receive MCP Entries, instead of silently skipping them.

- [#81](https://github.com/itsmeyaw/skillset/pull/81) [`b73aaba`](https://github.com/itsmeyaw/skillset/commit/b73aaba63dd54c725307aa6dd5aad7a468edd5d9) Thanks [@itsmeyaw](https://github.com/itsmeyaw)! - Stop MCP input and template lookups from reading Object.prototype keys such as constructor.

- [#98](https://github.com/itsmeyaw/skillset/pull/98) [`04be943`](https://github.com/itsmeyaw/skillset/commit/04be9430e08e4649ba697db51c34bb6eb9c336e6) Thanks [@itsmeyaw](https://github.com/itsmeyaw)! - Fix `mcp rm -y` with no names printing the usage of `skill rm`.

- [#80](https://github.com/itsmeyaw/skillset/pull/80) [`6b3b1d5`](https://github.com/itsmeyaw/skillset/commit/6b3b1d558b2068d37c89f2ff6640219cc9547380) Thanks [@itsmeyaw](https://github.com/itsmeyaw)! - Merge the duplicated unique-name filters for Skill Entries and MCP Entries into one helper, leaving the schema and error messages unchanged.

- [#34](https://github.com/itsmeyaw/skillset/pull/34) [`8fc5d3c`](https://github.com/itsmeyaw/skillset/commit/8fc5d3ce28b012058e6209cc226a0f8cc2bc26c7) Thanks [@itsmeyaw](https://github.com/itsmeyaw)! - Preserve the existing default agent order and supported-agent check during install planning.

- [#79](https://github.com/itsmeyaw/skillset/pull/79) [`a80708e`](https://github.com/itsmeyaw/skillset/commit/a80708e163c9822c7c79891520f735efdb615af5) Thanks [@itsmeyaw](https://github.com/itsmeyaw)! - Reject Registry responses whose server names, versions, package identifiers or URLs contain control characters.

- [#116](https://github.com/itsmeyaw/skillset/pull/116) [`6dfabb1`](https://github.com/itsmeyaw/skillset/commit/6dfabb130f555f9a25e1c68a517cc2e3718a0186) Thanks [@itsmeyaw](https://github.com/itsmeyaw)! - A Registry env var whose name is not a valid shell identifier, such as `X-API-Key`, is now referenced and listed under a valid name like `X_API_KEY`.

- [#93](https://github.com/itsmeyaw/skillset/pull/93) [`7d3ce5b`](https://github.com/itsmeyaw/skillset/commit/7d3ce5bcf9a6027c9bbb8cdbc73eea6718583802) Thanks [@itsmeyaw](https://github.com/itsmeyaw)! - Move Registry lookup and renewal rules for MCP Entries out of `mcp add` and `mcp up` into one module. Behaviour and output stay the same.

- [#54](https://github.com/itsmeyaw/skillset/pull/54) [`6ade49d`](https://github.com/itsmeyaw/skillset/commit/6ade49d3c93816cfd6ded9c9bfcfed8d0f38e2e4) Thanks [@itsmeyaw](https://github.com/itsmeyaw)! - Rename the internal Entry type and helpers to Skill Entry and update command descriptions to match the glossary. Skillset files and CLI behavior are unchanged.

- [#33](https://github.com/itsmeyaw/skillset/pull/33) [`78ba609`](https://github.com/itsmeyaw/skillset/commit/78ba609e8c7680d4fa6a0fd50cac43840a5a98a1) Thanks [@itsmeyaw](https://github.com/itsmeyaw)! - Report skipped skill targets and list only skills that were installed, including when a later install fails.

- [#82](https://github.com/itsmeyaw/skillset/pull/82) [`657c50e`](https://github.com/itsmeyaw/skillset/commit/657c50e65314d2a5a0a6540bb22a4ee545334fa5) Thanks [@itsmeyaw](https://github.com/itsmeyaw)! - Share the identical Amp and Kiro entry builder and the single `isObject` helper between agent files.

- [#32](https://github.com/itsmeyaw/skillset/pull/32) [`62a9de8`](https://github.com/itsmeyaw/skillset/commit/62a9de8cee89ce8e5c9f067dd486781a5b6b0cc2) Thanks [@itsmeyaw](https://github.com/itsmeyaw)! - Reuse each pinned Source when adding and installing, avoiding a second clone during `add --install`. Handle branch, tree URL, and GitHub alias Sources consistently across add and install, and reject executable Git transports before invoking Git.

- [#55](https://github.com/itsmeyaw/skillset/pull/55) [`587bc8a`](https://github.com/itsmeyaw/skillset/commit/587bc8a1229446b7a5739a7e97982631416ed732) Thanks [@itsmeyaw](https://github.com/itsmeyaw)! - Add the `skill` command group with `skill add`, `skill rm` and `skill up`. The top-level `add`, `remove`, `update` commands and their short aliases still work and print a deprecation notice; they will be removed in 1.0.

- [#92](https://github.com/itsmeyaw/skillset/pull/92) [`579f95e`](https://github.com/itsmeyaw/skillset/commit/579f95e27793ef72ff8be0fdd70012cbca2eebc1) Thanks [@itsmeyaw](https://github.com/itsmeyaw)! - `skill rm` no longer says a Skillset is empty when it only has MCP Entries.

- [#115](https://github.com/itsmeyaw/skillset/pull/115) [`a127540`](https://github.com/itsmeyaw/skillset/commit/a127540a27d56f8a201839e8dc40d6a5a65795af) Thanks [@itsmeyaw](https://github.com/itsmeyaw)! - `skillset mcp add -y` no longer fails when a Registry server's first package or remote is unsupported but a later one works.

- [#31](https://github.com/itsmeyaw/skillset/pull/31) [`ce80957`](https://github.com/itsmeyaw/skillset/commit/ce80957dfa10839c4de70cff6107ddf8742fa0f0) Thanks [@itsmeyaw](https://github.com/itsmeyaw)! - Unify Skillset file resolution and errors across commands. Validate existing files before adding or listing Source skills with `add -l`.

- [#112](https://github.com/itsmeyaw/skillset/pull/112) [`f8b5716`](https://github.com/itsmeyaw/skillset/commit/f8b57160639993efdbef05da488b6cc99ebd8641) Thanks [@itsmeyaw](https://github.com/itsmeyaw)! - A leftover temporary file no longer blocks later saves of the Skillset file or an Agent config, and a failed save no longer leaves one behind.

- [#99](https://github.com/itsmeyaw/skillset/pull/99) [`be1d617`](https://github.com/itsmeyaw/skillset/commit/be1d617b80a9d7174d11b890d15a69d6a01b9959) Thanks [@itsmeyaw](https://github.com/itsmeyaw)! - Give each module, type and error its own name (Agent, scope, Launch, registry, Add/Remove/Update/Skillset file/Upstream errors), with no change to behaviour or messages.

## 0.3.0

### Minor Changes

- [`478bde4`](https://github.com/itsmeyaw/skillset/commit/478bde43a87aadcde2e66c7975aef7119bb0edb1) Thanks [@itsmeyaw](https://github.com/itsmeyaw)! - Add shared default agent selection for install and searchable prompt choices, with a fallback when no default agent exists. Fix empty Skillset installs, atomic Skillset saves, preserved file permissions, rejection of control characters and existing temp files, wide-text prompt wrapping, and named Skillsets placed after agent arguments.

- [`b07d6c2`](https://github.com/itsmeyaw/skillset/commit/b07d6c2f1a8803ce47b25c5b8bf65f29791a6fd2) Thanks [@itsmeyaw](https://github.com/itsmeyaw)! - `install` now accepts only a Skillset name or `.json` path. Replace `install <source>` with `add <source> --install` to add skills and install the whole Skillset. Replace `ls -g` with `ls --user` to list User Skillsets; `-g` now means global installation scope only.

## 0.2.4

### Patch Changes

- [`6f15798`](https://github.com/itsmeyaw/skillset/commit/6f15798d1620149d2133060fbaa2f98f200e4a3e) Thanks [@itsmeyaw](https://github.com/itsmeyaw)! - First publish using changeset
