import { NodeFileSystem } from "@effect/platform-node";
import { assert, it } from "@effect/vitest";
import { Effect, FileSystem } from "effect";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

it.effect("commands report the same missing default Skillset", () =>
  Effect.gen(function* () {
    const dir = yield* (yield* FileSystem.FileSystem).makeTempDirectoryScoped();
    for (const args of [["install", "-y"], ["list"], ["remove", "--all"], ["update"]]) {
      const result = spawnSync(
        process.execPath,
        [fileURLToPath(new URL("../src/bin.ts", import.meta.url)), ...args],
        {
          cwd: dir,
          env: { ...process.env, SKILLSET_HOME: dir },
          encoding: "utf8",
        },
      );
      assert.strictEqual(result.status, 1);
      const hint = args[0] === "install" ? ". To install a skill, use `skillset add`." : "";
      assert.include(
        result.stderr,
        `Cannot find Skillset "./skillset.json" in ./skillset.json${hint}`,
      );
    }
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);
