# Entry commands are noun then verb; Skillset commands stay top-level

Adding MCP Entries means `add`, `remove` and `update` must say which kind of Entry they edit. The form of the argument cannot decide: `add` treats any value with `/` or `:` as a Source, and Registry names such as `io.github.owner/server` (or `microsoft/markitdown` on GitHub's Registry) look exactly like `owner/repo`. So the commands that edit Entries take a noun first: `skill add|rm|up` and `mcp add|rm|up`. `install` and `ls` act on the whole Skillset, both kinds at once, so they stay top-level without a noun. This keeps ADR 0003's split (`add` edits a Skillset, `install` installs one) and narrows it: the noun says which Entries are edited.

## Considered Options

- **A `--mcp` flag on the existing verbs (`add --mcp <name>`).** Rejected: `add` would then take a Source or a Registry name in the same slot, depending on a flag, and the manual-server flags would crowd `add`'s help.
- **Verb then noun (`add mcp`, `add skill`).** Rejected: help and completions group better by noun, as in `gh pr create` and `docker container ls`.
- **Recognising Registry names by form.** Rejected: they cannot be told apart from Sources.

## Consequences

- Top-level `add`, `rm` and `up` remain as aliases of `skill add`, `skill rm` and `skill up`, print a one-line deprecation notice, and are removed at 1.0.
- `install -s <skill>` and `install -m <name>` select Entries of each kind. When any selection flag is given, only the selected Entries are installed.
- `mcp add --install`, like `skill add --install`, writes the Skillset file and then installs the whole Skillset. Without `--install`, `mcp add` asks "Install skillset?" on a terminal, as `skill add` does; `-y` or no terminal means no. Both commands share one chain step, `chainInstall`, so the two cannot drift again.
- `chainInstall` uses the Upstream session it is given: `skill add` already holds one for pinning and passes it so clones are shared; `mcp add` pins nothing and lets the install open its own.
- `skill rm` and `mcp rm` change only the Skillset file and never remove anything from Agents.
