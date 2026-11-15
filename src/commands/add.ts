import { Console, Effect, FileSystem, Option, Stdio } from "effect";
import { Argument, Command, Flag, Prompt } from "effect/cli";
import { CliMessageError as AddError, missingSkillsMessage } from "../errors.ts";
import { cancelOnQuit } from "../prompts/cancel.ts";
import { searchMultiSelect } from "../prompts/search.ts";
import { root } from "../root.ts";
import { readSkillset, SCHEMA_URL, SkillsetFileError, writeSkillset } from "../skillset-file.ts";
import type { Skillset } from "../skillset-file.ts";
import { parseSource } from "../source.ts";
import { Upstream } from "../upstream.ts";

export { AddError };

// Spec #11: add and install share Source resolution, conflicts, and Pin refresh.
export const prepareAddition = Effect.fn("prepareAddition")(function* (
  input: string,
  set: string,
  {
    selected,
    all,
    list,
    interactive,
  }: {
    readonly selected: ReadonlyArray<string>;
    readonly all: boolean;
    readonly list: boolean;
    readonly interactive: boolean;
  },
) {
  const parsed = parseSource(input);
  if ("error" in parsed) return yield* new AddError({ message: parsed.error });
  const upstream = yield* Upstream;
  const commit = yield* upstream.resolveCommit(parsed.remote, parsed.ref, parsed.treeRefs);
  const available = yield* upstream.listSkills(parsed.remote, commit);
  const skills = available.map((skill) => skill.name);
  // Spec #11: an empty Source cannot be added or selected interactively.
  if (!list && skills.length === 0)
    return yield* new AddError({ message: `No skills found in ${input} at ${commit}` });
  // Spec #1, Source parsing: -s or --all overrides an implied tree-path selection.
  let selection: ReadonlyArray<string> =
    selected.length > 0 ? selected : !all && parsed.skill ? [parsed.skill] : [];
  if (list || (!interactive && !all && selection.length === 0)) {
    for (const skill of skills) yield* Console.log(skill);
    yield* Console.log("Use -s to select skills or --all to add every skill.");
    return;
  }
  if (!all && selection.length === 0) {
    selection = yield* cancelOnQuit(
      searchMultiSelect({
        message: "Which skills?",
        choices: available.map((skill) => ({
          title: skill.name,
          value: skill.name,
          description: skill.description,
        })),
      }),
    );
    if (selection.length === 0) return;
  }
  // Spec #1, User Story 14: reject absent skills before writing anything.
  const missing = selection.filter((name) => !skills.includes(name));
  if (missing.length > 0)
    return yield* new AddError({
      message: missingSkillsMessage(commit, missing),
    });
  const fs = yield* FileSystem.FileSystem;
  // Spec #11: adding Entries creates a missing Skillset file.
  const exists = yield* fs.exists(set).pipe(
    Effect.mapError(
      (error) =>
        new SkillsetFileError({
          message: `Cannot read Skillset file ${set}: ${error.message}`,
        }),
    ),
  );
  const skillset: Skillset = exists
    ? yield* readSkillset(set)
    : { $schema: SCHEMA_URL, skills: [] };
  // Spec #1, User Story 16: re-adding an Entry from the same Source moves its Pin.
  // Spec #1, User Story 4: --all selects every skill at the resolved commit.
  const names = new Set(all ? skills : selection);
  // Spec #1, User Story 15: a name from a different Source must never be overwritten.
  const conflict = skillset.skills.find(
    (entry) => names.has(entry.name) && entry.source !== parsed.stored,
  );
  if (conflict)
    return yield* new AddError({
      message: `Skill ${conflict.name} already belongs to ${conflict.source}`,
    });
  const added = Array.from(names, (name) => ({ name, source: parsed.stored, commit }));
  return {
    added,
    skillset: {
      ...skillset,
      skills: [...skillset.skills.filter((entry) => !names.has(entry.name)), ...added],
    },
  };
});

// Spec #1, add: list skills without changing the Skillset when no selection is given.
export const add = Command.make(
  "add",
  {
    source: Argument.String("source").pipe(Argument.optional),
    selected: Flag.String("skill").pipe(Flag.withAlias("s"), Flag.atLeast(0)),
    all: Flag.Boolean("all").pipe(Flag.withDefault(false)),
    list: Flag.Boolean("list").pipe(Flag.withAlias("l"), Flag.withDefault(false)),
    yes: Flag.Boolean("yes").pipe(Flag.withAlias("y"), Flag.withDefault(false)),
  },
  Effect.fn(function* ({ source, selected, all, list, yes }) {
    const interactive = !yes && (yield* Stdio.Stdio.use((stdio) => stdio.stdinIsTerminal));
    if (Option.isNone(source) && !interactive)
      return yield* new AddError({ message: "Usage: skillset add <source>" });
    const input = Option.isSome(source)
      ? source.value
      : yield* cancelOnQuit(Prompt.String({ message: "Source?" }));
    const { set } = yield* root;
    const addition = yield* prepareAddition(input, set, { selected, all, list, interactive });
    if (addition) yield* writeSkillset(set, addition.skillset);
  }),
).pipe(Command.withDescription("Add skills from a Source"));
