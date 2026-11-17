import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { NodeServices } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Upstream } from "../src/upstream.ts";
import { UpstreamLive } from "../src/upstream-live.ts";
import { fakeUpstream } from "./harness.ts";

describe.each(["live", "fake"] as const)("%s Upstream install contract", (adapter) => {
  let cwd: string;
  let commit: string;
  const source = "https://github.com/contract/repo.git";
  const previous: Record<string, string | undefined> = {};

  beforeEach(async () => {
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
    git("-C", "work", "add", ".");
    git("-C", "work", "commit", "-qm", "first");
    commit = git("-C", "work", "rev-parse", "HEAD");
    git("clone", "-q", "--bare", "work", "repo.git");
    for (const [key, value] of Object.entries({
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: `url.${pathToFileURL(join(cwd, "repo.git")).href}.insteadOf`,
      GIT_CONFIG_VALUE_0: source,
      GIT_ALLOW_PROTOCOL: "file",
    })) {
      previous[key] = process.env[key];
      process.env[key] = value;
    }
  });

  afterEach(async () => {
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
});
