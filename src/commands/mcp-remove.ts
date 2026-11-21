import { Console, Effect } from "effect";
import { Argument, Command, Flag } from "effect/cli";
import { CliMessageError } from "../errors.ts";
import { makePrompter } from "../prompts/prompter.ts";
import {
  openCommandSkillset,
  removeMcpEntries,
  selectMcpEntries,
  unknownMcpNamesMessage,
} from "../skillset-store.ts";

const usage = "Usage: skillset mcp rm [names...] [--all]";

// Spec #37, User Stories 30-32: removing MCP Entries changes only the Skillset file.
export const mcpRemove = Command.make(
  "rm",
  {
    servers: Argument.String("names").pipe(Argument.variadic()),
    all: Flag.Boolean("all").pipe(Flag.withDefault(false)),
    yes: Flag.Boolean("yes").pipe(Flag.withAlias("y"), Flag.withDefault(false)),
  },
  Effect.fn(function* ({ servers: supplied, all, yes }) {
    const prompter = yield* makePrompter(yes);
    if (!all && supplied.length === 0 && !prompter.canSelect)
      return yield* new CliMessageError({ message: usage });
    const store = yield* openCommandSkillset({ missing: "fail" });
    const { skillset } = store;
    const existing = skillset.mcp;
    let names: ReadonlyArray<string> = supplied;
    if (!all && names.length === 0) {
      if (existing.length === 0) {
        yield* Console.log("This Skillset has no MCP servers.");
        return;
      }
      const chosen = yield* prompter.mcpServers(
        existing.map((mcpEntry) => ({ title: mcpEntry.name, value: mcpEntry.name })),
      );
      if (!chosen || chosen.length === 0) return;
      names = chosen;
    }
    const { unknown } = selectMcpEntries(skillset, names);
    const removing = all ? existing.map((mcpEntry) => mcpEntry.name) : names;
    const removed = existing.filter((mcpEntry) => removing.includes(mcpEntry.name));
    if (removed.length > 0) {
      yield* store.save(removeMcpEntries(skillset, removing));
      yield* Console.log(
        `Removed ${removed.map((mcpEntry) => mcpEntry.name).join(", ")} from ${store.path}`,
      );
    }
    if (unknown.length > 0)
      return yield* new CliMessageError({ message: unknownMcpNamesMessage(skillset, unknown) });
  }),
).pipe(Command.withDescription("Remove MCP Entries from a Skillset"));
