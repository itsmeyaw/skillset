import { Console, Effect, Stdio, type FileSystem, type Path, type Terminal } from "effect";
import { Prompt } from "effect/cli";
import type { McpConflict } from "../agents/agent.ts";
import { CliMessageError } from "../errors.ts";
import type { InstallPlan } from "../install-types.ts";
import { describeMcpLaunch, type McpEntry } from "../mcp-entry.ts";
import type { SkillEntry } from "../skillset-file.ts";
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
  readonly mcpServers: (
    choices: ReadonlyArray<SearchChoice>,
  ) => Answer<ReadonlyArray<string> | undefined>;
  // Undefined means no value was given: unattended, or an empty answer.
  readonly mcpInput: (
    entry: McpEntry,
    input: NonNullable<McpEntry["inputs"]>[number],
  ) => Answer<string | undefined>;
  // ADR 0007: a different server of the same name is overwritten only with consent.
  readonly confirmOverwrite: (conflict: McpConflict) => Answer<boolean>;
  readonly requiredSkills: (choices: ReadonlyArray<SearchChoice>) => Answer<ReadonlyArray<string>>;
  readonly agents: (
    choices: ReadonlyArray<SearchChoice>,
    defaults: ReadonlyArray<string>,
    supported: boolean,
  ) => Answer<ReadonlyArray<string> | undefined>;
  readonly scope: () => Answer<"project" | "global">;
  readonly mode: () => Answer<"auto" | "symlink" | "copy">;
  readonly confirmPlan: (plan: InstallPlan) => Answer<boolean>;
  readonly confirmRemote: (skillEntries: ReadonlyArray<SkillEntry>) => Answer<boolean>;
  readonly source: () => Answer<string>;
  readonly ensureRemoveInput: () => Answer<void>;
  readonly anotherSource: (failure?: CliMessageError) => Answer<boolean>;
  readonly confirmInstall: () => Answer<boolean>;
};

const listRemoteSkillEntries = (skillEntries: ReadonlyArray<SkillEntry>) =>
  Console.log(
    `Remote Skillset Skill Entries:\n${skillEntries.map((skillEntry) => `  ${skillEntry.name}  ${skillEntry.source}  ${skillEntry.commit.slice(0, 7)}`).join("\n")}`,
  );

const unattended: Prompter = {
  skills: () => Effect.undefined,
  mcpServers: () => Effect.undefined,
  mcpInput: () => Effect.undefined,
  confirmOverwrite: () => Effect.succeed(false),
  requiredSkills: (choices) => Effect.succeed(choices.map((choice) => choice.value)),
  agents: (_choices, defaults) => Effect.succeed(defaults.length > 0 ? defaults : undefined),
  scope: () => Effect.succeed("project"),
  mode: () => Effect.succeed("auto"),
  confirmPlan: () => Effect.succeed(true),
  confirmRemote: (skillEntries) =>
    Effect.andThen(
      listRemoteSkillEntries(skillEntries),
      Effect.fail(
        new CliMessageError({
          message: "Remote Skillsets require confirmation; use -y for unattended installs.",
        }),
      ),
    ),
  source: () => Effect.fail(new CliMessageError({ message: "Usage: skillset add <source>" })),
  ensureRemoveInput: () =>
    Effect.fail(new CliMessageError({ message: "Usage: skillset remove [skills...] [--all]" })),
  anotherSource: () => Effect.succeed(false),
  confirmInstall: () => Effect.succeed(false),
};

// ADR 0008: only -y turns a required input without a value into an env reference; without a
// terminal and without -y there is nobody to ask, so a required input is an error.
const nonInteractive: Prompter = {
  ...unattended,
  mcpInput: (entry, input) =>
    input.required === true
      ? Effect.fail(
          new CliMessageError({
            message: `MCP server ${entry.name} needs a value for ${input.name}; use -y for unattended installs.`,
          }),
        )
      : Effect.undefined,
};

const tty: Prompter = {
  skills: (choices) => cancelOnQuit(searchMultiSelect({ message: "Which skills?", choices })),
  mcpServers: (choices) =>
    cancelOnQuit(searchMultiSelect({ message: "Which MCP servers?", choices })),
  // ADR 0008: plain text prompt; secrets are never asked for.
  mcpInput: (entry, input) =>
    Effect.map(
      cancelOnQuit(Prompt.String({ message: `${entry.name}: ${input.description ?? input.name}` })),
      (answer) => (answer === "" ? undefined : answer),
    ),
  confirmOverwrite: ({ name, file, existing, next }) =>
    Effect.gen(function* () {
      yield* Console.log(
        `MCP server ${name} in ${file} differs from the Skillset's entry.\nExisting:\n${JSON.stringify(existing, null, 2)}\nNew:\n${JSON.stringify(next, null, 2)}`,
      );
      return yield* cancelOnQuit(
        Prompt.Confirm({ message: `Overwrite MCP server ${name}?`, initial: false }),
      );
    }),
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
        [
          ...(plan.skillEntries.length > 0
            ? [
                `Skills:\n${plan.skillEntries.map((skillEntry) => `  ${skillEntry.name} (${skillEntry.source}@${skillEntry.commit})`).join(",\n")}`,
              ]
            : []),
          ...(plan.mcpEntries.length > 0
            ? [
                `MCP servers:\n${plan.mcpEntries.map((mcpEntry) => `  ${mcpEntry.name} (${describeMcpLaunch(mcpEntry)})`).join(",\n")}`,
              ]
            : []),
          `Agents: ${plan.agents?.join(", ") ?? "default"}`,
          `Scope: ${plan.scope}\nMode: ${plan.mode}`,
        ].join("\n"),
      );
      return yield* cancelOnQuit(
        Prompt.Confirm({ message: "Proceed with installation?", initial: true }),
      );
    }),
  confirmRemote: (skillEntries) =>
    Effect.gen(function* () {
      yield* listRemoteSkillEntries(skillEntries);
      return yield* cancelOnQuit(
        Prompt.Confirm({ message: "Install this Remote Skillset?", initial: false }),
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
        Effect.map(stdio.stdinIsTerminal, (isTTY) => (isTTY ? tty : nonInteractive)),
      );
