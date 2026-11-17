import { Effect } from "effect";
import { CliMessageError } from "./errors.ts";
import type { Entry, Skillset } from "./skillset-file.ts";

export const selectEntries = (skillset: Skillset, names: ReadonlyArray<string>) => ({
  entries:
    names.length === 0
      ? skillset.skills
      : skillset.skills.filter((entry) => names.includes(entry.name)),
  unknown: names.filter((name) => !skillset.skills.some((entry) => entry.name === name)),
});

export const isEmpty = (skillset: Skillset) => skillset.skills.length === 0;

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
