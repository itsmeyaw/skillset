# Remote Skillsets are read-only and recognised by an `https://` value

`install` accepts an `https://` URL, as the positional argument or as `--set`, and installs the Skillset file it serves (GitHub `blob` URLs are rewritten to raw). The form decides, extending ADR 0002: a value starting with `https://` is a Remote Skillset, a `.json` value is a path, and anything else is a User Skillset name. A Remote Skillset is fetched on every install, never cached or saved, and `ls --set <url>` also reads it; `add`, `remove` and `update` reject it. We did this so a curator can publish one URL and others install it, without giving every command a half-working "edit a remote file" mode.

## Considered Options

- **`install owner/repo` fetches `skillset.json` from the default branch.** Rejected: ADR 0003 made `install owner/repo` fail so that an argument is never guessed to be a Source.
- **Download the file into the User skillset directory first.** Rejected: it creates a second copy that silently drifts from the published one.

## Consequences

- Without `-y`, install lists the fetched Entries (name, Source, short Pin) and asks for confirmation before writing anything, because the file's Sources are not chosen by the user.
- `add`'s positional argument is still a Source, so an `https://` Git URL stays valid there. Only `--set <url>` is rejected by `add`, `remove` and `update`.
- Only `https` is accepted, including after redirects. There is no authentication, so private URLs fail with the HTTP status.
- The body is limited to 1 MB and 10 seconds, and is validated by the same schema as a local Skillset file.
