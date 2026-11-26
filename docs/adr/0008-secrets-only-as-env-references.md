# Secrets reach Agents only as env references

Skillset files are shared and published, and Agents' project files such as `.mcp.json` are often committed, so no secret value is ever written to either. An MCP Entry declares its inputs (env vars, headers, and `{var}` variables in arguments, URLs and headers) by name, with description and whether each is required or secret. On install, a secret input is written as an env reference in the Agent's own syntax (`${VAR}`, `${env:VAR}`, `{env:VAR}`) and is never prompted for. A non-secret input takes its default or a prompted value and is written as a literal. Under `-y`, a required input without a value is written as an env reference too, so unattended installs never fail on inputs. Install ends by listing the env vars the user must set.

## Considered Options

- **Prompt for every value and write it into the Agent configuration.** Rejected: secrets would end up in plain text in files that are often committed.

## Consequences

- An env var input keeps its own name as the env var, unless it is not a valid identifier (such as `X-API-Key`): the Registry snapshot then sets `env` to the upper snake case name (`X_API_KEY`) and the Agent keeps the real name as its key. A secret `{var}` in an argument, header or URL defaults to `<ENTRY>_<VAR>` in upper snake case, which the curator can edit in the Skillset file.
- `mcp add` rejects `--env NAME=value` and `--header NAME=value`: only names are accepted.
- Agents without env references (Zed, Cline) cannot receive MCP Entries until they can be served without plain-text secrets.
