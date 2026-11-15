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
import { Upstream } from "../src/upstream.ts";
import { selectRemoteCommit, UpstreamLive } from "../src/upstream-live.ts";

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
    const error = await Effect.runPromise(
      Upstream.use((upstream) => upstream.resolveCommit(`ext::${script}`).pipe(Effect.flip)).pipe(
        Effect.provide(Layer.provide(UpstreamLive, NodeServices.layer)),
      ),
    );
    expect(error.message).toContain("Unsupported Git transport");
    const installError = await Effect.runPromise(
      Upstream.use((upstream) =>
        Effect.scoped(upstream.resolveSource(`ext::${script}`, "a".repeat(40))).pipe(Effect.flip),
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

it("keeps a pinned source for installation and disposes it at scope exit", async () => {
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
    const result = await Effect.runPromise(
      Upstream.use((upstream) =>
        Effect.gen(function* () {
          expect(yield* upstream.listSkills(source, commit)).toEqual(["example"]);
          expect(yield* upstream.listSkills("local/repo.git", commit)).toEqual(["example"]);
          // git-config(1): both remote spellings resolve to the local fixture without network access.
          expect(yield* upstream.resolveCommit("https://git.example.test/team/repo")).toBe(
            git("-C", "repo", "rev-parse", "HEAD"),
          );
          expect(yield* upstream.listSkills("https://git.example.test/team/repo", commit)).toEqual([
            "example",
          ]);
          yield* Effect.scoped(
            Effect.gen(function* () {
              const handle = yield* upstream.resolveSource(
                "https://git.example.test/team/repo#main",
                commit,
              );
              expect(handle.source.input).toBe("https::https://git.example.test/team/repo");
              expect(handle.source.commit).toBe(commit);
              expect(handle.skills.map((skill) => skill.name)).toEqual(["example"]);
            }),
          );
          yield* Effect.scoped(
            Effect.gen(function* () {
              const handle = yield* upstream.resolveSource(
                "http://git.example.test/team/repo?token=keep",
                commit,
              );
              expect(handle.source.input).toBe(
                "http::http://git.example.test/team/repo?token=keep",
              );
              expect(handle.source.commit).toBe(commit);
            }),
          );
          const rootError = yield* Effect.scoped(
            upstream.resolveSource("https://git.example.test", commit),
          ).pipe(Effect.flip);
          expect(rootError.message).toMatch(/URLs cannot be pinned/);
          const indexError = yield* Effect.scoped(
            upstream.resolveSource(
              "https://git.example.test/.well-known/agent-skills/index.json",
              commit,
            ),
          ).pipe(Effect.flip);
          expect(indexError.message).toContain("Well-known URLs cannot be pinned");
          expect((yield* upstream.getSupportedAgents).map((agent) => agent.id)).toContain(
            "universal",
          );
          expect((yield* upstream.detectAgents({ cwd })).agents).toBeInstanceOf(Array);
          const resolved = yield* Effect.scoped(
            Effect.gen(function* () {
              const handle = yield* upstream.resolveSource(source, commit);
              expect(handle.source.commit).toBe(commit);
              expect(handle.skills.map((skill) => skill.name)).toContain("example");
              const installed = yield* upstream.install(handle, {
                cwd,
                agents: ["universal"],
                skills: ["example"],
                mode: "copy",
                telemetry: false,
              });
              expect(installed.failed).toEqual([]);
              return handle;
            }),
          );
          const missing = yield* Effect.scoped(upstream.resolveSource(source, "f".repeat(40))).pipe(
            Effect.flip,
          );
          expect(missing.message).not.toBe("");
          const failedHandle = yield* Effect.scoped(
            Effect.gen(function* () {
              const handle = yield* upstream.resolveSource(source, commit).pipe(Effect.orDie);
              return yield* Effect.fail(handle);
            }),
          ).pipe(Effect.flip);
          const afterFailure = yield* upstream.install(failedHandle, { cwd }).pipe(Effect.flip);
          expect(afterFailure.message).toContain("disposed");
          return yield* upstream.install(resolved, { cwd }).pipe(Effect.flip);
        }),
      ).pipe(Effect.provide(Layer.provide(UpstreamLive, NodeServices.layer))),
    );
    expect(result.message).toContain("disposed");
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

it("resolves branches, tags, HEAD and full SHAs in a local bare git repository", async () => {
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
          upstream.resolveCommit(join(cwd, "repo.git")),
          upstream.resolveCommit(join(cwd, "repo.git"), "main"),
          upstream.resolveCommit(join(cwd, "repo.git"), "v1.0.0"),
          upstream.resolveCommit(join(cwd, "repo.git"), "v2.0.0"),
          upstream.resolveCommit("no-such-remote", tagged),
          upstream.resolveCommit(join(cwd, "repo.git"), "missing").pipe(Effect.flip),
          upstream
            .resolveCommit(join(cwd, "repo.git"), "feature", ["feature/docs", "feature/docs/skill"])
            .pipe(Effect.flip),
          upstream.resolveCommit(join(cwd, "repo.git"), "main", ["main/skill"]),
          upstream
            .resolveCommit(join(cwd, "repo.git"), "another", ["another/docs"])
            .pipe(Effect.flip),
        ]),
      ).pipe(Effect.provide(Layer.provide(UpstreamLive, NodeServices.layer))),
    );
    expect(result.slice(0, 5)).toEqual([commit, commit, tagged, tagged, tagged]);
    expect(result[5].message).toContain("missing");
    expect(result[6].message).toMatch(/ambiguous.*#.*-s/i);
    expect(result[7]).toBe(commit);
    expect(result[8].message).toMatch(/ambiguous.*#.*-s/i);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

it("resolves a suffixless HTTP Git repository without changing its path", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "skillset-http-"));
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
        Effect.scoped(
          Effect.gen(function* () {
            const commit = yield* upstream.resolveCommit(source);
            const handle = yield* upstream.resolveSource(source, commit);
            expect(handle.source.input).toBe(`http::${source}`);
            expect(handle.source.commit).toBe(commit);
            expect(handle.skills.map((skill) => skill.name)).toEqual(["example"]);
            const installed = yield* upstream.install(handle, {
              cwd,
              agents: ["universal"],
              skills: ["example"],
              mode: "copy",
              telemetry: false,
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
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(cwd, { recursive: true, force: true });
  }
});
