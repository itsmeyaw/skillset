import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { NodeServices } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { expect, it } from "vitest";
import { makePinning } from "../src/pinning.ts";
import { Upstream } from "../src/upstream.ts";
import { assertPin, selectRemoteCommit, UpstreamLive } from "../src/upstream-live.ts";

it("rejects a source whose resolved commit differs from its Pin", async () => {
  const commit = "a".repeat(40);
  const handle = { source: { commit: "b".repeat(40) } };
  const error = await Effect.runPromise(assertPin(handle, commit).pipe(Effect.flip));
  expect(error.message).toBe(`Source did not resolve to Pin ${commit}`);
  const missing = await Effect.runPromise(assertPin({ source: {} }, commit).pipe(Effect.flip));
  expect(missing.message).toBe(`Source did not resolve to Pin ${commit}`);
  expect(await Effect.runPromise(assertPin({ source: { commit } }, commit))).toEqual({
    source: { commit },
  });
});

it("selects the default branch commit from git ls-remote output", () => {
  const output = "0123456789abcdef0123456789abcdef01234567\tHEAD\n";
  expect(selectRemoteCommit(output)).toBe("0123456789abcdef0123456789abcdef01234567");
});

it("rejects the executable git ext transport", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "skillset-ext-"));
  const previous = process.env.GIT_ALLOW_PROTOCOL;
  try {
    const marker = join(cwd, "executed");
    const script = join(cwd, "remote-helper");
    await writeFile(script, `#!/bin/sh\nprintf ran > '${marker}'\n`, { mode: 0o755 });
    process.env.GIT_ALLOW_PROTOCOL = "ext";
    const boundaryErrors = await Effect.runPromise(
      Upstream.use((upstream) =>
        upstream.withSession((session) =>
          Effect.all([
            upstream.resolveRefs(`ext::${script}`, [undefined]).pipe(Effect.flip),
            session.list(`ext::${script}`, "a".repeat(40)).pipe(Effect.flip),
          ]),
        ),
      ).pipe(Effect.provide(Layer.provide(UpstreamLive, NodeServices.layer))),
    );
    expect(boundaryErrors.map((error) => error.message)).toEqual([
      "Unsupported Git transport: ext",
      "Unsupported Git transport: ext",
    ]);
    const error = await Effect.runPromise(
      Upstream.use((upstream) =>
        upstream.withSession((session) =>
          Effect.gen(function* () {
            const pinning = yield* makePinning(session);
            return yield* pinning.resolve(`ext::${script}`).pipe(Effect.flip);
          }),
        ),
      ).pipe(Effect.provide(Layer.provide(UpstreamLive, NodeServices.layer))),
    );
    expect(error.message).toContain("Unsupported Git transport");
    const installError = await Effect.runPromise(
      Upstream.use((upstream) =>
        upstream.withSession((session) =>
          session
            .install([{ name: "example", source: `ext::${script}`, commit: "a".repeat(40) }], {
              scope: "project",
              mode: "copy",
            })
            .pipe(Effect.flip),
        ),
      ).pipe(Effect.provide(Layer.provide(UpstreamLive, NodeServices.layer))),
    );
    expect(installError.message).toContain("Unsupported Git transport");
    await expect(access(marker)).rejects.toThrow();
  } finally {
    if (previous === undefined) delete process.env.GIT_ALLOW_PROTOCOL;
    else process.env.GIT_ALLOW_PROTOCOL = previous;
    await rm(cwd, { recursive: true, force: true });
  }
});

it("lists and installs a pinned source", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "skillset-source-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  const configKeys = [
    "GIT_CONFIG_COUNT",
    "GIT_CONFIG_KEY_0",
    "GIT_CONFIG_VALUE_0",
    "GIT_CONFIG_KEY_1",
    "GIT_CONFIG_VALUE_1",
    "GIT_CONFIG_KEY_2",
    "GIT_CONFIG_VALUE_2",
    "GIT_CONFIG_KEY_3",
    "GIT_CONFIG_VALUE_3",
    "GIT_CONFIG_KEY_4",
    "GIT_CONFIG_VALUE_4",
    "DISABLE_TELEMETRY",
  ] as const;
  const previousConfig = configKeys.map((key) => process.env[key]);
  try {
    git("init", "-q", "-b", "main", "repo");
    git("-C", "repo", "config", "user.name", "Test");
    git("-C", "repo", "config", "user.email", "test@example.com");
    await mkdir(join(cwd, "repo", "skills", "example"), { recursive: true });
    await writeFile(
      join(cwd, "repo", "skills", "example", "SKILL.md"),
      "---\nname: example\ndescription: An example skill\n---\nPinned content.\n",
    );
    git("-C", "repo", "add", ".");
    git("-C", "repo", "commit", "-qm", "first");
    const commit = git("-C", "repo", "rev-parse", "HEAD");
    await writeFile(
      join(cwd, "repo", "skills", "example", "SKILL.md"),
      "---\nname: example\ndescription: An example skill\n---\nUnpinned content.\n",
    );
    git("-C", "repo", "commit", "-qam", "second");
    const source = pathToFileURL(join(cwd, "repo")).href;
    // git-config(1): rewrite the shorthand clone URL to a local repository without network access.
    process.env.GIT_CONFIG_COUNT = "5";
    process.env.DISABLE_TELEMETRY = "1";
    process.env.GIT_CONFIG_KEY_0 = `url.${source}.insteadOf`;
    process.env.GIT_CONFIG_VALUE_0 = "https://github.com/local/repo.git";
    process.env.GIT_CONFIG_KEY_1 = `url.${source}.insteadOf`;
    process.env.GIT_CONFIG_VALUE_1 = "https://git.example.test/team/repo";
    process.env.GIT_CONFIG_KEY_2 = `url.${source}.insteadOf`;
    process.env.GIT_CONFIG_VALUE_2 = "https::https://git.example.test/team/repo";
    process.env.GIT_CONFIG_KEY_3 = `url.${source}.insteadOf`;
    process.env.GIT_CONFIG_VALUE_3 = "http::http://git.example.test/team/repo?token=keep";
    process.env.GIT_CONFIG_KEY_4 = `url.${source}.insteadOf`;
    process.env.GIT_CONFIG_VALUE_4 =
      "https::https://git.example.test/.well-known/agent-skills/index.json";
    await Effect.runPromise(
      Upstream.use((upstream) =>
        upstream.withSession((session) =>
          Effect.gen(function* () {
            expect(
              (yield* session.list(source, commit)).map(({ name, description }) => ({
                name,
                description,
              })),
            ).toEqual([{ name: "example", description: "An example skill" }]);
            expect(
              (yield* session.list("https://github.com/local/repo.git", commit)).map(
                (skill) => skill.name,
              ),
            ).toEqual(["example"]);
            // git-config(1): both remote spellings resolve to the local fixture without network access.
            expect(
              (yield* upstream.resolveRefs("https://git.example.test/team/repo", [undefined]))[0],
            ).toBe(git("-C", "repo", "rev-parse", "HEAD"));
            expect(
              (yield* session.list("https://git.example.test/team/repo", commit)).map(
                (skill) => skill.name,
              ),
            ).toEqual(["example"]);
            expect(
              (yield* session.list("http://git.example.test/team/repo?token=keep", commit)).map(
                (skill) => skill.name,
              ),
            ).toEqual(["example"]);
            yield* upstream.withSession((session) =>
              Effect.gen(function* () {
                const rootError = yield* session
                  .install([{ name: "example", source: "https://git.example.test", commit }], {
                    scope: "project",
                    mode: "copy",
                  })
                  .pipe(Effect.flip);
                expect(rootError.message).toMatch(/URLs cannot be pinned/);
                const indexError = yield* session
                  .install(
                    [
                      {
                        name: "example",
                        source: "https://git.example.test/.well-known/agent-skills/index.json",
                        commit,
                      },
                    ],
                    { scope: "project", mode: "copy" },
                  )
                  .pipe(Effect.flip);
                expect(indexError.message).toContain("Well-known URLs cannot be pinned");
              }),
            );
            expect((yield* upstream.getSupportedAgents).map((agent) => agent.id)).toContain(
              "universal",
            );
            expect((yield* upstream.detectAgents({ cwd })).agents).toBeInstanceOf(Array);
            const installed = yield* session.install(
              [{ name: "example", source: "https://github.com/local/repo.git", commit }],
              { cwd, agents: ["universal"], scope: "project", mode: "copy" },
            );
            expect(installed.failed).toEqual([]);
            const missing = yield* session.list(source, "f".repeat(40)).pipe(Effect.flip);
            expect(missing.message).not.toBe("");
          }),
        ),
      ).pipe(Effect.provide(Layer.provide(UpstreamLive, NodeServices.layer))),
    );
    expect(await readFile(join(cwd, ".agents/skills/example/SKILL.md"), "utf8")).toContain(
      "Pinned content.",
    );
    const lock = JSON.parse(await readFile(join(cwd, "skills-lock.json"), "utf8"));
    expect(lock.skills.example).toBeDefined();
  } finally {
    for (const [index, key] of configKeys.entries()) {
      const previous = previousConfig[index];
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    }
    await rm(cwd, { recursive: true, force: true });
  }
});

it("prefers the peeled commit over an annotated tag object", () => {
  const output = [
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\trefs/tags/v1.0.0",
    "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\trefs/tags/v1.0.0^{}",
    "cccccccccccccccccccccccccccccccccccccccc\trefs/heads/v1.0.0",
  ].join("\n");
  expect(selectRemoteCommit(output, "v1.0.0")).toBe("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
});

it("selects exact branch and lightweight tag refs from fixtures", () => {
  const output = [
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\trefs/heads/other/main",
    "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\trefs/heads/main",
    "cccccccccccccccccccccccccccccccccccccccc\trefs/tags/v1.2.3",
    "not-a-sha\trefs/heads/broken",
  ].join("\n");
  expect(selectRemoteCommit(output, "main")).toBe("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
  expect(selectRemoteCommit(output, "v1.2.3")).toBe("cccccccccccccccccccccccccccccccccccccccc");
  expect(selectRemoteCommit(output, "broken")).toBeUndefined();
  expect(selectRemoteCommit(output, "missing")).toBeUndefined();
});

it("looks up branches, tags and HEAD in a local bare git repository", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "skillset-git-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  try {
    git("init", "-q", "-b", "main", "work");
    git("-C", "work", "config", "user.name", "Test");
    git("-C", "work", "config", "user.email", "test@example.com");
    await writeFile(join(cwd, "work", "file"), "test\n");
    git("-C", "work", "add", "file");
    git("-C", "work", "commit", "-qm", "first");
    const tagged = git("-C", "work", "rev-parse", "HEAD");
    git("-C", "work", "tag", "v1.0.0");
    git("-C", "work", "tag", "-a", "v2.0.0", "-m", "annotated");
    git("-C", "work", "tag", "feature");
    git("-C", "work", "branch", "feature/docs");
    git("-C", "work", "branch", "another/docs");
    await writeFile(join(cwd, "work", "file"), "second\n");
    git("-C", "work", "commit", "-qam", "second");
    const commit = git("-C", "work", "rev-parse", "HEAD");
    git("clone", "-q", "--bare", "work", "repo.git");
    const result = await Effect.runPromise(
      Upstream.use((upstream) =>
        Effect.all([
          upstream.resolveRefs(join(cwd, "repo.git"), [
            undefined,
            "main",
            "v1.0.0",
            "v2.0.0",
            "missing",
            "feature",
            "feature/docs",
            "feature/docs/skill",
            "another",
            "another/docs",
          ]),
        ]),
      ).pipe(Effect.provide(Layer.provide(UpstreamLive, NodeServices.layer))),
    );
    expect(result[0]).toEqual([
      commit,
      commit,
      tagged,
      tagged,
      undefined,
      tagged,
      tagged,
      undefined,
      undefined,
      tagged,
    ]);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

it("resolves a suffixless HTTP Git repository without changing its path", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "skillset-http-"));
  const telemetry = process.env.DISABLE_TELEMETRY;
  process.env.DISABLE_TELEMETRY = "1";
  const git = (...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  const paths: Array<string> = [];
  // git-http-backend(1): serve the local bare repository using the smart HTTP protocol.
  const server = createServer((request, response) => {
    const url = new URL(request.url!, "http://localhost");
    paths.push(url.pathname);
    const backend = spawn("git", ["http-backend"], {
      env: {
        ...process.env,
        GIT_PROJECT_ROOT: cwd,
        GIT_HTTP_EXPORT_ALL: "1",
        PATH_INFO: url.pathname,
        QUERY_STRING: url.search.slice(1),
        REQUEST_METHOD: request.method,
        CONTENT_TYPE: request.headers["content-type"],
        CONTENT_LENGTH: request.headers["content-length"],
      },
    });
    request.pipe(backend.stdin);
    let headers = Buffer.alloc(0);
    let started = false;
    backend.stdout.on("data", (chunk: Buffer) => {
      if (started) return void response.write(chunk);
      headers = Buffer.concat([headers, chunk]);
      const boundary = headers.indexOf("\r\n\r\n");
      if (boundary === -1) return;
      const fields = headers.subarray(0, boundary).toString().split("\r\n");
      const status = fields.find((field) => field.toLowerCase().startsWith("status:"));
      const contentType = fields.find((field) => field.toLowerCase().startsWith("content-type:"));
      response.writeHead(
        status ? Number(status.split(" ")[1]) : 200,
        contentType ? { "content-type": contentType.slice("content-type:".length).trim() } : {},
      );
      started = true;
      response.write(headers.subarray(boundary + 4));
    });
    backend.stdout.on("end", () => response.end());
    backend.stderr.resume();
  });
  try {
    git("init", "-q", "-b", "main", "work");
    git("-C", "work", "config", "user.name", "Test");
    git("-C", "work", "config", "user.email", "test@example.com");
    await mkdir(join(cwd, "work", "skills", "example"), { recursive: true });
    await writeFile(
      join(cwd, "work", "skills", "example", "SKILL.md"),
      "---\nname: example\ndescription: An example skill\n---\nPinned content.\n",
    );
    git("-C", "work", "add", ".");
    git("-C", "work", "commit", "-qm", "first");
    git("clone", "-q", "--bare", "work", "repo");
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("Missing HTTP address");
    const source = `http://127.0.0.1:${address.port}/repo`;
    await Effect.runPromise(
      Upstream.use((upstream) =>
        upstream.withSession((session) =>
          Effect.gen(function* () {
            const [commit] = yield* upstream.resolveRefs(source, [undefined]);
            if (commit === undefined) throw new Error("Missing commit");
            expect((yield* session.list(source, commit)).map((skill) => skill.name)).toEqual([
              "example",
            ]);
            const installed = yield* session.install([{ name: "example", source, commit }], {
              cwd,
              agents: ["universal"],
              scope: "project",
              mode: "copy",
            });
            expect(installed.failed).toEqual([]);
          }),
        ),
      ).pipe(Effect.provide(Layer.provide(UpstreamLive, NodeServices.layer))),
    );
    expect(paths.some((path) => path === "/repo/info/refs")).toBe(true);
    expect(paths.every((path) => path.startsWith("/repo/"))).toBe(true);
    expect(await readFile(join(cwd, ".agents/skills/example/SKILL.md"), "utf8")).toContain(
      "Pinned content.",
    );
    const lock = JSON.parse(await readFile(join(cwd, "skills-lock.json"), "utf8"));
    expect(lock.skills.example.sourceUrl).toBe(`http::${source}`);
  } finally {
    if (telemetry === undefined) delete process.env.DISABLE_TELEMETRY;
    else process.env.DISABLE_TELEMETRY = telemetry;
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(cwd, { recursive: true, force: true });
  }
});
