import { createRequire } from "node:module";
import { assert, it } from "@effect/vitest";
import { NodeFileSystem } from "@effect/platform-node";
import { Effect, FileSystem } from "effect";
import { SCHEMA_URL } from "../src/skillset-file.ts";
import { runCli } from "./harness.ts";

for (const command of ["add", "list", "install"]) {
  it.effect(`${command} --help shows usage without reading a file`, () =>
    Effect.gen(function* () {
      const result = yield* runCli([command, "--help"]);
      assert.strictEqual(result.code, 0);
      assert.match(result.out.join("\n"), new RegExp(command, "i"));
    }),
  );
}

it.effect("aliases execute their commands", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/set.json`;
    const commit = "a".repeat(40);
    const upstream = {
      commits: { [JSON.stringify(["https://github.com/owner/repo.git", null])]: commit },
      skills: {
        [JSON.stringify(["https://github.com/owner/repo.git", commit])]: ["alpha", "beta"],
      },
      installDir: dir,
    };
    const added = yield* runCli(["a", "-s", "alpha", "beta", "owner/repo", "--set", file], {
      upstream,
    });
    assert.strictEqual(added.code, 0);
    const listed = yield* runCli(["ls", "--set", file]);
    assert.include(listed.out.join("\n"), "alpha");
    assert.strictEqual((yield* runCli(["up", "--set", file], { upstream })).code, 0);
    assert.strictEqual((yield* runCli(["i", "-y", "--set", file], { upstream })).code, 0);
    assert.isTrue(yield* fs.exists(`${dir}/project/universal/alpha`));
    assert.strictEqual((yield* runCli(["rm", "alpha", "--set", file])).code, 0);
    assert.deepStrictEqual(JSON.parse(yield* fs.readFileString(file)), {
      $schema: SCHEMA_URL,
      skills: [{ name: "beta", source: "owner/repo", commit }],
    });
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("--version matches package metadata", () =>
  Effect.gen(function* () {
    const { version } = createRequire(import.meta.url)("../package.json") as { version: string };
    const result = yield* runCli(["--version"]);
    assert.strictEqual(result.code, 0);
    assert.include(result.out.join("\n"), version);
  }),
);

it.effect("--wizard is rejected", () =>
  Effect.gen(function* () {
    const result = yield* runCli(["--wizard"]);
    assert.strictEqual(result.code, 1);
  }),
);

for (const [command, alias] of [
  ["install", "i"],
  ["list", "ls"],
] as const) {
  it.effect(`${alias} runs ${command} and appears in help`, () =>
    Effect.gen(function* () {
      const result = yield* runCli([alias, "--help"]);
      assert.strictEqual(result.code, 0);
      assert.include(result.out.join("\n"), command);
      const rootHelp = yield* runCli(["--help"]);
      assert.match(rootHelp.out.join("\n"), new RegExp(`${command}, ${alias}\\b`));
    }),
  );
}

for (const [command, alias] of [
  ["add", "a"],
  ["remove", "rm"],
  ["update", "up"],
] as const) {
  it.effect(
    `deprecated ${command} runs as ${command} and as ${alias} but is hidden from help`,
    () =>
      Effect.gen(function* () {
        for (const name of [command, alias]) {
          const result = yield* runCli([name, "--help"]);
          assert.strictEqual(result.code, 0);
          assert.include(result.out.join("\n"), command);
        }
        const rootHelp = yield* runCli(["--help"]);
        assert.notMatch(rootHelp.out.join("\n"), new RegExp(`^\\s+${command}\\b`, "m"));
      }),
  );
}

it.effect("root help and completions list the skill group", () =>
  Effect.gen(function* () {
    const help = yield* runCli(["--help"]);
    assert.match(help.out.join("\n"), /\bskill\b/);
    const group = yield* runCli(["skill", "--help"]);
    assert.strictEqual(group.code, 0);
    const text = group.out.join("\n");
    for (const name of ["add", "rm", "up"]) assert.match(text, new RegExp(`\\b${name}\\b`));
    for (const shell of ["bash", "zsh", "fish"]) {
      const completions = yield* runCli(["--completions", shell]);
      assert.strictEqual(completions.code, 0);
      assert.match(completions.out.join("\n"), /\bskill\b/);
    }
  }),
);

it.effect("root help and completions list the mcp group", () =>
  Effect.gen(function* () {
    const help = yield* runCli(["--help"]);
    assert.match(help.out.join("\n"), /\bmcp\b/);
    const group = yield* runCli(["mcp", "--help"]);
    assert.strictEqual(group.code, 0);
    for (const name of ["add", "rm"])
      assert.match(group.out.join("\n"), new RegExp(`\\b${name}\\b`));
    for (const shell of ["bash", "zsh", "fish"]) {
      const completions = yield* runCli(["--completions", shell]);
      assert.match(completions.out.join("\n"), /\bmcp\b/);
    }
  }),
);

it.effect("skill commands print no deprecation notice", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/set.json`;
    yield* fs.writeFileString(file, JSON.stringify({ $schema: SCHEMA_URL, skills: [] }));
    for (const command of ["rm", "up"]) {
      const result = yield* runCli(["skill", command, "--set", file]);
      assert.notInclude(result.err.join("\n"), "Deprecated");
    }
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect.each([
  ["add", "add", "add"],
  ["a", "add", "add"],
  ["remove", "remove", "rm"],
  ["rm", "remove", "rm"],
  ["update", "update", "up"],
  ["up", "update", "up"],
] as const)("top-level %s prints one deprecation notice", ([alias, name, group]) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/set.json`;
    const commit = "a".repeat(40);
    yield* fs.writeFileString(file, JSON.stringify({ $schema: SCHEMA_URL, skills: [] }));
    const upstream = {
      commits: { [JSON.stringify(["https://github.com/owner/repo.git", null])]: commit },
      skills: { [JSON.stringify(["https://github.com/owner/repo.git", commit])]: ["alpha"] },
    };
    const extra = name === "add" ? ["owner/repo", "--all"] : [];
    const result = yield* runCli([alias, ...extra, "--set", file], { upstream });
    assert.deepStrictEqual(
      result.err.map(String).filter((line) => line.includes("Deprecated")),
      [
        `Deprecated: "skillset ${name}" is now "skillset skill ${group}"; it will be removed in 1.0.`,
      ],
    );
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);
