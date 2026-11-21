## Development

- Use `caveman` skill, including for subagents.
- Use `caveman-commit` skill for commit message.
- Use `code-review` skills for review.
- Commit in small functional changes.
- Use `implement` skills for implementation.
- Use `caveman-commit` skill for a PR title and `pr` skill for writing the PR body.

## Agent skills

### Issue tracker

Issues live in GitHub Issues (`itsmeyaw/skillset`, via `gh`). See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Project Structure

- `src/`: CLI source (`skillset` binary, entry `src/bin.ts`, built to `dist/`).
  - `commands/`: one file per noun-verb command (`add`, `install`, `list`, `remove`, `update`, `mcp-*`).
  - `agents/`: per-agent skill/MCP config writers and `mcp-agents.ts`.
  - `prompts/`: interactive prompt helpers.
  - Root files: skillset file/store, upstream fetching, pinning, install planning, MCP entry/snapshot logic.
- `test/`: Vitest tests (`*.test.ts`) plus shared fixtures/harness.
- `schemas/skillset/v1.json`: generated skillset file schema (`pnpm schema:generate`, from `scripts/`).
- `docs/`: `adr/` decisions, `agents/` agent-skill config, `research/` notes.
- `.changeset/`: pending changesets. `CHANGELOG.md` is generated.
- `GLOSSARY.md`, `CODING_STANDARDS.md`: domain terms and code conventions.
- `.agents/skills/`: skill sources; `.claude/`, `.windsurf/` hold symlinks to them.

Checks: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`.
