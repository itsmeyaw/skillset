# Own skillset format installed through the `skills` API, not a V2 well-known index

We first planned to emit `WellKnownSkillEntryV2` entries (sha256 digest per artifact) and have users run `skills add skillset.json`. `skills@1.8.1` cannot read a local index (it only fetches `/.well-known/agent-skills/index.json` over http(s), never from GitHub hosts), and GitHub cannot serve a single skill folder as an archive with `SKILL.md` at its root, so multi-file skills would need self-built, self-hosted archives. Instead, the Skillset file uses its own format, each Entry is pinned to a full commit SHA, and `skillset install` calls the exported `installSkills()` with that SHA as `ref`. The commit SHA is the integrity check (git content-addresses the tree), so no separate digest is stored.

## Consequences

- Consumers install with `skillset install`, not `skills add`.
- Only git sources (GitHub for now) can be pinned; well-known and download sources are out of scope.
