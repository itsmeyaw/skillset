import type { McpEntry } from "./mcp-entry.ts";

// ADR 0008: an input is either a literal or a reference to an env var the user sets.
export type InputValue = { readonly literal: string } | { readonly envVar: string };

export type ResolvedMcp = {
  readonly entry: McpEntry;
  // Undefined: an optional input without a value.
  readonly values: Readonly<Record<string, InputValue | undefined>>;
};

// ADR 0008: a secret `{var}` defaults to <ENTRY>_<VAR> in upper snake case; an env input keeps its name.
const envVarName = (entry: McpEntry, input: NonNullable<McpEntry["inputs"]>[number]) => {
  if (input.kind === "env") return input.name;
  if (input.env !== undefined) return input.env;
  const name = `${entry.name}_${input.name}`.replace(/[^A-Za-z0-9]+/gu, "_").toUpperCase();
  return /^\d/u.test(name) ? `_${name}` : name;
};

// ADR 0008: secrets are never prompted or written; a required input without a value is a reference.
export const resolveMcp = (entry: McpEntry): ResolvedMcp => {
  const values: Record<string, InputValue | undefined> = {};
  for (const input of entry.inputs ?? []) {
    values[input.name] =
      input.secret !== true && input.default !== undefined
        ? { literal: input.default }
        : input.secret === true || input.required === true
          ? { envVar: envVarName(entry, input) }
          : undefined;
  }
  return { entry, values };
};

export const envVarsOf = ({ values }: ResolvedMcp): ReadonlyArray<string> => [
  ...new Set(
    Object.values(values).flatMap((value) => (value && "envVar" in value ? [value.envVar] : [])),
  ),
];
