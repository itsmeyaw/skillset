# MCP Entries are snapshots of one package or remote, stored in Skillset file v1

An MCP Entry added from a Registry stores the resolved launch details of the one package or remote the curator chose: registry type, identifier and exact version, transport, argument list, input declarations and `{var}` templates, or the remote URL and header names. It also stores the Registry base URL, the server name and the server version, so `mcp up` can find newer versions. `install` reads only the Skillset file and never contacts the Registry. We chose this over storing only a reference (Registry, name, version) because the official Registry is still a preview that may reset its data, its docs say host applications should not depend on it at install time, and manual MCP Entries need the same shape anyway, so both kinds share one install path. MCP Entries live in an optional `mcp` array added to schema v1. They do not get a new schema version, because the change only adds to the format.

## Considered Options

- **Reference only, resolved at install.** Rejected for the reasons above.
- **Store every package and remote the server offers, and choose at install.** Rejected: the curator reviews one way of running the server, and every install should use that one.
- **A `v2` schema URL.** Rejected: the change is purely additive.
- **Key `mcpServers`.** Rejected: Agents use that key for an object keyed by name, with a different entry shape, so a pasted Agent config block would look valid but fail.

## Consequences

- MCP Entries have exact versions, not Pins. Package types must name an exact version. Remote and manual MCP Entries are stored as given.
- `mcp add <name>[@version]` defaults to the latest active version. `mcp up` moves every Registry MCP Entry it covers to the latest active version, including those added with `@version`. Manual MCP Entries are skipped.
- Only `npm`, `pypi`, `nuget` and `oci` packages and remotes are accepted. `cargo` has no runner and its binary name is unknown. `mcpb` would need downloading and unpacking executables.
- Launch commands are stored as argument lists, never as shell strings.
- Older CLIs reject a Skillset file that contains `mcp` as invalid.
