import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { assert, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import type { McpEntry } from "../src/mcp-entry.ts";
import { renewSnapshot, snapshotFromRegistry } from "../src/registry-snapshot.ts";
import { RemoteFetch } from "../src/remote-skillset.ts";
import { fakeTerminal } from "./harness.ts";
import { OFFICIAL, cannedFetch, json, npmServer, versionResponse } from "./registry-fixtures.ts";

const serverName = "io.github.owner/server";
const versionUrl = (version: string, name = serverName) =>
  `${OFFICIAL}/v0.1/servers/${encodeURIComponent(name)}/versions/${version}`;

const unexpected = () => Effect.die("the picker was not expected to be asked");
const picker = {
  searchTerm: unexpected,
  registryServer: unexpected,
  launchChoice: unexpected,
};

// The picker's answers need a terminal, a file system and a path, even when a fake never asks.
const withFetch = (routes: Parameters<typeof cannedFetch>[0] = {}) => {
  const fetch = cannedFetch(routes);
  return <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.gen(function* () {
      const terminal = yield* fakeTerminal([], []);
      return yield* effect.pipe(
        Effect.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer, terminal)),
        Effect.provideService(RemoteFetch, fetch),
      );
    });
};

const failure = <A, R>(effect: Effect.Effect<A, { readonly message: string }, R>) =>
  effect.pipe(
    Effect.flip,
    Effect.map(({ message }) => message),
    withFetch(),
  );

it.effect("snapshotFromRegistry snapshots the latest version of a named server", () =>
  Effect.gen(function* () {
    const entry = yield* snapshotFromRegistry({ server: serverName }, picker).pipe(
      withFetch({ [versionUrl("latest")]: json(versionResponse(npmServer("2.0.0"))) }),
    );
    assert.strictEqual(entry.name, "server");
    assert.deepStrictEqual(entry.origin, {
      registry: OFFICIAL,
      name: serverName,
      version: "2.0.0",
    });
  }),
);

it.effect("snapshotFromRegistry takes the version after the last @", () =>
  Effect.gen(function* () {
    const entry = yield* snapshotFromRegistry({ server: `${serverName}@1.0.0` }, picker).pipe(
      withFetch({ [versionUrl("1.0.0")]: json(versionResponse(npmServer("1.0.0"))) }),
    );
    assert.strictEqual(entry.origin?.version, "1.0.0");
  }),
);

it.effect("snapshotFromRegistry rejects a missing version after @", () =>
  Effect.gen(function* () {
    const message = yield* failure(snapshotFromRegistry({ server: `${serverName}@` }, picker));
    assert.strictEqual(message, `Missing version after "@" in "${serverName}@".`);
  }),
);

it.effect.each(["deprecated", "deleted"])("snapshotFromRegistry refuses a %s version", (status) =>
  Effect.gen(function* () {
    const message = yield* failure(
      snapshotFromRegistry({ server: serverName }, picker).pipe(
        withFetch({
          [versionUrl("latest")]: json(versionResponse(npmServer("2.0.0"), status)),
        }),
      ),
    );
    assert.strictEqual(message, `${serverName} 2.0.0 is ${status} in Registry ${OFFICIAL}.`);
  }),
);

const listUrl = (cursor?: string) =>
  `${OFFICIAL}/v0.1/servers?version=latest&search=serv${cursor === undefined ? "" : `&cursor=${cursor}`}`;
const page = (servers: ReadonlyArray<object>, nextCursor?: string) =>
  json({ servers, metadata: { count: servers.length, nextCursor } });

it.effect("snapshotFromRegistry pages past a page with only inactive servers", () =>
  Effect.gen(function* () {
    const offered: Array<ReadonlyArray<string>> = [];
    const searching = {
      ...picker,
      searchTerm: () => Effect.succeed(" serv "),
      registryServer: (names: ReadonlyArray<string>) => {
        offered.push(names);
        return Effect.succeed(names[0]);
      },
    };
    const entry = yield* snapshotFromRegistry({}, searching).pipe(
      withFetch({
        [listUrl()]: page(
          [versionResponse({ ...npmServer("1.0.0"), name: "acme/gone" }, "deleted")],
          "c2",
        ),
        [listUrl("c2")]: page([versionResponse(npmServer("2.0.0"))]),
      }),
    );
    assert.deepStrictEqual(offered, [[serverName]]);
    assert.strictEqual(entry.origin?.name, serverName);
  }),
);

it.effect(
  "snapshotFromRegistry rejects a short search term and an entry name it cannot store",
  () =>
    Effect.gen(function* () {
      const short = yield* failure(
        snapshotFromRegistry({}, { ...picker, searchTerm: () => Effect.succeed("ab") }),
      );
      assert.strictEqual(short, "Search term must be at least 3 characters.");
      const bad = yield* failure(
        snapshotFromRegistry({ server: serverName, entryName: "a b" }, picker).pipe(
          withFetch({ [versionUrl("latest")]: json(versionResponse(npmServer("2.0.0"))) }),
        ),
      );
      assert.strictEqual(
        bad,
        `Invalid MCP server name "a b": use letters, digits, '.', '_' and '-'.`,
      );
    }),
);

const latestUrl = versionUrl("latest");
const entryAt = (version: string, name = "server") =>
  snapshotFromRegistry({ server: serverName, entryName: name }, picker).pipe(
    withFetch({ [latestUrl]: json(versionResponse(npmServer(version))) }),
  );
const renew = (entry: McpEntry, server: object, status?: string) =>
  renewSnapshot(entry).pipe(withFetch({ [latestUrl]: json(versionResponse(server, status)) }));

const pkg = (registryType: string, identifier: string, version: string) => ({
  registryType,
  identifier,
  version,
  transport: { type: "stdio" },
});

it.effect("renewSnapshot moves an Entry to the latest version", () =>
  Effect.gen(function* () {
    const renewal = yield* renew(yield* entryAt("1.0.0"), npmServer("2.0.0"));
    assert.deepStrictEqual(renewal, {
      next: { ...(yield* entryAt("2.0.0")) },
      from: "1.0.0",
      to: "2.0.0",
    });
  }),
);

it.effect("renewSnapshot keeps the kind of package even when another kind comes first", () =>
  Effect.gen(function* () {
    const entry = yield* entryAt("1.0.0");
    const renewal = yield* renew(entry, {
      name: serverName,
      version: "2.0.0",
      packages: [pkg("pypi", "server-py", "2.0.0"), pkg("npm", "@owner/other", "2.0.0")],
    });
    assert.isTrue("next" in renewal);
    if ("next" in renewal) {
      assert.strictEqual(renewal.next.launch.type, "package");
      assert.strictEqual(
        renewal.next.launch.type === "package" && renewal.next.launch.registryType,
        "npm",
      );
    }
  }),
);

it.effect("renewSnapshot prefers the same identifier among packages of one kind", () =>
  Effect.gen(function* () {
    const entry = yield* entryAt("1.0.0");
    const renewal = yield* renew(entry, {
      name: serverName,
      version: "2.0.0",
      packages: [pkg("npm", "@owner/other", "2.0.0"), pkg("npm", "@owner/server", "2.0.0")],
    });
    assert.isTrue("next" in renewal);
    if ("next" in renewal && renewal.next.launch.type === "package")
      assert.strictEqual(renewal.next.launch.identifier, "@owner/server");
  }),
);

it.effect("renewSnapshot skips a manual Entry and an Entry already at the latest version", () =>
  Effect.gen(function* () {
    const manual = { name: "hand", launch: { type: "command", command: "x", args: [] } } as const;
    assert.deepStrictEqual(yield* renewSnapshot(manual).pipe(withFetch()), { skip: "manual" });
    const current = yield* entryAt("1.0.0");
    assert.deepStrictEqual(yield* renew(current, npmServer("1.0.0")), { skip: "current" });
  }),
);

it.effect("renewSnapshot reports an inactive latest version and a vanished kind", () =>
  Effect.gen(function* () {
    const entry = yield* entryAt("1.0.0");
    assert.deepStrictEqual(yield* renew(entry, npmServer("2.0.0"), "deprecated"), {
      failed: `${serverName} 2.0.0 is deprecated in Registry ${OFFICIAL}.`,
    });
    assert.deepStrictEqual(
      yield* renew(entry, {
        name: serverName,
        version: "2.0.0",
        packages: [pkg("pypi", "server-py", "2.0.0")],
      }),
      { failed: `${serverName} 2.0.0 no longer offers an npm package` },
    );
  }),
);

it.effect("renewSnapshot keeps a curator-renamed secret env var and nothing else they edited", () =>
  Effect.gen(function* () {
    const entry = yield* entryAt("1.0.0");
    const edited: McpEntry = {
      ...entry,
      inputs: entry.inputs?.map((input) =>
        input.name === "token" ? { ...input, env: "COMPANY_TOKEN" } : input,
      ),
    };
    const renewal = yield* renew(edited, npmServer("2.0.0"));
    assert.isTrue("next" in renewal);
    if ("next" in renewal) {
      const env = (name: string) => renewal.next.inputs?.find((input) => input.name === name)?.env;
      assert.strictEqual(env("token"), "COMPANY_TOKEN");
      assert.strictEqual(env("API_KEY"), undefined);
    }
  }),
);
