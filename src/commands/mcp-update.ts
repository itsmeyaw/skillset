import { Console, Effect } from "effect";
import { Argument, Command } from "effect/cli";
import { CliMessageError } from "../errors.ts";
import { renewSnapshot } from "../registry-snapshot.ts";
import {
  openCommandSkillset,
  replaceMcpEntry,
  selectMcpEntries,
  unknownMcpNamesMessage,
} from "../skillset-store.ts";

// Spec #37, User Stories 33-37: move Registry MCP Entries to the latest active version.
export const mcpUpdate = Command.make(
  "up",
  { servers: Argument.String("names").pipe(Argument.variadic()) },
  Effect.fn(function* ({ servers }) {
    const store = yield* openCommandSkillset({ missing: "fail" });
    let skillset = store.skillset;
    const { mcpEntries, unknown } = selectMcpEntries(skillset, servers);
    const changes: Array<string> = [];
    const notes: Array<string> = [];
    const warnings: Array<string> = [];
    if (unknown.length > 0) warnings.push(unknownMcpNamesMessage(skillset, unknown));
    for (const entry of mcpEntries) {
      const renewal = yield* renewSnapshot(entry);
      if ("next" in renewal) {
        skillset = replaceMcpEntry(skillset, renewal.next);
        changes.push(`${entry.name}  ${renewal.from} → ${renewal.to}`);
      } else if ("failed" in renewal) warnings.push(`Warning: ${entry.name}: ${renewal.failed}`);
      else if (renewal.skip === "manual")
        notes.push(`${entry.name} is a manual MCP server; skipped`);
    }
    if (changes.length > 0) yield* store.save(skillset);
    for (const line of [...changes, ...notes]) yield* Console.log(line);
    if (warnings.length > 0) return yield* new CliMessageError({ message: warnings.join("\n") });
  }),
).pipe(Command.withDescription("Update Registry MCP Entries to the latest version"));
