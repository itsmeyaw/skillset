import { Console, Effect } from "effect";
import { CliMessageError as AddError, missingSkillsMessage } from "./errors.ts";
import { cancelOnQuit } from "./prompts/cancel.ts";
import { searchMultiSelect } from "./prompts/search.ts";
import type { Skillset } from "./skillset-file.ts";
import { upsertEntries } from "./skillset-store.ts";
import { parseSource } from "./source.ts";
import { Upstream } from "./upstream.ts";

// ADR 0003: adding resolves Sources, checks conflicts, and refreshes Pins.
export const prepareAddition = Effect.fn("prepareAddition")(function* (
  input: string,
  skillset: Skillset,
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
  // Issue #11: an empty Source cannot be added or selected interactively.
  if (!list && skills.length === 0)
    return yield* new AddError({ message: `No skills found in ${input} at ${commit}` });
  // Spec #1, Source parsing: -s or --all overrides an implied tree-path selection.
  let selection: ReadonlyArray<string> =
    selected.length > 0 ? selected : !all && parsed.skill ? [parsed.skill] : [];
  if (list || (!interactive && !all && selection.length === 0)) {
    // Issue #11: listing skills must not create or change a Skillset file.
    for (const skill of skills) yield* Console.log(skill);
    yield* Console.log("Use -s to select skills or --all to add every skill.");
    return { _tag: "NoSelection" as const };
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
    if (selection.length === 0) return { _tag: "NoSelection" as const };
  }
  // Spec #1, User Story 14: reject absent skills before writing anything.
  const missing = selection.filter((name) => !skills.includes(name));
  if (missing.length > 0)
    return yield* new AddError({
      message: missingSkillsMessage(commit, missing),
    });
  // Spec #1, User Story 16: re-adding an Entry from the same Source moves its Pin.
  // Spec #1, User Story 4: --all selects every skill at the resolved commit.
  const names = new Set(all ? skills : selection);
  const added = Array.from(names, (name) => ({ name, source: parsed.stored, commit }));
  return {
    _tag: "Addition" as const,
    added,
    skillset: yield* upsertEntries(skillset, added),
  };
});
