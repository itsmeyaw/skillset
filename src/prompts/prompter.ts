import { Console, Effect, Stdio, type FileSystem, type Path, type Terminal } from "effect";
import { Prompt } from "effect/cli";
import type { InstallScope, McpConflict } from "../agents/agent.ts";
import { CliMessageError } from "../errors.ts";
import type { InstallPlan } from "../install-plan.ts";
import { describeMcpLaunch, type McpEntry } from "../mcp-entry.ts";
import type { Skillset } from "../skillset-file.ts";
import { cancelOnQuit } from "./cancel.ts";
import { searchMultiSelect, selectHint, type SearchChoice } from "./search.ts";

type Answer<A> = Effect.Effect<
  A,
  CliMessageError,
  FileSystem.FileSystem | Path.Path | Terminal.Terminal
>;

// Each consumer depends only on the questions it asks.
export type SkillPrompter = {
  // Undefined means unattended selection was unavailable; an empty array means nothing was chosen.
  readonly skills: (
    choices: ReadonlyArray<SearchChoice>,
  ) => Answer<ReadonlyArray<string> | undefined>;
};

export type PlanPrompter = {
  readonly mcpServers: (
    choices: ReadonlyArray<SearchChoice>,
  ) => Answer<ReadonlyArray<string> | undefined>;
  // Undefined means no value was given: unattended, or an empty answer.
  readonly mcpInput: (
    entry: McpEntry,
    input: NonNullable<McpEntry["inputs"]>[number],
  ) => Answer<string | undefined>;
  readonly requiredSkills: (choices: ReadonlyArray<SearchChoice>) => Answer<ReadonlyArray<string>>;
  readonly agents: (
    choices: ReadonlyArray<SearchChoice>,
    defaults: ReadonlyArray<string>,
    supported: boolean,
  ) => Answer<ReadonlyArray<string> | undefined>;
  readonly scope: () => Answer<InstallScope>;
  readonly mode: () => Answer<"auto" | "symlink" | "copy">;
  readonly confirmPlan: (plan: InstallPlan) => Answer<boolean>;
};

export type OverwritePrompter = {
  // ADR 0007: a different server of the same name is overwritten only with consent.
  readonly confirmOverwrite: (conflict: McpConflict) => Answer<boolean>;
};

export type InstallPrompter = PlanPrompter & OverwritePrompter;

export type AddPrompter = SkillPrompter & {
  // Undefined means no terminal to ask on.
  readonly source: () => Answer<string | undefined>;
  readonly anotherSource: (failure?: { readonly message: string }) => Answer<boolean>;
  readonly confirmInstall: () => Answer<boolean>;
};

export type RemovePrompter = SkillPrompter &
  Pick<PlanPrompter, "mcpServers"> & {
    // False means the user cannot be asked which Entries to remove.
    readonly canSelect: boolean;
  };

// Spec #37, User Stories 11-13: search the Registry, pick one server, then one package or remote.
export type RegistryPrompter = {
  // Undefined means no terminal to ask on.
  readonly searchTerm: () => Answer<string | undefined>;
  // Undefined means "load more results".
  readonly registryServer: (
    names: ReadonlyArray<string>,
    hasMore: boolean,
  ) => Answer<string | undefined>;
  // Resolves to the index of the chosen title.
  readonly launchChoice: (titles: ReadonlyArray<string>, firstSupported: number) => Answer<number>;
};

export type RemotePrompter = {
  readonly confirmRemote: (skillset: Skillset) => Answer<boolean>;
};

export type Prompter = InstallPrompter &
  AddPrompter &
  RemovePrompter &
  RegistryPrompter &
  RemotePrompter;

// ADR 0004: the launch command runs on the user's machine, so show all of it; inputs by name only.
const describeRemoteMcpEntry = (mcpEntry: McpEntry) =>
  [
    `  ${mcpEntry.name}  ${describeMcpLaunch(mcpEntry)}`,
    ...(mcpEntry.inputs?.length
      ? [`    inputs: ${mcpEntry.inputs.map((input) => input.name).join(", ")}`]
      : []),
  ].join("\n");

const listRemoteEntries = ({ skills, mcp }: Skillset) =>
  Console.log(
    [
      ...(skills.length > 0 || mcp.length === 0
        ? [
            `Remote Skillset Skill Entries:\n${skills.map((skillEntry) => `  ${skillEntry.name}  ${skillEntry.source}  ${skillEntry.commit.slice(0, 7)}`).join("\n")}`,
          ]
        : []),
      ...(mcp.length > 0
        ? [`Remote Skillset MCP Entries:\n${mcp.map(describeRemoteMcpEntry).join("\n")}`]
        : []),
    ].join("\n"),
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
  searchTerm: () => Effect.undefined,
  registryServer: (names) => Effect.succeed(names[0]),
  launchChoice: (_titles, firstSupported) => Effect.succeed(firstSupported),
  confirmPlan: () => Effect.succeed(true),
  confirmRemote: (skillset) =>
    Effect.andThen(
      listRemoteEntries(skillset),
      Effect.fail(
        new CliMessageError({
          message: "Remote Skillsets require confirmation; use -y for unattended installs.",
        }),
      ),
    ),
  source: () => Effect.undefined,
  canSelect: false,
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
  skills: (choices) =>
    cancelOnQuit(searchMultiSelect({ message: "Which skills?", choices, hint: selectHint })),
  mcpServers: (choices) =>
    cancelOnQuit(searchMultiSelect({ message: "Which MCP servers?", choices, hint: selectHint })),
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
    cancelOnQuit(
      searchMultiSelect({ message: "Which skills?", choices, min: 1, hint: selectHint }),
    ),
  agents: (choices, _defaults, supported) =>
    !supported
      ? Effect.fail(new CliMessageError({ message: "No supported agents available" }))
      : cancelOnQuit(
          searchMultiSelect({ message: "Which agents?", choices, min: 1, hint: selectHint }),
        ),
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
  searchTerm: () => cancelOnQuit(Prompt.String({ message: "Search the Registry for?" })),
  registryServer: (names, hasMore) =>
    cancelOnQuit(
      Prompt.Select<string | undefined>({
        message: "Which MCP server?",
        choices: [
          ...names.map((name) => ({ title: name, value: name })),
          ...(hasMore ? [{ title: "Load more results…", value: undefined }] : []),
        ],
      }),
    ),
  launchChoice: (titles) =>
    cancelOnQuit(
      Prompt.Select({
        message: "Which package or remote?",
        choices: titles.map((title, index) => ({ title, value: index })),
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
          ...(plan.resolvedMcp.length > 0
            ? [
                `MCP servers:\n${plan.resolvedMcp.map(({ entry }) => `  ${entry.name} (${describeMcpLaunch(entry)})`).join(",\n")}`,
                `MCP agents: ${plan.mcpTargets.map((agent) => agent.id).join(", ") || "none"}`,
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
  confirmRemote: (skillset) =>
    Effect.gen(function* () {
      yield* listRemoteEntries(skillset);
      return yield* cancelOnQuit(
        Prompt.Confirm({ message: "Install this Remote Skillset?", initial: false }),
      );
    }),
  source: () => cancelOnQuit(Prompt.String({ message: "Source?" })),
  canSelect: true,
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
