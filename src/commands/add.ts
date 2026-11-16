import { Console, Effect, Option } from "effect";
import { Argument, Command, Flag, Prompt } from "effect/cli";
import { prepareAddition } from "../addition.ts";
import { CliMessageError as AddError } from "../errors.ts";
import { cancelOnQuit } from "../prompts/cancel.ts";
import { isInteractive } from "../prompts/interactive.ts";
import { skillsetPath } from "../root.ts";
import { writeSkillset } from "../skillset-file.ts";
import type { Entry, Skillset } from "../skillset-file.ts";
import { installSkillset } from "./install.ts";

export { AddError };

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
    const interactive = yield* isInteractive(yes);
    if (Option.isNone(source) && !interactive)
      return yield* new AddError({ message: "Usage: skillset add <source>" });
    let input = Option.isSome(source)
      ? source.value
      : yield* cancelOnQuit(Prompt.String({ message: "Source?" }));
    const set = yield* skillsetPath;
    let first = true;
    let pending: Skillset | undefined;
    let lastError: Effect.Error<ReturnType<typeof prepareAddition>> | undefined;
    const additions: Array<ReadonlyArray<Entry>> = [];
    for (;;) {
      // -s/--all/-l describe the first Source only; later Sources are chosen interactively.
      const result = yield* prepareAddition(
        input,
        set,
        first
          ? { selected, all, list, interactive }
          : { selected: [], all: false, list: false, interactive, base: pending },
      ).pipe(Effect.result);
      first = false;
      // Interactive add recovery spec: only typed failures permit another Source.
      if (result._tag === "Failure") {
        if (!interactive) return yield* result.failure;
        lastError = result.failure;
        yield* Console.error(`Warning: ${lastError.message}`);
      } else {
        const addition = result.success;
        if (addition._tag !== "Addition") break;
        pending = addition.skillset;
        additions.push(addition.added);
      }
      // Interactive add repeats Source selection until the user is done.
      if (
        !interactive ||
        !(yield* cancelOnQuit(
          Prompt.Confirm({ message: "Add another source?", initial: result._tag === "Failure" }),
        ))
      )
        break;
      input = yield* cancelOnQuit(Prompt.String({ message: "Source?" }));
    }
    // Interactive add recovery spec: write successful rounds once, or fail with the last error.
    if (!pending && lastError) return yield* lastError;
    if (pending) {
      yield* writeSkillset(set, pending);
      for (const added of additions)
        yield* Console.log(`Added ${added.map((entry) => entry.name).join(", ")} to ${set}`);
    }
    // Issue #11: offer to Install the Skillset only in an interactive terminal.
    if (
      pending &&
      interactive &&
      (yield* cancelOnQuit(Prompt.Confirm({ message: "Install skillset?", initial: false })))
    )
      yield* installSkillset(set, {
        selected: [],
        agents: [],
        global: false,
        copy: false,
        yes: false,
      });
  }),
).pipe(Command.withDescription("Add skills from a Source"));
