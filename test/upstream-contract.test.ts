import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { NodeServices } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Upstream } from "../src/upstream.ts";
import { UpstreamLive } from "../src/upstream-live.ts";
import { fakeUpstream } from "./harness.ts";

describe.each(["live", "fake"] as const)("%s Upstream install contract", (adapter) => {
  let cwd: string;
  let commit: string;
  let later: string;
  const source = "https://github.com/contract/repo.git";
  const previous: Record<string, string | undefined> = {};

  beforeEach(async () => {
    if (adapter === "live")
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(null, { status: 404 })),
      );
    cwd = await mkdtemp(join(tmpdir(), "skillset-contract-"));
    const git = (...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
    git("init", "-q", "-b", "main", "work");
    git("-C", "work", "config", "user.name", "Test");
    git("-C", "work", "config", "user.email", "test@example.com");
    await mkdir(join(cwd, "work", "skills", "alpha"), { recursive: true });
    await writeFile(
      join(cwd, "work", "skills", "alpha", "SKILL.md"),
      "---\nname: alpha\ndescription: First skill\n---\nPinned content.\n",
    );
    await mkdir(join(cwd, "work", "skills", "beta"), { recursive: true });
    await writeFile(
      join(cwd, "work", "skills", "beta", "SKILL.md"),
      "---\nname: beta\ndescription: Second skill\n---\nOld beta.\n",
    );
    git("-C", "work", "add", ".");
    git("-C", "work", "commit", "-qm", "first");
    commit = git("-C", "work", "rev-parse", "HEAD");
    await writeFile(
      join(cwd, "work", "skills", "alpha", "SKILL.md"),
      "---\nname: alpha\ndescription: First skill\n---\nUnpinned content.\n",
    );
    await writeFile(
      join(cwd, "work", "skills", "beta", "SKILL.md"),
      "---\nname: beta\ndescription: Second skill\n---\nNew beta.\n",
    );
    git("-C", "work", "commit", "-qam", "second");
    later = git("-C", "work", "rev-parse", "HEAD");
    git("clone", "-q", "--bare", "work", "repo.git");
    for (const [key, value] of Object.entries({
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: `url.${pathToFileURL(join(cwd, "repo.git")).href}.insteadOf`,
      GIT_CONFIG_VALUE_0: source,
      GIT_ALLOW_PROTOCOL: "file",
      DISABLE_TELEMETRY: "1",
      AI_AGENT: "augment-cli",
    })) {
      previous[key] = process.env[key];
      process.env[key] = value;
    }
  });

  afterEach(async () => {
    if (adapter === "live") vi.unstubAllGlobals();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(cwd, { recursive: true, force: true });
  });

  it("installs Entries at their Pins", async () => {
    const layer =
      adapter === "live"
        ? Layer.provide(UpstreamLive, NodeServices.layer)
        : fakeUpstream({
            skills: { [JSON.stringify([source, commit])]: ["alpha"] },
            installDir: cwd,
          });
    const result = await Effect.runPromise(
      Upstream.use((upstream) =>
        upstream.withSession((session) =>
          session.install([{ name: "alpha", source, commit }], {
            cwd,
            agents: ["universal"],
            scope: "project",
            mode: "copy",
          }),
        ),
      ).pipe(Effect.provide(layer)),
    );
    expect(result.installed.map(({ skill }) => skill)).toEqual(["alpha"]);
    expect(result.skipped).toEqual([]);
    expect(result.failed).toEqual([]);
    if (adapter === "live") {
      expect(await readFile(join(cwd, ".agents/skills/alpha/SKILL.md"), "utf8")).toContain(
        "Pinned content.",
      );
    }
  });

  it("reports a skipped target", async () => {
    const layer =
      adapter === "live"
        ? Layer.provide(UpstreamLive, NodeServices.layer)
        : fakeUpstream({
            skills: { [JSON.stringify([source, commit])]: ["alpha"] },
            skippedSkills: ["alpha"],
            defaultInstallAgents: ["augment"],
          });
    const result = await Effect.runPromise(
      Upstream.use((upstream) =>
        upstream.withSession((session) =>
          session.install([{ name: "alpha", source, commit }], {
            cwd,
            scope: "project",
            mode: "symlink",
          }),
        ),
      ).pipe(Effect.provide(layer)),
    );
    expect(result.skipped).toContainEqual({
      skill: "alpha",
      agent: "augment",
      reason: "missing-agent-directory",
    });
    expect(result.failed).toEqual([]);
  });

  it("reports the first failed group and stops later groups", async () => {
    await writeFile(join(cwd, ".agents"), "not a directory");
    const layer =
      adapter === "live"
        ? Layer.provide(UpstreamLive, NodeServices.layer)
        : fakeUpstream({
            skills: {
              [JSON.stringify([source, commit])]: ["alpha"],
              [JSON.stringify([source, later])]: ["beta"],
            },
            failedResults: [source],
            installDir: cwd,
          });
    const result = await Effect.runPromise(
      Upstream.use((upstream) =>
        upstream.withSession((session) =>
          session.install(
            [
              { name: "alpha", source, commit },
              { name: "beta", source, commit: later },
            ],
            { cwd, agents: ["universal"], scope: "project", mode: "copy" },
          ),
        ),
      ).pipe(Effect.provide(layer)),
    );
    expect(result.installed).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(result.failed.map(({ skill, agent }) => ({ skill, agent }))).toEqual([
      { skill: "alpha", agent: "universal" },
    ]);
    expect(result.failed[0]?.message).toBeTruthy();
    await expect(readFile(join(cwd, "project/universal/beta"), "utf8")).rejects.toThrow();
  });

  it("preflights every Entry before writing", async () => {
    const layer =
      adapter === "live"
        ? Layer.provide(UpstreamLive, NodeServices.layer)
        : fakeUpstream({
            skills: {
              [JSON.stringify([source, commit])]: ["alpha"],
              [JSON.stringify([source, later])]: ["beta"],
            },
            installDir: cwd,
          });
    const error = await Effect.runPromise(
      Upstream.use((upstream) =>
        upstream.withSession((session) =>
          session
            .install(
              [
                { name: "alpha", source, commit },
                { name: "missing", source, commit: later },
              ],
              { cwd, agents: ["universal"], scope: "project", mode: "copy" },
            )
            .pipe(Effect.flip),
        ),
      ).pipe(Effect.provide(layer)),
    );
    expect(error.message).toContain("missing");
    await expect(readFile(join(cwd, ".agents/skills/alpha/SKILL.md"), "utf8")).rejects.toThrow();
    await expect(readFile(join(cwd, "project/universal/alpha"), "utf8")).rejects.toThrow();
  });

  it("installs different Pins of one Source", async () => {
    const layer =
      adapter === "live"
        ? Layer.provide(UpstreamLive, NodeServices.layer)
        : fakeUpstream({
            skills: {
              [JSON.stringify([source, commit])]: ["alpha"],
              [JSON.stringify([source, later])]: ["beta"],
            },
            installDir: cwd,
          });
    const result = await Effect.runPromise(
      Upstream.use((upstream) =>
        upstream.withSession((session) =>
          session.install(
            [
              { name: "alpha", source, commit },
              { name: "beta", source, commit: later },
            ],
            { cwd, agents: ["universal"], scope: "project", mode: "copy" },
          ),
        ),
      ).pipe(Effect.provide(layer)),
    );
    expect(result.installed.map(({ skill }) => skill)).toEqual(["alpha", "beta"]);
    expect(result.failed).toEqual([]);
    if (adapter === "live") {
      expect(await readFile(join(cwd, ".agents/skills/alpha/SKILL.md"), "utf8")).toContain(
        "Pinned content.",
      );
      expect(await readFile(join(cwd, ".agents/skills/beta/SKILL.md"), "utf8")).toContain(
        "New beta.",
      );
    } else {
      expect(await readFile(join(cwd, "project/universal/alpha"), "utf8")).toBe(`${commit}:copy`);
      expect(await readFile(join(cwd, "project/universal/beta"), "utf8")).toBe(`${later}:copy`);
    }
  });
});
