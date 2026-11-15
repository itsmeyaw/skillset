import { execFileSync } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
  const configKeys = ["GIT_CONFIG_COUNT", "GIT_CONFIG_KEY_0", "GIT_CONFIG_VALUE_0"] as const;
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
    process.env.GIT_CONFIG_COUNT = "1";
    process.env.GIT_CONFIG_KEY_0 = `url.${source}.insteadOf`;
    process.env.GIT_CONFIG_VALUE_0 = "https://github.com/local/repo.git";
    const result = await Effect.runPromise(
      Upstream.use((upstream) =>
        Effect.gen(function* () {
          expect(yield* upstream.listSkills(source, commit)).toEqual(["example"]);
          expect(yield* upstream.listSkills("local/repo.git", commit)).toEqual(["example"]);
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
          return yield* upstream.install(resolved, { cwd }).pipe(Effect.flip);
        }),
      ).pipe(Effect.provide(Layer.provide(UpstreamLive, NodeServices.layer))),
    );
    expect(result.message).toContain("disposed");
    expect(await readFile(join(cwd, ".agents/skills/example/SKILL.md"), "utf8")).toContain(
      "Pinned content.",
    );
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
        ]),
      ).pipe(Effect.provide(Layer.provide(UpstreamLive, NodeServices.layer))),
    );
    expect(result.slice(0, 5)).toEqual([commit, commit, tagged, tagged, tagged]);
    expect(result[5].message).toContain("missing");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
