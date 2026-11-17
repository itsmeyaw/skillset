import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeServices } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { installSkills } from "skills";
import { describe, expect, it } from "vitest";
import { SCHEMA_URL } from "../src/skillset-file.ts";
import { Upstream } from "../src/upstream.ts";
import { UpstreamLive } from "../src/upstream-live.ts";

const source = "https://github.com/mattpocock/skills";
const commit = "5863806dd4e15c63174bee4e7515a4256792ecfa";

// Spec #1, Testing Decisions: network smoke tests are opt-in and never run in CI.
describe.skipIf(process.env.SKILLSET_SMOKE !== "1" || Boolean(process.env.CI))(
  "GitHub smoke",
  () => {
    it("peels an annotated tag and accepts a .git shorthand", async () => {
      const commits = await Effect.runPromise(
        Upstream.use((upstream) =>
          Effect.all([
            upstream
              .resolveRefs("https://github.com/sindresorhus/is.git", ["v7.0.0"])
              .pipe(Effect.map((refs) => refs[0])),
            upstream
              .resolveRefs("https://github.com/mattpocock/skills.git", [undefined])
              .pipe(Effect.map((refs) => refs[0])),
            upstream
              .resolveRefs("https://github.com/mattpocock/skills.git", ["main"])
              .pipe(Effect.map((refs) => refs[0])),
            upstream
              .resolveRefs("https://github.com/lodash/lodash.git", ["4.17.21"])
              .pipe(Effect.map((refs) => refs[0])),
          ]),
        ).pipe(Effect.provide(Layer.provide(UpstreamLive, NodeServices.layer))),
      );
      expect(commits[0]).toBe("ab85d9bca9564eb0f867ab45e3cbf45659d9ac4c");
      expect(commits[1]).toMatch(/^[a-f0-9]{40}$/u);
      expect(commits[2]).toBe(commits[1]);
      expect(commits[3]).toBe("f299b52f39486275a9e6483b60a410e06520c538");
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

    it("install -y installs a tree-URL Entry at its Pin and writes the skills lock", async () => {
      const cwd = await mkdtemp(join(tmpdir(), "skillset-cli-smoke-"));
      try {
        const file = join(cwd, "skillset.json");
        await writeFile(
          file,
          JSON.stringify({
            $schema: SCHEMA_URL,
            skills: [
              {
                name: "grilling",
                source: "https://github.com/mattpocock/skills/tree/main",
                commit,
              },
            ],
          }),
        );
        execFileSync(
          process.execPath,
          [
            fileURLToPath(new URL("../src/bin.ts", import.meta.url)),
            "install",
            "-y",
            "-a",
            "universal",
            "--copy",
            "--set",
            file,
          ],
          { cwd, env: { ...process.env, SKILLSET_HOME: cwd }, encoding: "utf8" },
        );
        expect(await readFile(join(cwd, ".agents/skills/grilling/SKILL.md"), "utf8")).toContain(
          "grilling",
        );
        const lock = JSON.parse(await readFile(join(cwd, "skills-lock.json"), "utf8"));
        expect(lock.skills.grilling).toBeDefined();
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
