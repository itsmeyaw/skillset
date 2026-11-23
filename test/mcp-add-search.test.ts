import { NodeFileSystem } from "@effect/platform-node";
import { assert, it } from "@effect/vitest";
import { Effect, FileSystem } from "effect";
import { key, runCli } from "./harness.ts";
import {
  OFFICIAL,
  cannedFetch,
  githubServer,
  json,
  npmServer,
  versionResponse,
} from "./registry-fixtures.ts";

const schemaUrl =
  "https://raw.githubusercontent.com/itsmeyaw/skillset/main/schemas/skillset/v1.json";

const setup = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const dir = yield* fs.makeTempDirectoryScoped();
  const file = `${dir}/set.json`;
  yield* fs.writeFileString(file, JSON.stringify({ $schema: schemaUrl, skills: [] }));
  return {
    fs,
    file,
    before: yield* fs.readFileString(file),
    read: fs.readFileString(file).pipe(Effect.map((text) => JSON.parse(text))),
  };
});

const enter = key("enter");
const down = key("down");
const type = (text: string) => key(text, text);

const listUrl = (search: string, cursor?: string) =>
  `${OFFICIAL}/v0.1/servers?version=latest&search=${search}${cursor === undefined ? "" : `&cursor=${cursor}`}`;
const page = (servers: ReadonlyArray<object>, nextCursor?: string) =>
  json({ servers, metadata: { count: servers.length, nextCursor } });
const named = (name: string) => versionResponse({ ...npmServer("1.0.0"), name });
const both = versionResponse(githubServer);

it.effect("mcp add without a name searches, picks a server and stores it", () =>
  Effect.gen(function* () {
    const { file, read } = yield* setup;
    const requested: Array<string> = [];
    const fetch = cannedFetch(
      {
        [listUrl("git")]: page([
          named("io.github.a/alpha"),
          versionResponse({ ...npmServer("1.0.0"), name: "io.github.b/gone" }, "deprecated"),
          named("io.github.c/gamma"),
        ]),
      },
      requested,
    );
    const result = yield* runCli(["mcp", "add", "--set", file], {
      tty: true,
      fetch,
      keys: [type("git"), enter, down, enter, key("n", "n")],
    });
    assert.deepStrictEqual(result.err, []);
    assert.strictEqual(result.code, 0);
    const screen = result.screen.join("");
    assert.include(screen, "io.github.a/alpha");
    assert.notInclude(screen, "io.github.b/gone");
    assert.deepStrictEqual(requested, [listUrl("git")]);
    const [entry] = (yield* read).mcp;
    assert.strictEqual(entry.name, "gamma");
    assert.strictEqual(entry.origin.name, "io.github.c/gamma");
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("mcp add rejects a short search term without calling the Registry", () =>
  Effect.gen(function* () {
    const { file, fs, before } = yield* setup;
    const result = yield* runCli(["mcp", "add", "--set", file], {
      tty: true,
      keys: [type("ab"), enter],
    });
    assert.strictEqual(result.code, 1);
    assert.include(result.err.join("\n"), "Search term must be at least 3 characters.");
    assert.strictEqual(yield* fs.readFileString(file), before);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("mcp add explains a Registry that rejects the search term", () =>
  Effect.gen(function* () {
    const { file } = yield* setup;
    const fetch = cannedFetch({
      [listUrl("xyz")]: () =>
        json({ detail: "search must contain at least 3 characters" }, { status: 422 }),
    });
    const result = yield* runCli(["mcp", "add", "--set", file], {
      tty: true,
      fetch,
      keys: [type("xyz"), enter],
    });
    assert.strictEqual(result.code, 1);
    assert.include(result.err.join("\n"), "at least 3 characters");
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("mcp add reports a search without matches", () =>
  Effect.gen(function* () {
    const { file, fs, before } = yield* setup;
    const fetch = cannedFetch({ [listUrl("zzz")]: page([]) });
    const result = yield* runCli(["mcp", "add", "--set", file], {
      tty: true,
      fetch,
      keys: [type("zzz"), enter],
    });
    assert.strictEqual(result.code, 1);
    assert.include(result.err.join("\n"), 'No servers match "zzz"');
    assert.strictEqual(yield* fs.readFileString(file), before);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("mcp add loads further result pages on request", () =>
  Effect.gen(function* () {
    const { file, read } = yield* setup;
    const requested: Array<string> = [];
    const fetch = cannedFetch(
      {
        [listUrl("srv")]: page([named("io.github.a/first")], "opaque/cursor=="),
        [listUrl("srv", "opaque%2Fcursor%3D%3D")]: page([named("io.github.a/second")]),
      },
      requested,
    );
    const result = yield* runCli(["mcp", "add", "--set", file], {
      tty: true,
      fetch,
      // Load more is listed after the first page; the second page's server is then the second choice.
      keys: [type("srv"), enter, down, enter, down, enter, key("n", "n")],
    });
    assert.deepStrictEqual(result.err, []);
    assert.deepStrictEqual(requested, [listUrl("srv"), listUrl("srv", "opaque%2Fcursor%3D%3D")]);
    assert.include(result.screen.join(""), "Load more");
    const [entry] = (yield* read).mcp;
    assert.strictEqual(entry.origin.name, "io.github.a/second");
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("mcp add stores only the package or remote the user picks", () =>
  Effect.gen(function* () {
    const { file, read } = yield* setup;
    const fetch = cannedFetch({ [listUrl("git")]: page([both]) });
    const result = yield* runCli(["mcp", "add", "--set", file], {
      tty: true,
      fetch,
      keys: [type("git"), enter, enter, down, enter, key("n", "n")],
    });
    assert.deepStrictEqual(result.err, []);
    const screen = result.screen.join("");
    assert.include(screen, "ghcr.io/github/github-mcp-server:2.2.0");
    assert.include(screen, "https://api.githubcopilot.com/mcp/");
    const [entry] = (yield* read).mcp;
    assert.strictEqual(entry.launch.type, "remote");
    assert.strictEqual(entry.launch.url, "https://api.githubcopilot.com/mcp/");
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("mcp add -y takes the first package, then the first remote", () =>
  Effect.gen(function* () {
    const { file, read } = yield* setup;
    const fetch = cannedFetch({
      [`${OFFICIAL}/v0.1/servers/io.github.github%2Fgithub-mcp-server/versions/latest`]: json(both),
    });
    const result = yield* runCli(
      ["mcp", "add", "io.github.github/github-mcp-server", "-y", "--set", file],
      { fetch },
    );
    assert.deepStrictEqual(result.err, []);
    const [entry] = (yield* read).mcp;
    assert.strictEqual(entry.launch.type, "package");
    assert.strictEqual(entry.launch.registryType, "oci");
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("mcp add -y without a name fails with a usage message", () =>
  Effect.gen(function* () {
    const { file, fs, before } = yield* setup;
    const result = yield* runCli(["mcp", "add", "-y", "--set", file]);
    assert.strictEqual(result.code, 1);
    assert.include(result.err.join("\n"), "Usage: skillset mcp add");
    assert.strictEqual(yield* fs.readFileString(file), before);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect.each([
  { prompt: "search term", keys: [key("escape")] },
  { prompt: "server picker", keys: [type("git"), enter, key("escape")] },
  { prompt: "package picker", keys: [type("git"), enter, enter, key("escape")] },
])("mcp add writes nothing when the $prompt is quit", ({ keys }) =>
  Effect.gen(function* () {
    const { file, fs, before } = yield* setup;
    const fetch = cannedFetch({ [listUrl("git")]: page([both]) });
    const result = yield* runCli(["mcp", "add", "--set", file], { tty: true, fetch, keys });
    assert.include(result.out, "Cancelled");
    assert.strictEqual(yield* fs.readFileString(file), before);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);
