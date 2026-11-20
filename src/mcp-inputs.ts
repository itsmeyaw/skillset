import type { McpEntry } from "./mcp-entry.ts";

// ADR 0008: an input is either a literal or a reference to an env var the user sets.
export type InputValue = { readonly literal: string } | { readonly envVar: string };

type Input = NonNullable<McpEntry["inputs"]>[number];

// Typed answers to input prompts: entry name, then input name.
export type McpAnswers = Readonly<Record<string, Readonly<Record<string, string>>>>;

// ADR 0008: only a non-secret input without a default is asked for.
export const promptableInputs = (entry: McpEntry): ReadonlyArray<Input> =>
  (entry.inputs ?? []).filter((input) => input.secret !== true && input.default === undefined);

export type ResolvedMcp = {
  readonly entry: McpEntry;
  // Undefined: an optional input without a value.
  readonly values: Readonly<Record<string, InputValue | undefined>>;
};

// ADR 0008: a secret `{var}` defaults to <ENTRY>_<VAR> in upper snake case; an env input keeps its name.
export const defaultEnvVarName = (entryName: string, inputName: string) => {
  const name = `${entryName}_${inputName}`.replace(/[^A-Za-z0-9]+/gu, "_").toUpperCase();
  return /^\d/u.test(name) ? `_${name}` : name;
};

const envVarName = (entry: McpEntry, input: Input) =>
  input.kind === "env" ? input.name : (input.env ?? defaultEnvVarName(entry.name, input.name));

// ADR 0008: secrets are never prompted or written; a required input without a value is a reference.
export const resolveMcp = (
  entry: McpEntry,
  answers: Readonly<Record<string, string>> = {},
): ResolvedMcp => {
  const values: Record<string, InputValue | undefined> = {};
  for (const input of entry.inputs ?? []) {
    const typed = input.secret === true ? undefined : answers[input.name];
    values[input.name] =
      typed !== undefined
        ? { literal: typed }
        : input.secret !== true && input.default !== undefined
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
