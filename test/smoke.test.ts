import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeServices } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { installSkills } from "skills";
import { describe, expect, it } from "vitest";
import { Upstream } from "../src/upstream.ts";
import { UpstreamLive } from "../src/upstream-live.ts";

const source = "mattpocock/skills";
const commit = "5863806dd4e15c63174bee4e7515a4256792ecfa";

// Spec #1, Testing Decisions: network smoke tests are opt-in and never run in CI.
describe.skipIf(process.env.SKILLSET_SMOKE !== "1" || Boolean(process.env.CI))(
  "GitHub smoke",
  () => {
    it("peels an annotated tag and accepts a .git shorthand", async () => {
      const commits = await Effect.runPromise(
        Upstream.use((upstream) =>
          Effect.all([
            upstream.resolveCommit("sindresorhus/is", "v7.0.0"),
            upstream.resolveCommit("mattpocock/skills.git"),
          ]),
        ).pipe(Effect.provide(Layer.provide(UpstreamLive, NodeServices.layer))),
      );
      expect(commits[0]).toBe("ab85d9bca9564eb0f867ab45e3cbf45659d9ac4c");
      expect(commits[1]).toMatch(/^[a-f0-9]{40}$/u);
    }, 120_000);

    it("lists and installs a scoped source at a full SHA", async () => {
      const cwd = await mkdtemp(join(tmpdir(), "skillset-smoke-"));
      try {
        await Effect.runPromise(
          Upstream.use((upstream) =>
            Effect.scoped(
              Effect.gen(function* () {
                const resolved = yield* upstream.resolveSource(`${source}.git`, commit);
                expect(resolved.source.commit).toBe(commit);
                expect(resolved.skills.map((skill) => skill.name)).toContain("grilling");
                const installed = yield* upstream.install(resolved, {
                  cwd,
                  skills: ["grilling"],
                  agents: ["universal"],
                  mode: "copy",
                  telemetry: false,
                });
                expect(installed.failed).toEqual([]);
              }),
            ),
          ).pipe(Effect.provide(Layer.provide(UpstreamLive, NodeServices.layer))),
        );
        expect(await readFile(join(cwd, ".agents/skills/grilling/SKILL.md"), "utf8")).toContain(
          "grilling",
        );
      } finally {
        await rm(cwd, { recursive: true, force: true });
      }
    }, 120_000);

    it("installs and records a skill with a full SHA ref", async () => {
      const cwd = await mkdtemp(join(tmpdir(), "skillset-smoke-"));
      try {
        const result = await installSkills(source, {
          ref: commit,
          cwd,
          skills: ["grilling"],
          agents: ["universal"],
          mode: "copy",
          telemetry: false,
        });
        expect(result.failed).toEqual([]);
        expect(await readFile(join(cwd, ".agents/skills/grilling/SKILL.md"), "utf8")).toContain(
          "grilling",
        );
        const lock = JSON.parse(await readFile(join(cwd, "skills-lock.json"), "utf8"));
        expect(lock.skills.grilling).toBeDefined();
      } finally {
        await rm(cwd, { recursive: true, force: true });
      }
    }, 120_000);
  },
);
