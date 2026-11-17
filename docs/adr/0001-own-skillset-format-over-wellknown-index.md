# Own skillset format installed through the `skills` API, not a V2 well-known index

We first planned to emit `WellKnownSkillEntryV2` entries (sha256 digest per artifact) and have users run `skills add skillset.json`. `skills@1.8.1` cannot read a local index (it only fetches `/.well-known/agent-skills/index.json` over http(s), never from GitHub hosts), and GitHub cannot serve a single skill folder as an archive with `SKILL.md` at its root, so multi-file skills would need self-built, self-hosted archives. Instead, the Skillset file uses its own format, and each Entry is pinned to a full commit SHA. `skillset install` passes the SHA as `ref` to `resolveSource()`, checks that the resolved commit equals the Pin, and passes the handle to `installSkills()`. The latter rejects `ref` with a resolved handle. The commit SHA is the integrity check (git content-addresses the tree), so no separate digest is stored.

## Consequences

- Consumers install with `skillset install`, not `skills add`.
- Only git sources (GitHub for now) can be pinned; well-known and download sources are out of scope.
- `skills@1.8.1` requires Node 22.20.0+, rather than the spec's Node 22.19 minimum.
