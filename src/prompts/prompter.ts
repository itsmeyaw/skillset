import { Console, Effect, Stdio, type FileSystem, type Path, type Terminal } from "effect";
import { Prompt } from "effect/cli";
import { CliMessageError } from "../errors.ts";
import type { InstallPlan } from "../install-types.ts";
import { cancelOnQuit } from "./cancel.ts";
import { searchMultiSelect, type SearchChoice } from "./search.ts";

type Answer<A> = Effect.Effect<
  A,
  CliMessageError,
  FileSystem.FileSystem | Path.Path | Terminal.Terminal
>;

export type Prompter = {
  // Undefined means unattended selection was unavailable; an empty array means nothing was chosen.
  readonly skills: (
    choices: ReadonlyArray<SearchChoice>,
  ) => Answer<ReadonlyArray<string> | undefined>;
  readonly requiredSkills: (choices: ReadonlyArray<SearchChoice>) => Answer<ReadonlyArray<string>>;
  readonly agents: (
    choices: ReadonlyArray<SearchChoice>,
    defaults: ReadonlyArray<string>,
    supported: boolean,
  ) => Answer<ReadonlyArray<string> | undefined>;
  readonly scope: () => Answer<"project" | "global">;
  readonly mode: () => Answer<"auto" | "symlink" | "copy">;
  readonly confirmPlan: (plan: InstallPlan) => Answer<boolean>;
  readonly source: () => Answer<string>;
  readonly ensureRemoveInput: () => Answer<void>;
  readonly anotherSource: (failure?: CliMessageError) => Answer<boolean>;
  readonly confirmInstall: () => Answer<boolean>;
};

const unattended: Prompter = {
  skills: () => Effect.undefined,
  requiredSkills: (choices) => Effect.succeed(choices.map((choice) => choice.value)),
  agents: (_choices, defaults) => Effect.succeed(defaults.length > 0 ? defaults : undefined),
  scope: () => Effect.succeed("project"),
  mode: () => Effect.succeed("auto"),
  confirmPlan: () => Effect.succeed(true),
  source: () => Effect.fail(new CliMessageError({ message: "Usage: skillset add <source>" })),
  ensureRemoveInput: () =>
    Effect.fail(new CliMessageError({ message: "Usage: skillset remove [skills...] [--all]" })),
  anotherSource: () => Effect.succeed(false),
  confirmInstall: () => Effect.succeed(false),
};

const tty: Prompter = {
  skills: (choices) => cancelOnQuit(searchMultiSelect({ message: "Which skills?", choices })),
  requiredSkills: (choices) =>
    cancelOnQuit(searchMultiSelect({ message: "Which skills?", choices, min: 1 })),
  agents: (choices, _defaults, supported) =>
    !supported
      ? Effect.fail(new CliMessageError({ message: "No supported agents available" }))
      : cancelOnQuit(searchMultiSelect({ message: "Which agents?", choices, min: 1 })),
  scope: () =>
    cancelOnQuit(
      Prompt.Select({
        message: "Installation scope?",
        choices: [
          { title: "Project", value: "project" as const },
          { title: "Global", value: "global" as const },
        ],
      }),
    ),
  mode: () =>
    cancelOnQuit(
      Prompt.Select({
        message: "Installation mode?",
        choices: [
          { title: "Symlink", value: "symlink" as const },
          { title: "Copy", value: "copy" as const },
        ],
      }),
    ),
  confirmPlan: (plan) =>
    Effect.gen(function* () {
      yield* Console.log(
        `Skills:\n${plan.entries.map((entry) => `  ${entry.name} (${entry.source}@${entry.commit})`).join(",\n")}\n` +
          `Agents: ${plan.agents?.join(", ") ?? "default"}\n` +
          `Scope: ${plan.scope}\nMode: ${plan.mode}`,
      );
      return yield* cancelOnQuit(
        Prompt.Confirm({ message: "Proceed with installation?", initial: true }),
      );
    }),
  source: () => cancelOnQuit(Prompt.String({ message: "Source?" })),
  ensureRemoveInput: () => Effect.void,
  anotherSource: (failure) =>
    Effect.gen(function* () {
      if (failure) yield* Console.error(`Warning: ${failure.message}`);
      return yield* cancelOnQuit(
        Prompt.Confirm({ message: "Add another source?", initial: failure !== undefined }),
      );
    }),
  confirmInstall: () =>
    cancelOnQuit(Prompt.Confirm({ message: "Install skillset?", initial: false })),
};

// Issue #11: only the adapter decides whether prompts can run.
export const makePrompter = (yes: boolean) =>
  yes
    ? Effect.succeed(unattended)
    : Stdio.Stdio.use((stdio) =>
        Effect.map(stdio.stdinIsTerminal, (isTTY) => (isTTY ? tty : unattended)),
      );
