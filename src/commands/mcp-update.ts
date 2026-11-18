import { Console, Effect } from "effect";
import { Argument, Command } from "effect/cli";
import { CliMessageError } from "../errors.ts";
import type { McpEntry } from "../mcp-entry.ts";
import { launchChoices, snapshotRegistryEntry, type LaunchChoice } from "../mcp-snapshot.ts";
import { getServerVersion, refuseInactive } from "../registry.ts";
import {
  openCommandSkillset,
  replaceMcpEntry,
  selectMcpEntries,
  unknownMcpNamesMessage,
} from "../skillset-store.ts";

type Launch = Exclude<McpEntry["launch"], { readonly type: "command" }>;

// ADR 0006: a fresh snapshot of the same kind of package (type) or remote (transport).
const sameKind = (launch: Launch, choices: ReadonlyArray<LaunchChoice>) => {
  const matches = choices.filter((choice) =>
    launch.type === "package"
      ? choice.kind === "package" && choice.package.registryType === launch.registryType
      : choice.kind === "remote" && choice.remote.type === launch.transport,
  );
  // Prefer the same package or URL when a server offers several of one kind.
  return (
    matches.find((choice) =>
      choice.kind === "package"
        ? launch.type === "package" && choice.package.identifier === launch.identifier
        : launch.type === "remote" && choice.remote.url === launch.url,
    ) ?? matches[0]
  );
};

const describeKind = (launch: Launch) =>
  launch.type === "package" ? `${launch.registryType} package` : `${launch.transport} remote`;

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
    if (unknown.length > 0) warnings.push(unknownMcpNamesMessage(unknown));
    for (const entry of mcpEntries) {
      const { origin, launch } = entry;
      // A command launch has no Registry package or remote to renew.
      if (origin === undefined || launch.type === "command") {
        notes.push(`${entry.name} is a manual MCP server; skipped`);
        continue;
      }
      const latest = yield* getServerVersion(origin.registry, origin.name, "latest").pipe(
        Effect.flatMap((found) => refuseInactive(origin.registry, found)),
        Effect.result,
      );
      if (latest._tag === "Failure") {
        warnings.push(`Warning: ${entry.name}: ${latest.failure.message}`);
        continue;
      }
      const server = latest.success;
      if (server.version === origin.version) continue;
      const choice = sameKind(launch, launchChoices(server));
      if (choice === undefined) {
        warnings.push(
          `Warning: ${entry.name}: ${server.name} ${server.version} no longer offers an ${describeKind(launch)}`,
        );
        continue;
      }
      const snapshot = yield* snapshotRegistryEntry({
        registry: origin.registry,
        server,
        choice,
        name: entry.name,
      }).pipe(Effect.result);
      if (snapshot._tag === "Failure") {
        warnings.push(`Warning: ${entry.name}: ${snapshot.failure.message}`);
        continue;
      }
      // The curator may have renamed a secret's env var; keep that name while the input exists.
      const kept = {
        ...snapshot.success,
        ...(snapshot.success.inputs
          ? {
              inputs: snapshot.success.inputs.map((input) => {
                const env = entry.inputs?.find(
                  (old) => old.name === input.name && old.kind === input.kind,
                )?.env;
                return env !== undefined && input.env !== undefined ? { ...input, env } : input;
              }),
            }
          : {}),
      };
      skillset = replaceMcpEntry(skillset, kept);
      changes.push(`${entry.name}  ${origin.version} → ${server.version}`);
    }
    if (changes.length > 0) yield* store.save(skillset);
    for (const line of [...changes, ...notes]) yield* Console.log(line);
    if (warnings.length > 0) return yield* new CliMessageError({ message: warnings.join("\n") });
  }),
).pipe(Command.withDescription("Update Registry MCP Entries to the latest version"));
