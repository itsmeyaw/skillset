import { NodeFileSystem } from "@effect/platform-node";
import { assert, it } from "@effect/vitest";
import { Effect, FileSystem } from "effect";
import { fetchSkillset } from "../src/remote-skillset.ts";
import { SCHEMA_URL } from "../src/skillset-file.ts";
import { key, runCli } from "./harness.ts";

const url = "https://example.com/team.json";
const commit = "a".repeat(40);
const skillset = {
  $schema: SCHEMA_URL,
  skills: [{ name: "alpha", source: "owner/repo", commit }],
} as const;
const response = () => new Response(JSON.stringify(skillset));
const fetchResponse =
  (make: () => Response): typeof fetch =>
  async () =>
    make();

it.effect("rewrites GitHub blob URLs and follows HTTPS redirects with one timeout", () =>
  Effect.gen(function* () {
    const requests: Array<string> = [];
    const signals: Array<AbortSignal | null | undefined> = [];
    const fetchRemote: typeof fetch = async (input, init) => {
      requests.push(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      signals.push(init?.signal);
      assert.strictEqual(init?.redirect, "manual");
      return requests.length === 1
        ? new Response(null, { status: 302, headers: { location: "/next.json" } })
        : response();
    };
    const result = yield* fetchSkillset(
      "HTTPS://github.com/owner/repo/blob/main/sets/team.json",
      fetchRemote,
    );
    assert.deepStrictEqual(result, skillset);
    assert.deepStrictEqual(requests, [
      "https://raw.githubusercontent.com/owner/repo/main/sets/team.json",
      "https://raw.githubusercontent.com/next.json",
    ]);
    assert.isDefined(signals[0]);
    assert.strictEqual(signals[0], signals[1]);
  }),
);

it.effect.each([
  { name: "HTTP status", make: () => new Response("no", { status: 404 }), message: /HTTP 404/ },
  {
    name: "HTTP status with failing body cancellation",
    make: () =>
      new Response(
        new ReadableStream({ cancel: () => Promise.reject(new Error("cancel failed")) }),
        { status: 500 },
      ),
    message: /HTTP 500/,
  },
  { name: "schema", make: () => new Response('{"skills":[]}'), message: /Invalid Skillset file/ },
  { name: "JSON", make: () => new Response("{"), message: /Invalid Skillset file/ },
  {
    name: "content length",
    make: () => new Response("small", { headers: { "content-length": "1048577" } }),
    message: /exceeds 1 MB/,
  },
  { name: "actual bytes", make: () => new Response("é".repeat(524289)), message: /exceeds 1 MB/ },
  {
    name: "underreported content length",
    make: () => new Response("x".repeat(1048577), { headers: { "content-length": "1" } }),
    message: /exceeds 1 MB/,
  },
  { name: "not modified", make: () => new Response(null, { status: 304 }), message: /HTTP 304/ },
  {
    name: "insecure redirect",
    make: () => new Response(null, { status: 302, headers: { location: "http://example.com/x" } }),
    message: /HTTPS/,
  },
])("rejects $name with the original URL", ({ make, message }) =>
  Effect.gen(function* () {
    let calls = 0;
    const fetchRemote: typeof fetch = async () => {
      calls++;
      return make();
    };
    const result = yield* Effect.result(fetchSkillset(url, fetchRemote));
    assert.strictEqual(result._tag, "Failure");
    if (result._tag === "Failure") {
      assert.include(result.failure.message, url);
      assert.match(result.failure.message, message);
    }
    assert.strictEqual(calls, 1);
  }),
);

it.effect("accepts a body exactly 1 MB and rejects redirect loops", () =>
  Effect.gen(function* () {
    const json = JSON.stringify(skillset);
    const loaded = yield* fetchSkillset(
      url,
      fetchResponse(() => new Response(json + " ".repeat(1048576 - json.length))),
    );
    assert.deepStrictEqual(loaded, skillset);
    let calls = 0;
    const result = yield* Effect.result(
      fetchSkillset(url, async () => {
        calls++;
        return new Response(null, { status: 302, headers: { location: url } });
      }),
    );
    assert.strictEqual(result._tag, "Failure");
    if (result._tag === "Failure") assert.match(result.failure.message, /Too many redirects/);
    assert.strictEqual(calls, 21);
  }),
);

it.effect("cancels a multi-chunk body once it exceeds the limit", () =>
  Effect.gen(function* () {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull: (controller) => controller.enqueue(new Uint8Array(600_000)),
      cancel: () => {
        cancelled = true;
      },
    });
    const result = yield* Effect.result(
      fetchSkillset(
        url,
        fetchResponse(() => new Response(body)),
      ),
    );
    assert.strictEqual(result._tag, "Failure");
    if (result._tag === "Failure") assert.match(result.failure.message, /exceeds 1 MB/);
    assert.isTrue(cancelled);
  }),
);

it.effect("lists a Remote Skillset", () =>
  Effect.gen(function* () {
    const result = yield* runCli(["ls", "--set", url], { fetch: fetchResponse(response) });
    assert.strictEqual(result.code, 0);
    assert.include(result.out.join("\n"), "alpha  owner/repo  aaaaaaa");
  }),
);

it.effect.each([
  ["install", url, "-y"],
  ["install", "--set", url, "-y"],
])("installs a Remote Skillset without caching: %s", (argv) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    let calls = 0;
    const fetchRemote: typeof fetch = async () => {
      calls++;
      return response();
    };
    const result = yield* runCli(argv, {
      tty: true,
      fetch: fetchRemote,
      upstream: {
        skills: { [JSON.stringify(["https://github.com/owner/repo.git", commit])]: ["alpha"] },
        installDir: dir,
      },
    });
    assert.strictEqual(result.code, 0);
    assert.deepStrictEqual(result.screen, []);
    assert.strictEqual(calls, 1);
    assert.strictEqual(
      yield* fs.readFileString(`${dir}/project/universal/alpha`),
      `${commit}:auto`,
    );
    assert.deepStrictEqual(yield* fs.readDirectory(dir), ["project"]);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("declining a Remote Skillset lists all Entries and writes nothing", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const calls: Array<string> = [];
    const result = yield* runCli(["install", url], {
      tty: true,
      keys: [key("n", "n")],
      fetch: fetchResponse(response),
      upstream: { installDir: dir, calls },
    });
    assert.strictEqual(result.code, 0);
    assert.match(result.screen.join(""), /Install this Remote Skillset\?/);
    assert.include(result.out.join("\n"), "alpha  owner/repo  aaaaaaa");
    assert.deepStrictEqual(calls, []);
    assert.deepStrictEqual(yield* fs.readDirectory(dir), []);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("accepting the Remote Skillset prompt continues to installation", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const result = yield* runCli(["install", url, "-s", "alpha", "-a", "cursor", "-g", "--copy"], {
      tty: true,
      keys: [key("y", "y"), key("y", "y")],
      fetch: fetchResponse(response),
      upstream: {
        skills: { [JSON.stringify(["https://github.com/owner/repo.git", commit])]: ["alpha"] },
        installDir: dir,
      },
    });
    assert.strictEqual(result.code, 0);
    assert.strictEqual(yield* fs.readFileString(`${dir}/global/cursor/alpha`), `${commit}:copy`);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("quitting the Remote Skillset confirmation reports cancellation", () =>
  Effect.gen(function* () {
    const result = yield* runCli(["install", url], {
      tty: true,
      keys: [key("escape")],
      fetch: fetchResponse(response),
    });
    assert.strictEqual(result.code, 130);
    assert.include(result.out.join("\n"), "Cancelled");
  }),
);

it.effect("unattended Remote Skillset installation requires -y", () =>
  Effect.gen(function* () {
    const result = yield* runCli(["install", url], { fetch: fetchResponse(response) });
    assert.strictEqual(result.code, 1);
    assert.include(result.err.join("\n"), "use -y");
    assert.include(result.out.join("\n"), "alpha  owner/repo  aaaaaaa");
  }),
);

it.effect.each([
  ["add", "owner/repo", "--set", url, "--install", "-y"],
  ["remove", "alpha", "--set", url, "-y"],
  ["update", "--set", url],
])("rejects Remote Skillsets outside install: %s", (argv) =>
  Effect.gen(function* () {
    const result = yield* runCli(argv, {
      fetch: () => Promise.reject(new Error("unexpected fetch")),
    });
    assert.strictEqual(result.code, 1);
    assert.include(result.err.join("\n"), "Remote Skillsets can only be installed or listed.");
  }),
);

it.effect.each([
  ["install", "http://example.com/team.json", "-y"],
  ["install", "--set", "HTTP://example.com/team.json", "-y"],
  ["ls", "--set", "http://example.com/team.json"],
])("rejects insecure Skillset URLs before fetching: %s", (argv) =>
  Effect.gen(function* () {
    const result = yield* runCli(argv, {
      fetch: () => Promise.reject(new Error("unexpected fetch")),
    });
    assert.strictEqual(result.code, 1);
    assert.include(result.err.join("\n"), "must use HTTPS");
  }),
);
