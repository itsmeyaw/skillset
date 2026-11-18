import { NodeFileSystem } from "@effect/platform-node";
import { assert, it } from "@effect/vitest";
import { Effect, FileSystem } from "effect";
import { runCli } from "./harness.ts";

it.effect("commands report the same missing Skillset", () =>
  Effect.gen(function* () {
    const dir = yield* (yield* FileSystem.FileSystem).makeTempDirectoryScoped();
    const file = `${dir}/missing.json`;
    for (const args of [["install", "-y"], ["list"], ["skill", "rm", "--all"], ["skill", "up"]]) {
      const result = yield* runCli([...args, "--set", file]);
      assert.strictEqual(result.code, 1);
      const hint = args[0] === "install" ? ". To install a skill, use `skillset add`." : "";
      assert.include(result.err.join("\n"), `Cannot find Skillset "${file}" in ${file}${hint}`);
    }
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);
