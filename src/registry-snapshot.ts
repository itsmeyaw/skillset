import { Effect } from "effect";
import { CliMessageError } from "./errors.ts";
import type { McpEntry } from "./mcp-entry.ts";
import {
  checkEntryName,
  defaultEntryName,
  launchChoices,
  snapshotRegistryEntry,
  type LaunchChoice,
} from "./mcp-snapshot.ts";
import type { Prompter } from "./prompts/prompter.ts";
import {
  getServerVersion,
  listServers,
  refuseInactive,
  registryBase,
  type RegistryServer,
} from "./registry.ts";
import type { RemoteFetch } from "./remote-skillset.ts";

const fail = (message: string) => Effect.fail(new CliMessageError({ message }));

export type RegistryPicker = Pick<Prompter, "searchTerm" | "registryServer" | "launchChoice">;

const MIN_SEARCH_LENGTH = 3;

const usage = "Usage: skillset mcp add <registry-name>[@version] (a search needs a terminal)";

// ADR 0006: only an active version is addable.
const activeServer = (base: string, name: string, version: string) =>
  getServerVersion(base, name, version).pipe(
    Effect.flatMap((found) => refuseInactive(base, found)),
  );

// `name` or `name@version`; the version defaults to the latest.
const namedServer = (base: string, given: string) => {
  const at = given.lastIndexOf("@");
  const name = at > 0 ? given.slice(0, at) : given;
  const version = at > 0 ? given.slice(at + 1) : "latest";
  if (version === "") return fail(`Missing version after "@" in "${given}".`);
  return activeServer(base, name, version);
};

// Spec #37, User Stories 11-13: search latest active versions, paging on request.
const searchServer = (base: string, picker: RegistryPicker) =>
  Effect.gen(function* () {
    const answer = yield* picker.searchTerm();
    if (answer === undefined) return yield* fail(usage);
    const term = answer.trim();
    if (Array.from(term).length < MIN_SEARCH_LENGTH)
      return yield* fail(`Search term must be at least ${MIN_SEARCH_LENGTH} characters.`);
    const found: Array<RegistryServer> = [];
    let cursor: string | undefined;
    for (;;) {
      const next = yield* listServers(base, { search: term, cursor });
      found.push(
        ...next.servers.filter(({ status }) => status === "active").map(({ server }) => server),
      );
      cursor = next.nextCursor;
      if (found.length === 0 && cursor === undefined)
        return yield* fail(`No servers match "${term}" in Registry ${base}.`);
      // A page of inactive servers shows nothing to pick, so keep paging.
      if (found.length === 0) continue;
      const names = found.map((server) => server.name);
      const chosen = yield* picker.registryServer(names, cursor !== undefined);
      if (chosen !== undefined) return found[names.indexOf(chosen)]!;
    }
  });

const describeChoice = (choice: ReturnType<typeof launchChoices>[number]) =>
  choice.kind === "package"
    ? `${choice.package.registryType} ${choice.package.identifier}`
    : `${choice.remote.type} ${choice.remote.url}`;

// Spec #37, User Stories 1-4, 11-13 and 16-18: the snapshot of one Registry server version.
// `server` is `name[@version]`; without it the picker searches the Registry.
export const snapshotFromRegistry = (
  request: {
    readonly registry?: string;
    readonly server?: string;
    readonly entryName?: string;
  },
  picker: RegistryPicker,
) =>
  Effect.gen(function* () {
    const base = yield* registryBase(request.registry);
    const server =
      request.server === undefined
        ? yield* searchServer(base, picker)
        : yield* namedServer(base, request.server);
    const choices = launchChoices(server);
    if (choices.length === 0)
      return yield* fail(`${server.name} ${server.version} offers no package or remote.`);
    const choice =
      choices[choices.length === 1 ? 0 : yield* picker.launchChoice(choices.map(describeChoice))]!;
    const name = request.entryName ?? defaultEntryName(server.name);
    yield* checkEntryName(name);
    return yield* snapshotRegistryEntry({ registry: base, server, choice, name });
  });

type RegistryLaunch = Exclude<McpEntry["launch"], { readonly type: "command" }>;

// ADR 0006: a fresh snapshot of the same kind of package (type) or remote (transport).
const sameKind = (launch: RegistryLaunch, choices: ReadonlyArray<LaunchChoice>) => {
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

const describeKind = (launch: RegistryLaunch) =>
  launch.type === "package" ? `${launch.registryType} package` : `${launch.transport} remote`;

// ADR 0008: the curator may have renamed a secret's env var; keep that name while the input exists.
const keepEnvNames = (previous: McpEntry, next: McpEntry): McpEntry =>
  next.inputs === undefined
    ? next
    : {
        ...next,
        inputs: next.inputs.map((input) => {
          const env = previous.inputs?.find(
            (old) => old.name === input.name && old.kind === input.kind,
          )?.env;
          return env !== undefined && input.env !== undefined ? { ...input, env } : input;
        }),
      };

export type Renewal =
  | { readonly next: McpEntry; readonly from: string; readonly to: string }
  | { readonly skip: "manual" | "current" }
  | { readonly failed: string };

// Spec #37, User Stories 33-37: move a Registry Entry to the latest active version, same kind of launch.
// A failure is a value, so one Entry cannot stop the others from being renewed.
export const renewSnapshot = (entry: McpEntry) =>
  Effect.gen(function* (): Effect.fn.Return<Renewal, never, RemoteFetch> {
    const { origin, launch } = entry;
    // A command launch has no Registry package or remote to renew.
    if (origin === undefined || launch.type === "command") return { skip: "manual" };
    const found = yield* activeServer(origin.registry, origin.name, "latest").pipe(Effect.result);
    if (found._tag === "Failure") return { failed: found.failure.message };
    const server = found.success;
    if (server.version === origin.version) return { skip: "current" };
    const choice = sameKind(launch, launchChoices(server));
    if (choice === undefined)
      return {
        failed: `${server.name} ${server.version} no longer offers an ${describeKind(launch)}`,
      };
    const snapshot = yield* snapshotRegistryEntry({
      registry: origin.registry,
      server,
      choice,
      name: entry.name,
    }).pipe(Effect.result);
    if (snapshot._tag === "Failure") return { failed: snapshot.failure.message };
    return {
      next: keepEnvNames(entry, snapshot.success),
      from: origin.version,
      to: server.version,
    };
  });
