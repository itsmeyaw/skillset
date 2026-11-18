import { Console, Effect } from "effect";
import { Command, Flag } from "effect/cli";
import { emptySkillsetMessage } from "../errors.ts";
import { sortedByName } from "../skillset-file.ts";
import { describeMcpLaunch, mcpKind } from "../mcp-entry.ts";
import { isEmpty, listCommandUserSkillsets, openCommandSkillset } from "../skillset-store.ts";

// Spec #1, User Story 27: show each Skill Entry's name, Source, and short Pin.
export const list = Command.make(
  "list",
  { user: Flag.Boolean("user").pipe(Flag.withDefault(false)) },
  Effect.fn(function* ({ user }) {
    // Issue #22: --user lists User Skillsets; -g only means global install scope.
    if (user) {
      for (const name of yield* listCommandUserSkillsets) yield* Console.log(name);
      return;
    }
    const { skillset } = yield* openCommandSkillset({ missing: "fail", allowRemote: true });
    const mcpEntries = sortedByName(skillset.mcp ?? []);
    if (isEmpty(skillset) && mcpEntries.length === 0) {
      yield* Console.log(emptySkillsetMessage);
      return;
    }
    for (const skillEntry of sortedByName(skillset.skills)) {
      yield* Console.log(
        `${skillEntry.name}  ${skillEntry.source}  ${skillEntry.commit.slice(0, 7)}`,
      );
    }
    // Issue #40: the MCP section appears only when the Skillset has MCP Entries.
    if (mcpEntries.length === 0) return;
    if (!isEmpty(skillset)) yield* Console.log("");
    yield* Console.log("MCP servers:");
    for (const mcpEntry of mcpEntries) {
      yield* Console.log(`${mcpEntry.name}  ${mcpKind(mcpEntry)}  ${describeMcpLaunch(mcpEntry)}`);
    }
  }),
).pipe(Command.withDescription("List Skill Entries and MCP Entries in a Skillset"));
