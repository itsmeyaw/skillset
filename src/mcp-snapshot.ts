import { Effect } from "effect";
import { CliMessageError } from "./errors.ts";
import { type McpEntry, ociVersion } from "./mcp-entry.ts";
import { defaultEnvVarName } from "./mcp-inputs.ts";
import type {
  RegistryInput,
  RegistryPackage,
  RegistryRemote,
  RegistryServer,
  RegistryVariable,
} from "./registry.ts";

type Input = NonNullable<McpEntry["inputs"]>[number];

// Spec #37, User Story 11: a server offers packages and remotes; the curator keeps exactly one.
export type LaunchChoice =
  | { readonly kind: "package"; readonly package: RegistryPackage }
  | { readonly kind: "remote"; readonly remote: RegistryRemote };

// Spec #37, User Story 12: the first package wins, then the first remote.
export const launchChoices = (server: RegistryServer): ReadonlyArray<LaunchChoice> => [
  ...(server.packages ?? []).map((pkg) => ({ kind: "package" as const, package: pkg })),
  ...(server.remotes ?? []).map((remote) => ({ kind: "remote" as const, remote })),
];

// Spec #37, User Story 18: the default name is the part after the last "/".
export const defaultEntryName = (serverName: string) =>
  serverName.slice(serverName.lastIndexOf("/") + 1);

// ADR 0006: cargo has no runner and mcpb needs unpacking executables, so only these four are kept.
// shortcut: cargo, mcpb and unknown package types are rejected, store such a server by hand or choose a remote.
const SUPPORTED_PACKAGES: ReadonlyArray<string> = ["npm", "pypi", "nuget", "oci"];

const FORMATS: ReadonlyArray<string> = ["string", "number", "boolean", "filepath"];

class Unsupported extends Error {}

// ADR 0008: keep the declaration of an input, never a value; a secret `{var}` gets its default env var name.
const declaration = (
  entryName: string,
  kind: Input["kind"],
  name: string,
  from: RegistryVariable,
): Input => ({
  name,
  kind,
  ...(from.description ? { description: from.description } : {}),
  ...(from.isRequired ? { required: true } : {}),
  ...(from.isSecret ? { secret: true } : {}),
  ...(from.format !== undefined && FORMATS.includes(from.format)
    ? { format: from.format as NonNullable<Input["format"]> }
    : {}),
  ...(!from.isSecret && from.default ? { default: from.default } : {}),
  ...(from.choices?.length ? { choices: from.choices } : {}),
  ...(from.isSecret && kind === "variable" ? { env: defaultEnvVarName(entryName, name) } : {}),
});

// ADR 0006: arguments become token lists; each `{var}` template stays and its variable becomes an input.
// shortcut: isRepeated arguments appear once, add more tokens in the Skillset file by hand.
const argumentTokens = (
  argument: RegistryInput,
  declare: (name: string, from: RegistryVariable) => void,
): ReadonlyArray<string> => {
  const named = argument.type === "named";
  if (!named && argument.type !== "positional")
    throw new Unsupported(`Unsupported argument type "${argument.type}".`);
  if (named && !argument.name) throw new Unsupported("A named argument has no name.");
  let value = argument.value;
  if (value === undefined) {
    // A flag without a value is on only when the server needs it.
    if (named && argument.format === "boolean")
      return argument.isRequired || argument.default === "true" ? [argument.name!] : [];
    if (!argument.isRequired && argument.default === undefined) return [];
    const hint = named ? argument.name!.replace(/^-+/u, "") : argument.valueHint;
    if (!hint) throw new Unsupported("A positional argument has neither a value nor a hint.");
    declare(hint, argument);
    value = `{${hint}}`;
  } else for (const [name, from] of Object.entries(argument.variables ?? {})) declare(name, from);
  return named ? [argument.name!, value] : [value];
};

// ADR 0008: two declarations of one input merge conservatively, so a secret is never downgraded
// (and then keeps no default) and a required input stays required. Other fields: the first wins.
// shortcut: a clash between two arguments is merged silently, report it when it confuses curators.
const collectInputs = (entryName: string) => {
  const declared = new Map<string, { kind: Input["kind"]; from: RegistryVariable }>();
  const declare = (kind: Input["kind"]) => (name: string, from: RegistryVariable) => {
    const first = declared.get(name);
    declared.set(
      name,
      first === undefined
        ? { kind, from }
        : {
            kind: first.kind,
            from: {
              ...first.from,
              isSecret: first.from.isSecret || from.isSecret,
              isRequired: first.from.isRequired || from.isRequired,
            },
          },
    );
  };
  const inputs = () =>
    [...declared].map(([name, { kind, from }]) => declaration(entryName, kind, name, from));
  return { inputs, declare };
};

const withInputs = (inputs: ReadonlyArray<Input>) => (inputs.length > 0 ? { inputs } : {});

const packageEntry = (
  pkg: RegistryPackage,
  entryName: string,
): Pick<McpEntry, "launch" | "inputs"> => {
  if (!SUPPORTED_PACKAGES.includes(pkg.registryType))
    throw new Unsupported(
      `Package type "${pkg.registryType}" is not supported; choose a remote or a package of type ${SUPPORTED_PACKAGES.join(", ")}.`,
    );
  if (pkg.transport !== undefined && pkg.transport.type !== "stdio")
    throw new Unsupported(`Package transport "${pkg.transport.type}" is not supported.`);
  const version = pkg.version ?? (pkg.registryType === "oci" ? ociVersion(pkg.identifier) : "");
  if (!version || version === "latest")
    throw new Unsupported(`Package ${pkg.identifier} names no exact version.`);
  const { inputs, declare } = collectInputs(entryName);
  const tokens = (arguments_: ReadonlyArray<RegistryInput> | null | undefined) =>
    (arguments_ ?? []).flatMap((argument) => argumentTokens(argument, declare("variable")));
  const runtimeArguments = tokens(pkg.runtimeArguments);
  const packageArguments = tokens(pkg.packageArguments);
  for (const env of pkg.environmentVariables ?? []) {
    if (!env.name) throw new Unsupported("An environment variable has no name.");
    // shortcut: an env value with a {var} template is rejected, store such a server by hand.
    if (env.value !== undefined && /\{[^{}]+\}/u.test(env.value))
      throw new Unsupported(`Environment variable ${env.name} uses a templated value.`);
    declare("env")(
      env.name,
      env.value !== undefined && !env.isSecret ? { ...env, default: env.value } : env,
    );
    // A container sees only the variables docker is told to pass on.
    if (pkg.registryType === "oci") runtimeArguments.push("-e", env.name);
  }
  // dnx takes its options after the package and the package's own arguments after "--".
  // https://github.com/modelcontextprotocol/registry/blob/main/docs/reference/server-json/generic-server-json.md
  const launchArguments =
    pkg.registryType === "nuget"
      ? ["--yes", ...(packageArguments.length > 0 ? ["--", ...packageArguments] : [])]
      : packageArguments;
  return {
    launch: {
      type: "package",
      registryType: pkg.registryType as "npm" | "pypi" | "nuget" | "oci",
      identifier: pkg.identifier,
      version,
      ...(pkg.runtimeHint ? { runtimeHint: pkg.runtimeHint } : {}),
      ...(runtimeArguments.length > 0 ? { runtimeArguments } : {}),
      ...(launchArguments.length > 0 ? { packageArguments: launchArguments } : {}),
      transport: "stdio",
    },
    ...withInputs(inputs()),
  };
};

// A header without a value takes its value from an input named after the header.
const remoteEntry = (
  remote: RegistryRemote,
  entryName: string,
): Pick<McpEntry, "launch" | "inputs"> => {
  if (remote.type !== "streamable-http" && remote.type !== "sse")
    throw new Unsupported(`Remote transport "${remote.type}" is not supported.`);
  if (!remote.url.startsWith("https://"))
    throw new Unsupported(`Remote URL ${remote.url} must start with https://.`);
  const { inputs, declare } = collectInputs(entryName);
  const variable = declare("variable");
  for (const [name, from] of Object.entries(remote.variables ?? {})) variable(name, from);
  const headers = (remote.headers ?? []).map((header) => {
    if (!header.name) throw new Unsupported("A header has no name.");
    if (header.value === undefined) variable(header.name, header);
    else for (const [name, from] of Object.entries(header.variables ?? {})) variable(name, from);
    return { name: header.name, value: header.value ?? `{${header.name}}` };
  });
  return {
    launch: {
      type: "remote",
      transport: remote.type,
      url: remote.url,
      ...(headers.length > 0 ? { headers } : {}),
    },
    ...withInputs(inputs()),
  };
};

// Spec #37, Modules: a pure snapshot of one chosen launch option, plus the Registry origin.
export const snapshotRegistryEntry = (input: {
  readonly registry: string;
  readonly server: RegistryServer;
  readonly choice: LaunchChoice;
  readonly name: string;
}) =>
  Effect.try({
    try: (): McpEntry => {
      return {
        name: input.name,
        ...(input.choice.kind === "remote"
          ? remoteEntry(input.choice.remote, input.name)
          : packageEntry(input.choice.package, input.name)),
        origin: {
          registry: input.registry,
          name: input.server.name,
          version: input.server.version,
        },
      };
    },
    catch: (error) =>
      new CliMessageError({
        message: error instanceof Unsupported ? error.message : String(error),
      }),
  });
