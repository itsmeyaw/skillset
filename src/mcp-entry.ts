import { Schema } from "effect";
import { entryText } from "./entry-text.ts";

const mcpName = entryText.check(
  Schema.isPattern(/^[A-Za-z0-9._-]+$/u, {
    message: "Expected letters, digits, '.', '_' or '-'",
  }),
);

// ADR 0006: remote MCP Entries are reached over HTTPS only.
const httpsUrl = entryText.check(
  Schema.isPattern(/^https:\/\/\S+$/u, { message: "Expected an https:// URL without spaces" }),
);

// ADR 0006: package types name an exact version, not a range or a moving tag. Digits-led, so
// dist-tags (`next`, `latest`) fail; wildcard segments (`1.x`) and range characters fail too.
const exactVersion = entryText.check(
  Schema.isPattern(/^(?!.*(?:^|[.-])[xX*](?:[.-]|$))v?\d[0-9A-Za-z.+!_-]*$/u, {
    message: "Expected an exact version such as 1.2.3, not a range or a tag like 'latest'",
  }),
);

// ADR 0006: arguments are lists of tokens, never shell strings.
const argumentList = Schema.optionalKey(Schema.Array(entryText));

const packageLaunch = Schema.Struct({
  type: Schema.Literal("package"),
  registryType: Schema.Literals(["npm", "pypi", "nuget", "oci"]),
  identifier: entryText,
  version: exactVersion,
  runtimeHint: Schema.optionalKey(entryText),
  runtimeArguments: argumentList,
  packageArguments: argumentList,
  transport: Schema.Literal("stdio"),
});

const remoteLaunch = Schema.Struct({
  type: Schema.Literal("remote"),
  transport: Schema.Literals(["streamable-http", "sse"]),
  url: httpsUrl,
  headers: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        name: entryText.check(Schema.isPattern(/^[A-Za-z0-9-]+$/u)),
        value: entryText,
      }),
    ),
  ),
});

const commandLaunch = Schema.Struct({
  type: Schema.Literal("command"),
  command: entryText,
  args: argumentList,
});

// ADR 0008: an input declares a name, never a value; a secret reaches Agents as an env var.
const input = Schema.Struct({
  name: entryText,
  kind: Schema.Literals(["env", "variable"]),
  description: Schema.optionalKey(entryText),
  required: Schema.optionalKey(Schema.Boolean),
  secret: Schema.optionalKey(Schema.Boolean),
  format: Schema.optionalKey(Schema.Literals(["string", "number", "boolean", "filepath"])),
  default: Schema.optionalKey(entryText),
  choices: Schema.optionalKey(Schema.Array(entryText)),
  env: Schema.optionalKey(entryText.check(Schema.isPattern(/^[A-Za-z_][A-Za-z0-9_]*$/u))),
});

const origin = Schema.Struct({ registry: httpsUrl, name: entryText, version: entryText });

// Best-effort: well-known token shapes and a literal Bearer credential.
const SECRET_PATTERNS = [
  /\bgh[pousr]_[A-Za-z0-9]{20,}/u,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/u,
  /\bsk-[A-Za-z0-9_-]{20,}/u,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/u,
  /\bAKIA[0-9A-Z]{16}\b/u,
  /\bAIza[0-9A-Za-z_-]{30,}/u,
  /\bBearer\s+(?!\{)\S+/iu,
];
const SECRET_HEADER = /authorization|api[-_]?key|token|secret/iu;

type Path = ReadonlyArray<PropertyKey>;

// ADR 0008: values are never stored, so scan every stored string for a literal secret.
const literalSecrets = (entry: Fields): Array<{ path: Path; issue: string }> => {
  const found: Array<{ path: Path; issue: string }> = [];
  const check = (path: Path, text: string) => {
    if (SECRET_PATTERNS.some((pattern) => pattern.test(text)))
      found.push({
        path,
        issue: "Looks like a literal secret; declare an input and use {name} instead",
      });
  };
  const { launch } = entry;
  const lists: Array<[string, ReadonlyArray<string> | undefined]> =
    launch.type === "package"
      ? [
          ["runtimeArguments", launch.runtimeArguments],
          ["packageArguments", launch.packageArguments],
        ]
      : launch.type === "command"
        ? [["args", launch.args]]
        : [];
  for (const [key, list] of lists)
    for (const [index, text] of (list ?? []).entries()) check(["launch", key, index], text);
  if (launch.type === "remote") {
    check(["launch", "url"], launch.url);
    for (const [index, header] of (launch.headers ?? []).entries()) {
      check(["launch", "headers", index, "value"], header.value);
      if (SECRET_HEADER.test(header.name) && !/\{[^}]+\}/u.test(header.value))
        found.push({
          path: ["launch", "headers", index, "value"],
          issue: "Looks like a literal secret; declare an input and use {name} instead",
        });
    }
  }
  for (const [index, declared] of (entry.inputs ?? []).entries()) {
    if (declared.default === undefined) continue;
    if (declared.secret === true)
      found.push({
        path: ["inputs", index, "default"],
        issue: "A secret input cannot have a default",
      });
    else check(["inputs", index, "default"], declared.default);
  }
  return found;
};

const fields = Schema.Struct({
  name: mcpName,
  launch: Schema.Union([packageLaunch, remoteLaunch, commandLaunch]),
  inputs: Schema.optionalKey(Schema.Array(input)),
  origin: Schema.optionalKey(origin),
});
type Fields = typeof fields.Type;

export const McpEntry = fields.check(Schema.makeFilter((entry) => literalSecrets(entry)[0]));
export type McpEntry = typeof McpEntry.Type;

// Issue #40: display forms of how each package type is started; install builds the real command.
const PACKAGE_RUNNERS = {
  npm: "npx",
  pypi: "uvx",
  nuget: "dnx",
  oci: "docker run -i --rm",
} as const;

export const mcpKind = (entry: McpEntry) => (entry.origin ? "registry" : "manual");

export const describeMcpLaunch = ({ launch }: McpEntry): string => {
  switch (launch.type) {
    case "remote":
      return launch.url;
    case "command":
      return [launch.command, ...(launch.args ?? [])].join(" ");
    case "package": {
      const target =
        launch.registryType === "oci"
          ? launch.identifier
          : `${launch.identifier}${launch.registryType === "pypi" ? "==" : "@"}${launch.version}`;
      return [
        launch.runtimeHint ?? PACKAGE_RUNNERS[launch.registryType],
        ...(launch.runtimeArguments ?? []),
        target,
        ...(launch.packageArguments ?? []),
      ].join(" ");
    }
  }
};
