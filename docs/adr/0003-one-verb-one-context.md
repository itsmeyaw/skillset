# One verb, one context: `install` installs a Skillset, `add` edits one

`install` used to take either a User Skillset name or a Source. Given a Source, it added Entries and then installed, as Vercel's `skills install <source>` and `npm install <pkg>` do. Now `install` only installs a Skillset (a bare name, a `.json` path, an `https://` URL per [ADR 0004](0004-remote-skillsets-are-read-only.md), or `./skillset.json`), and `add` only edits one. `add --install` runs `add` and then a full `install` of the whole Skillset, with the same prompts as typing `skillset install`, and passes `-a`, `-g` and `--copy` through. We chose this because one argument slot with two meanings made the core idea, a curated Skillset that you install anywhere, harder to see. Go and Nix split these verbs for the same reason ([research](../research/cli-collection-vs-item-ux.md#p2-hard-verb-split-installsync-applies-add-mutates)).

## Considered Options

- **`install <source>` adds, then installs (npm, Bun, APM, Vercel).** Rejected: the same verb would either install a Skillset or change one, depending on the form of its argument.
- **`add` installs by default (pnpm, Bundler, Vercel `skills add`).** Rejected: curating a User Skillset would install it into whatever folder you happen to be in.
- **A `use` verb that records and installs (mise).** Rejected: Vercel's `skills use` means a temporary skill that is never installed.
- **Install only the Entries just added (APM).** Rejected: `install` would then have two scopes, and `add --install` would stop being exactly `add` followed by `install`.

## Consequences

- An `install` argument that names no Skillset, such as `owner/repo`, fails with `Cannot find Skillset "<arg>" in <location>. To install a skill, use \`skillset add\`.` The message does not try to guess whether the argument was a skill or a Source.
- `add` writes the Skillset before the install step starts, so declining or failing the install keeps the added Entries.
- On `install`, when the last `-s` has several space-separated values and no other Skillset is given (a positional name or `--set`), the final value is the Skillset name, following the bare-name rule of ADR 0002. Repeat `-s` to select several skills.
- On `add`, `-s` and `--all` select skills from the Source. There is no way to install only some Entries through `add --install`; use `install -s` for that.
