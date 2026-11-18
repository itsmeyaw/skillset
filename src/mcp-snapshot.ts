import { Effect } from "effect";
import { CliMessageError } from "./errors.ts";
import type { McpEntry } from "./mcp-entry.ts";
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

// shortcut: only npm packages so far, #49 adds pypi, nuget and oci and remotes.
const SUPPORTED_PACKAGES: ReadonlyArray<string> = ["npm"];

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

const packageEntry = (
  pkg: RegistryPackage,
  entryName: string,
): Pick<McpEntry, "launch" | "inputs"> => {
  if (!SUPPORTED_PACKAGES.includes(pkg.registryType))
    throw new Unsupported(
      `Package type "${pkg.registryType}" is not supported yet; choose another package or a remote.`,
    );
  if (pkg.transport !== undefined && pkg.transport.type !== "stdio")
    throw new Unsupported(`Package transport "${pkg.transport.type}" is not supported.`);
  if (!pkg.version) throw new Unsupported(`Package ${pkg.identifier} names no exact version.`);
  // ADR 0008: two declarations of one input merge conservatively, so a secret is never downgraded
  // (and then keeps no default) and a required input stays required. Other fields: the first wins.
  // shortcut: a clash between two arguments is merged silently, report it when it confuses curators.
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
  }
  return {
    launch: {
      type: "package",
      registryType: pkg.registryType as "npm",
      identifier: pkg.identifier,
      version: pkg.version,
      ...(pkg.runtimeHint ? { runtimeHint: pkg.runtimeHint } : {}),
      ...(runtimeArguments.length > 0 ? { runtimeArguments } : {}),
      ...(packageArguments.length > 0 ? { packageArguments } : {}),
      transport: "stdio",
    },
    ...(declared.size > 0
      ? {
          inputs: [...declared].map(([name, { kind, from }]) =>
            declaration(entryName, kind, name, from),
          ),
        }
      : {}),
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
      if (input.choice.kind === "remote")
        throw new Unsupported("Remote servers are not supported yet; choose a package.");
      return {
        name: input.name,
        ...packageEntry(input.choice.package, input.name),
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
