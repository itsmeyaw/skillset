import { Context, Effect, FileSystem, Option } from "effect";
import { CliMessageError } from "./errors.ts";
import { root } from "./root.ts";
import {
  fetchSkillset,
  isHttpUrl,
  isRemoteSkillset,
  rejectRemoteSkillset,
  RemoteFetch,
} from "./remote-skillset.ts";
import { cannotReadSkillset, readSkillset, SCHEMA_URL, writeSkillset } from "./skillset-file.ts";
import type { McpEntry } from "./mcp-entry.ts";
import type { SkillEntry, Skillset } from "./skillset-file.ts";
import { DEFAULT_SKILLSET_PATH, listUserSkillsets, resolveSet, userDir } from "./user-skillset.ts";
import type { Env } from "./user-skillset.ts";

export class SkillsetEnvironment extends Context.Service<SkillsetEnvironment, Env>()(
  "skillset/Environment",
) {}

export const openSkillset = Effect.fn("openSkillset")(function* (
  options: {
    readonly set: Option.Option<string>;
    readonly positional?: string;
    readonly missing: "create" | "fail";
    readonly install?: boolean;
    readonly allowRemote?: boolean;
  },
  env: Env,
  fetchRemote: typeof fetch = fetch,
) {
  const { set, positional, missing, install, allowRemote } = options;
  if (positional !== undefined && Option.isSome(set))
    return yield* new CliMessageError({
      message: `"${positional}" cannot be combined with --set.`,
    });
  const reference = positional ?? Option.getOrUndefined(set) ?? DEFAULT_SKILLSET_PATH;
  if (isRemoteSkillset(reference)) {
    if (!install && !allowRemote) return yield* rejectRemoteSkillset();
    const skillset = yield* fetchSkillset(reference, fetchRemote);
    return {
      path: reference,
      skillset,
      remote: true,
      save: () => Effect.fail(rejectRemoteSkillset()),
    };
  }
  if (isHttpUrl(reference))
    return yield* new CliMessageError({ message: "Skillset URLs must use HTTPS." });
  const hint = install ? ". To install a skill, use `skillset add`." : "";
  const missingMessage = (location: string) =>
    `Cannot find Skillset "${reference}" in ${location}${hint}`;
  const path = yield* resolveSet(
    Option.fromNullishOr(positional ?? Option.getOrUndefined(set)),
    env,
  ).pipe(
    Effect.mapError((error) =>
      positional === undefined
        ? error
        : new CliMessageError({ message: missingMessage(userDir(env)) }),
    ),
  );
  const fs = yield* FileSystem.FileSystem;
  const exists = yield* fs.exists(path).pipe(Effect.mapError(cannotReadSkillset(path)));
  if (!exists && missing === "fail")
    return yield* new CliMessageError({ message: missingMessage(path) });
  const skillset: Skillset = exists
    ? yield* readSkillset(path)
    : { $schema: SCHEMA_URL, skills: [], mcp: [] };
  return { path, skillset, remote: false, save: (next: Skillset) => writeSkillset(path, next) };
});

export const openCommandSkillset = Effect.fn("openCommandSkillset")(function* (options: {
  readonly positional?: string;
  readonly missing: "create" | "fail";
  readonly install?: boolean;
  readonly allowRemote?: boolean;
}) {
  const { set } = yield* root;
  const env = yield* SkillsetEnvironment;
  const fetchRemote = yield* RemoteFetch;
  return yield* openSkillset({ ...options, set }, env, fetchRemote);
});

export const listCommandUserSkillsets = Effect.gen(function* () {
  const { set } = yield* root;
  if (Option.isSome(set))
    return yield* new CliMessageError({ message: "--user cannot be used with --set." });
  const env = yield* SkillsetEnvironment;
  return yield* listUserSkillsets(env);
});

export const selectSkillEntries = (skillset: Skillset, names: ReadonlyArray<string>) => ({
  skillEntries:
    names.length === 0
      ? skillset.skills
      : skillset.skills.filter((skillEntry) => names.includes(skillEntry.name)),
  unknown: names.filter((name) => !skillset.skills.some((skillEntry) => skillEntry.name === name)),
});

export const hasSkillEntries = (skillset: Skillset) => skillset.skills.length > 0;

export const isEmpty = (skillset: Skillset) =>
  !hasSkillEntries(skillset) && skillset.mcp.length === 0;

export const unknownNamesMessage = (names: ReadonlyArray<string>) =>
  `Unknown skills: ${names.join(", ")}`;

// Spec #37, User Story 87: an invalid selection lists what exists.
export const unknownMcpNamesMessage = (skillset: Skillset, names: ReadonlyArray<string>) =>
  `Unknown MCP servers: ${names.join(", ")} (available: ${skillset.mcp.map((mcpEntry) => mcpEntry.name).join(", ") || "none"})`;

export const upsertSkillEntries = (skillset: Skillset, added: ReadonlyArray<SkillEntry>) => {
  const conflict = skillset.skills.find((skillEntry) =>
    added.some((next) => next.name === skillEntry.name && next.source !== skillEntry.source),
  );
  if (conflict)
    return Effect.fail(
      new CliMessageError({
        message: `Skill ${conflict.name} already belongs to ${conflict.source}`,
      }),
    );
  return Effect.succeed({
    ...skillset,
    skills: [
      ...skillset.skills.filter(
        (skillEntry) => !added.some((next) => next.name === skillEntry.name),
      ),
      ...added,
    ],
  });
};

export const removeSkillEntries = (skillset: Skillset, names: ReadonlyArray<string>): Skillset => ({
  ...skillset,
  skills: skillset.skills.filter((skillEntry) => !names.includes(skillEntry.name)),
});

export const movePin = (skillset: Skillset, name: string, commit: string): Skillset => ({
  ...skillset,
  skills: skillset.skills.map((skillEntry) =>
    skillEntry.name === name ? { ...skillEntry, commit } : skillEntry,
  ),
});

// ADR 0006: names are unique within the mcp array only, so a skill may share a name.
export const addMcpEntry = (skillset: Skillset, added: McpEntry) =>
  skillset.mcp.some((mcpEntry) => mcpEntry.name === added.name)
    ? Effect.fail(new CliMessageError({ message: `MCP server ${added.name} already exists` }))
    : Effect.succeed({ ...skillset, mcp: [...skillset.mcp, added] });

export const replaceMcpEntry = (skillset: Skillset, next: McpEntry): Skillset => ({
  ...skillset,
  mcp: skillset.mcp.map((mcpEntry) => (mcpEntry.name === next.name ? next : mcpEntry)),
});

export const removeMcpEntries = (skillset: Skillset, names: ReadonlyArray<string>): Skillset => ({
  ...skillset,
  mcp: skillset.mcp.filter((mcpEntry) => !names.includes(mcpEntry.name)),
});

export const selectMcpEntries = (skillset: Skillset, names: ReadonlyArray<string>) => {
  const mcpEntries = skillset.mcp;
  return {
    mcpEntries:
      names.length === 0
        ? mcpEntries
        : mcpEntries.filter((mcpEntry) => names.includes(mcpEntry.name)),
    unknown: names.filter((name) => !mcpEntries.some((mcpEntry) => mcpEntry.name === name)),
  };
};
