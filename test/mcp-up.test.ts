import { NodeFileSystem } from "@effect/platform-node";
import { assert, it } from "@effect/vitest";
import { Effect, FileSystem } from "effect";
import { runCli } from "./harness.ts";
import {
  OFFICIAL,
  cannedFetch,
  json,
  npmServer,
  versionResponse,
  versionUrl,
} from "./registry-fixtures.ts";

const schemaUrl =
  "https://raw.githubusercontent.com/itsmeyaw/skillset/main/schemas/skillset/v1.json";
const commit = "a".repeat(40);
const name = "io.github.owner/server";

const setup = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const dir = yield* fs.makeTempDirectoryScoped();
  const file = `${dir}/set.json`;
  yield* fs.writeFileString(
    file,
    JSON.stringify({ $schema: schemaUrl, skills: [{ name: "alpha", source: "owner/a", commit }] }),
  );
  return {
    fs,
    file,
    read: fs.readFileString(file).pipe(Effect.map((text) => JSON.parse(text))),
    // Adds a Registry Entry through mcp add, so the file holds exactly what mcp add writes.
    add: (argv: ReadonlyArray<string>, fetch: typeof globalThis.fetch) =>
      runCli(["mcp", "add", ...argv, "--set", file], { fetch }),
  };
});

const older = cannedFetch({ [versionUrl("latest")]: json(versionResponse(npmServer("1.0.0"))) });
const newer = { [versionUrl("latest")]: json(versionResponse(npmServer("2.0.0"))) };

const other = (version: string) => ({ ...npmServer(version), name: "acme/two" });
const otherUrl = `${OFFICIAL}/v0.1/servers/acme%2Ftwo/versions/latest`;

it.effect("mcp up moves a Registry Entry to the latest version and changes nothing else", () =>
  Effect.gen(function* () {
    const { file, read, add } = yield* setup;
    yield* add(
      [`${name}@1.0.0`],
      cannedFetch({ [versionUrl("1.0.0")]: json(versionResponse(npmServer("1.0.0"))) }),
    );
    const before = yield* read;
    const requested: Array<string> = [];
    const result = yield* runCli(["mcp", "up", "--set", file], {
      fetch: cannedFetch(newer, requested),
    });
    assert.deepStrictEqual(result.err, []);
    assert.strictEqual(result.code, 0);
    assert.deepStrictEqual(requested, [versionUrl("latest")]);
    assert.include(result.out.join("\n"), "server  1.0.0 → 2.0.0");
    const after = yield* read;
    assert.deepStrictEqual(after.skills, before.skills);
    assert.deepStrictEqual(after.mcp[0].origin, { registry: OFFICIAL, name, version: "2.0.0" });
    assert.strictEqual(after.mcp[0].launch.version, "2.0.0");
    assert.deepStrictEqual(
      {
        ...after.mcp[0],
        launch: { ...after.mcp[0].launch, version: "1.0.0" },
        origin: before.mcp[0].origin,
      },
      before.mcp[0],
    );
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect(
  "mcp up leaves manual Entries, Entries on the latest version and unnamed Entries alone",
  () =>
    Effect.gen(function* () {
      const { fs, file, read, add } = yield* setup;
      yield* add(["hand", "--url", "https://mcp.example.com/mcp"], cannedFetch({}));
      yield* add(
        ["acme/two", "--name", "current"],
        cannedFetch({ [otherUrl]: json(versionResponse(other("1.0.0"))) }),
      );
      yield* add([name], older);
      const before = yield* fs.readFileString(file);
      const fetch = cannedFetch({
        ...newer,
        [otherUrl]: json(versionResponse(other("1.0.0"))),
      });
      const result = yield* runCli(["mcp", "up", "hand", "current", "--set", file], { fetch });
      assert.strictEqual(result.code, 0);
      assert.deepStrictEqual(result.err, []);
      assert.include(result.out.join("\n"), "hand is a manual MCP server; skipped");
      assert.strictEqual(yield* fs.readFileString(file), before);
      const all = yield* runCli(["mcp", "up", "--set", file], { fetch });
      assert.strictEqual(all.code, 0);
      const entries = (yield* read).mcp;
      assert.deepStrictEqual(
        entries.map((entry: { name: string; origin?: { version: string } }) => [
          entry.name,
          entry.origin?.version,
        ]),
        [
          ["current", "1.0.0"],
          ["hand", undefined],
          ["server", "2.0.0"],
        ],
      );
    }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("mcp up keeps an edited secret env var name", () =>
  Effect.gen(function* () {
    const { fs, file, read, add } = yield* setup;
    yield* add([name], older);
    const edited = yield* read;
    edited.mcp[0].inputs[1].env = "COMPANY_TOKEN";
    yield* fs.writeFileString(file, JSON.stringify(edited));
    const result = yield* runCli(["mcp", "up", "--set", file], { fetch: cannedFetch(newer) });
    assert.strictEqual(result.code, 0);
    assert.strictEqual((yield* read).mcp[0].inputs[1].env, "COMPANY_TOKEN");
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("mcp up updates a remote Entry to the new remote of the same transport", () =>
  Effect.gen(function* () {
    const { file, read, add } = yield* setup;
    const server = (version: string, remotes: ReadonlyArray<object>) => ({
      name,
      version,
      remotes,
    });
    yield* add(
      [name],
      cannedFetch({
        [versionUrl("latest")]: json(
          versionResponse(server("1.0.0", [{ type: "sse", url: "https://a.example/sse" }])),
        ),
      }),
    );
    const result = yield* runCli(["mcp", "up", "--set", file], {
      fetch: cannedFetch({
        [versionUrl("latest")]: json(
          versionResponse(
            server("2.0.0", [
              { type: "streamable-http", url: "https://c.example/mcp" },
              { type: "sse", url: "https://b.example/sse" },
            ]),
          ),
        ),
      }),
    });
    assert.strictEqual(result.code, 0);
    const [entry] = (yield* read).mcp;
    assert.strictEqual(entry.launch.url, "https://b.example/sse");
    assert.strictEqual(entry.launch.transport, "sse");
    assert.strictEqual(entry.origin.version, "2.0.0");
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("mcp up warns and keeps an Entry whose newer version lacks the package type", () =>
  Effect.gen(function* () {
    const { fs, file, add } = yield* setup;
    yield* add([name], older);
    const before = yield* fs.readFileString(file);
    const pypi = {
      ...npmServer("2.0.0"),
      packages: [
        { registryType: "pypi", identifier: "p", version: "2.0.0", transport: { type: "stdio" } },
      ],
    };
    const result = yield* runCli(["mcp", "up", "--set", file], {
      fetch: cannedFetch({ [versionUrl("latest")]: json(versionResponse(pypi)) }),
    });
    assert.strictEqual(result.code, 1);
    assert.include(
      result.err.join("\n"),
      "Warning: server: io.github.owner/server 2.0.0 no longer offers an npm package",
    );
    assert.strictEqual(yield* fs.readFileString(file), before);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("mcp up reports Registry errors and deprecated versions and still updates the rest", () =>
  Effect.gen(function* () {
    const { file, read, add } = yield* setup;
    yield* add([name, "--name", "good"], older);
    yield* add(
      ["acme/two", "--name", "broken"],
      cannedFetch({ [otherUrl]: json(versionResponse(other("1.0.0"))) }),
    );
    yield* add([name, "--name", "stale"], older);
    const missing = `${OFFICIAL}/v0.1/servers/acme%2Fthree/versions/latest`;
    yield* add(
      ["acme/three", "--name", "gone"],
      cannedFetch({
        [missing]: json(versionResponse({ ...npmServer("1.0.0"), name: "acme/three" })),
      }),
    );
    const result = yield* runCli(["mcp", "up", "--set", file], {
      fetch: cannedFetch({
        [versionUrl("latest")]: json(versionResponse(npmServer("2.0.0"))),
        [otherUrl]: () => new Response("slow down", { status: 429 }),
        [missing]: json(
          versionResponse({ ...npmServer("2.0.0"), name: "acme/three" }, "deprecated"),
        ),
      }),
    });
    assert.strictEqual(result.code, 1);
    const err = result.err.join("\n");
    assert.include(err, "Warning: broken: ");
    assert.include(err, "rate limiting");
    assert.include(err, "Warning: gone: acme/three 2.0.0 is deprecated");
    const versions = Object.fromEntries(
      (yield* read).mcp.map((entry: { name: string; origin: { version: string } }) => [
        entry.name,
        entry.origin.version,
      ]),
    );
    assert.deepStrictEqual(versions, {
      broken: "1.0.0",
      gone: "1.0.0",
      good: "2.0.0",
      stale: "2.0.0",
    });
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("mcp up reports unknown names", () =>
  Effect.gen(function* () {
    const { file, add } = yield* setup;
    yield* add([name], older);
    const result = yield* runCli(["mcp", "up", "nope", "--set", file], { fetch: cannedFetch({}) });
    assert.strictEqual(result.code, 1);
    assert.include(result.err.join("\n"), "Unknown MCP servers: nope");
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("mcp up rejects a Remote Skillset without fetching Registries", () =>
  Effect.gen(function* () {
    const requested: Array<string> = [];
    const result = yield* runCli(["mcp", "up", "--set", "https://example.com/skillset.json"], {
      fetch: cannedFetch({}, requested),
    });
    assert.strictEqual(result.code, 1);
    assert.include(result.err.join("\n"), "Remote Skillset");
    assert.deepStrictEqual(requested, []);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);
