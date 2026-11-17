import { Context, Effect, FileSystem, Option } from "effect";
import { CliMessageError } from "./errors.ts";
import { root } from "./root.ts";
import { cannotReadSkillset, readSkillset, SCHEMA_URL, writeSkillset } from "./skillset-file.ts";
import type { Entry, Skillset } from "./skillset-file.ts";
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
  },
  env: Env,
) {
  const { set, positional, missing, install } = options;
  if (positional !== undefined && Option.isSome(set))
    return yield* new CliMessageError({
      message: `"${positional}" cannot be combined with --set.`,
    });
  const reference = positional ?? Option.getOrUndefined(set) ?? DEFAULT_SKILLSET_PATH;
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
    : { $schema: SCHEMA_URL, skills: [] };
  return { path, skillset, save: (next: Skillset) => writeSkillset(path, next) };
});

export const openCommandSkillset = Effect.fn("openCommandSkillset")(function* (options: {
  readonly positional?: string;
  readonly missing: "create" | "fail";
  readonly install?: boolean;
}) {
  const { set } = yield* root;
  const env = yield* SkillsetEnvironment;
  return yield* openSkillset({ ...options, set }, env);
});

export const listCommandUserSkillsets = Effect.gen(function* () {
  const { set } = yield* root;
  if (Option.isSome(set))
    return yield* new CliMessageError({ message: "--user cannot be used with --set." });
  const env = yield* SkillsetEnvironment;
  return yield* listUserSkillsets(env);
});

export const selectEntries = (skillset: Skillset, names: ReadonlyArray<string>) => ({
  entries:
    names.length === 0
      ? skillset.skills
      : skillset.skills.filter((entry) => names.includes(entry.name)),
  unknown: names.filter((name) => !skillset.skills.some((entry) => entry.name === name)),
});

export const isEmpty = (skillset: Skillset) => skillset.skills.length === 0;

export const unknownNamesMessage = (names: ReadonlyArray<string>) =>
  `Unknown skills: ${names.join(", ")}`;

export const upsertEntries = (skillset: Skillset, added: ReadonlyArray<Entry>) => {
  const conflict = skillset.skills.find((entry) =>
    added.some((next) => next.name === entry.name && next.source !== entry.source),
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
      ...skillset.skills.filter((entry) => !added.some((next) => next.name === entry.name)),
      ...added,
    ],
  });
};

export const removeEntries = (skillset: Skillset, names: ReadonlyArray<string>): Skillset => ({
  ...skillset,
  skills: skillset.skills.filter((entry) => !names.includes(entry.name)),
});

export const movePin = (skillset: Skillset, name: string, commit: string): Skillset => ({
  ...skillset,
  skills: skillset.skills.map((entry) => (entry.name === name ? { ...entry, commit } : entry)),
});
