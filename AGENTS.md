## Development

- Use `caveman` skill, including for subagents.
- Use `caveman-commit` skill for commit message.
- Use `code-review` skills for review.
- Commit in small functional changes.
- Always add one-line comment citation to the standard for a logic. For example: `RFC 1034 §4.3.2: xxxxx`.
- Use `implement` skills for implementation.

## Agent skills

### Issue tracker

Issues live in GitHub Issues (`itsmeyaw/skillset`, via `gh`). See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
