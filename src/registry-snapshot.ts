import { Effect } from "effect";
import { CliMessageError } from "./errors.ts";
import {
  checkEntryName,
  defaultEntryName,
  launchChoices,
  snapshotRegistryEntry,
} from "./mcp-snapshot.ts";
import type { Prompter } from "./prompts/prompter.ts";
import {
  getServerVersion,
  listServers,
  refuseInactive,
  registryBase,
  type RegistryServer,
} from "./registry.ts";

const fail = (message: string) => Effect.fail(new CliMessageError({ message }));

export type RegistryPicker = Pick<Prompter, "searchTerm" | "registryServer" | "launchChoice">;

const MIN_SEARCH_LENGTH = 3;

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
    const term = (yield* picker.searchTerm()).trim();
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
