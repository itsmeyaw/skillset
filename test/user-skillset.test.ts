import { NodeFileSystem } from "@effect/platform-node";
import { assert, it } from "@effect/vitest";
import { Effect, FileSystem, Option } from "effect";
import { execFileSync, spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { SCHEMA_URL } from "../src/skillset-file.ts";
import { isUserSkillsetName, resolveSet, userDir } from "../src/user-skillset.ts";
import { runCli } from "./harness.ts";

const resolve = (value?: string, env: Record<string, string | undefined> = {}) =>
  Effect.runSync(resolveSet(Option.fromNullishOr(value), env));

// Issue #12: the `--set` resolution table.
it("--set omitted resolves to ./skillset.json", () => {
  assert.strictEqual(resolve(), "./skillset.json");
});

for (const path of ["my-set.json", "../x/A.JSON", "/abs/Set.Json", "sub/foo.json"]) {
  it(`--set ${path} is a path`, () => {
    assert.strictEqual(resolve(path, { SKILLSET_HOME: "/home-dir" }), path);
  });
}

for (const name of ["my-set", "a", "7up", "my_set.v2", "A-B"]) {
  it(`--set ${name} is a User Skillset`, () => {
    assert.strictEqual(resolve(name, { SKILLSET_HOME: "/home-dir" }), `/home-dir/${name}.json`);
  });
}

for (const value of ["./foo", "sub/foo", "-x", ".hidden", "", "a b"]) {
  it(`--set ${JSON.stringify(value)} is rejected`, () => {
    const result = Effect.runSync(resolveSet(Option.some(value), {}).pipe(Effect.result));
    assert.strictEqual(result._tag, "Failure");
    if (result._tag === "Failure") {
      assert.strictEqual(result.failure._tag, "CliMessageError");
      assert.strictEqual(
        result.failure.message,
        `"${value}" is not a Skillset name or .json path.`,
      );
    }
  });
}

it("isUserSkillsetName rejects .json paths", () => {
  assert.isTrue(isUserSkillsetName("my-set"));
  assert.isFalse(isUserSkillsetName("x.json"));
  assert.isFalse(isUserSkillsetName("X.JSON"));
  assert.isFalse(isUserSkillsetName("owner/repo"));
});

// Issue #12: first rule that applies wins, never merged.
it("user directory precedence: SKILLSET_HOME, XDG_CONFIG_HOME, then ~/.skillset", () => {
  assert.strictEqual(userDir({ SKILLSET_HOME: "/s", XDG_CONFIG_HOME: "/x" }), "/s");
  assert.strictEqual(userDir({ XDG_CONFIG_HOME: "/x" }), "/x/skillset");
  assert.strictEqual(userDir({}), `${homedir()}/.skillset`);
  assert.strictEqual(userDir({ SKILLSET_HOME: "", XDG_CONFIG_HOME: "" }), `${homedir()}/.skillset`);
});

const withHome = <A, E, R>(
  effect: (
    home: string,
    run: (
      argv: ReadonlyArray<string>,
      options?: Parameters<typeof runCli>[1],
    ) => ReturnType<typeof runCli>,
  ) => Effect.Effect<A, E, R>,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const home = `${dir}/user`;
    const run = (argv: ReadonlyArray<string>, options: Parameters<typeof runCli>[1] = {}) =>
      runCli(argv, { ...options, env: options.env ?? { SKILLSET_HOME: home } });
    return yield* effect(home, run);
  }).pipe(Effect.provide(NodeFileSystem.layer));

const upstream = () => {
  const commit = "a".repeat(40);
  return {
    commits: { [JSON.stringify(["owner/repo", null])]: commit },
    skills: { [JSON.stringify(["owner/repo", commit])]: ["alpha", "beta"] },
  };
};

it.effect("add --set <name> creates the User Skillset and the user directory", () =>
  withHome((home, run) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const result = yield* run(["add", "owner/repo", "-s", "alpha", "--set", "my-set"], {
        upstream: upstream(),
      });
      assert.strictEqual(result.code, 0);
      assert.include(JSON.parse(yield* fs.readFileString(`${home}/my-set.json`)).skills[0], {
        name: "alpha",
      });
    }),
  ),
);

it.effect("install <name> installs from the User Skillset and selects with -s", () =>
  withHome((home, run) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped();
      const up = { ...upstream(), installDir: dir };
      yield* run(["add", "owner/repo", "--all", "--set", "my-set"], { upstream: up });
      const result = yield* run(["install", "my-set", "-s", "beta", "-y"], { upstream: up });
      assert.strictEqual(result.code, 0);
      assert.isTrue(yield* fs.exists(`${dir}/project/universal/beta`));
      assert.isFalse(yield* fs.exists(`${dir}/project/universal/alpha`));
      assert.isTrue(yield* fs.exists(`${home}/my-set.json`));
    }),
  ),
);

it.effect.each([
  { args: ["-s", "alpha", "my-set"], beta: false },
  { args: ["-s", "alpha", "beta", "my-set"], beta: true },
  { args: ["-s", "alpha", "-a", "universal", "my-set"], beta: false },
])("install selects a Skillset after flags: $args", ({ args, beta }) =>
  withHome((home, run) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped();
      const up = { ...upstream(), installDir: dir };
      const contents = JSON.stringify({
        $schema: SCHEMA_URL,
        skills: [
          { name: "alpha", source: "owner/repo", commit: "a".repeat(40) },
          { name: "beta", source: "owner/repo", commit: "a".repeat(40) },
        ],
      });
      yield* fs.makeDirectory(home, { recursive: true });
      yield* fs.writeFileString(`${home}/my-set.json`, contents);
      const result = yield* run(["install", ...args, "-y"], { upstream: up });
      assert.strictEqual(result.code, 0);
      assert.isTrue(yield* fs.exists(`${dir}/project/universal/alpha`));
      assert.strictEqual(yield* fs.exists(`${dir}/project/universal/beta`), beta);
    }),
  ),
);

it.effect("CLI resolves a relative JSON path after a skill flag", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    yield* fs.writeFileString(
      `${dir}/set.json`,
      JSON.stringify({ $schema: SCHEMA_URL, skills: [] }),
    );
    yield* fs.writeFileString(`${dir}/skillset.json`, "not json");
    const result = spawnSync(
      process.execPath,
      [
        fileURLToPath(new URL("../src/bin.ts", import.meta.url)),
        "install",
        "-s",
        "alpha",
        "./set.json",
        "-y",
      ],
      { cwd: dir, env: { ...process.env, SKILLSET_HOME: dir }, encoding: "utf8" },
    );
    assert.strictEqual(result.status, 0);
    assert.include(result.stdout, "This Skillset is empty.");
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("CLI process reads the User Skillset after a skill flag", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    yield* fs.writeFileString(
      `${dir}/my-set.json`,
      JSON.stringify({ $schema: SCHEMA_URL, skills: [] }),
    );
    yield* fs.writeFileString(`${dir}/skillset.json`, "not json");
    const output = execFileSync(
      process.execPath,
      [
        fileURLToPath(new URL("../src/bin.ts", import.meta.url)),
        "install",
        "-s",
        "alpha",
        "my-set",
        "-y",
      ],
      { cwd: dir, env: { ...process.env, SKILLSET_HOME: dir }, encoding: "utf8" },
    );
    assert.include(output, "This Skillset is empty.");
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

for (const agents of [["opencode"], ["opencode", "claude-code"]]) {
  it.effect(`install -a ${agents.join(" ")} <name> installs the User Skillset`, () =>
    withHome((_home, run) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const dir = yield* fs.makeTempDirectoryScoped();
        const up = { ...upstream(), installDir: dir };
        const added = yield* run(["add", "owner/repo", "--all", "--set", "my-set"], {
          upstream: up,
        });
        assert.strictEqual(added.code, 0);
        const result = yield* run(["install", "-a", ...agents, "my-set", "-y"], {
          upstream: up,
        });
        assert.strictEqual(result.code, 0);
        for (const agent of agents) {
          assert.isTrue(yield* fs.exists(`${dir}/project/${agent}/alpha`));
          assert.isTrue(yield* fs.exists(`${dir}/project/${agent}/beta`));
        }
      }),
    ),
  );
}

it.effect("install <name> --set x is an error", () =>
  withHome((_home, run) =>
    Effect.gen(function* () {
      const result = yield* run(["install", "my-set", "--set", "other", "-y"]);
      assert.notStrictEqual(result.code, 0);
      assert.include(result.err.join("\n"), '"my-set" cannot be combined with --set.');
    }),
  ),
);

// Issue #22: invalid and missing positional references report the exact location.
it.effect("install rejects non-Skillset and missing references without writing", () =>
  withHome((home, run) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped();
      for (const [arg, location] of [
        ["owner/repo", home],
        ["missing-set", `${home}/missing-set.json`],
        [`${dir}/missing.json`, `${dir}/missing.json`],
      ] as const) {
        const result = yield* run(["install", arg, "-y"]);
        assert.strictEqual(result.code, 1);
        assert.include(
          result.err.join("\n"),
          `Cannot find Skillset "${arg}" in ${location}. To install a skill, use \`skillset add\`.`,
        );
      }
      // Issue #22: --set and positional references report the same missing-file error.
      const flagged = yield* run(["install", "--set", "missing-set", "-y"]);
      assert.strictEqual(flagged.code, 1);
      assert.include(
        flagged.err.join("\n"),
        `Cannot find Skillset "missing-set" in ${home}/missing-set.json. To install a skill, use \`skillset add\`.`,
      );
      const defaultSet = spawnSync(
        process.execPath,
        [fileURLToPath(new URL("../src/bin.ts", import.meta.url)), "install", "-y"],
        { cwd: dir, env: { ...process.env, SKILLSET_HOME: home }, encoding: "utf8" },
      );
      assert.strictEqual(defaultSet.status, 1);
      assert.include(
        defaultSet.stderr,
        'Cannot find Skillset "./skillset.json" in ./skillset.json. To install a skill, use `skillset add`.',
      );
      assert.deepStrictEqual(yield* fs.readDirectory(dir), []);
      assert.isFalse(yield* fs.exists(home));
    }),
  ),
);

// ADR 0002: positional JSON paths use the same resolution as --set.
it.effect("install accepts a positional JSON path and preserves invalid-file errors", () =>
  withHome((_home, run) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped();
      const file = `${dir}/team.json`;
      const up = { ...upstream(), installDir: dir };
      yield* run(["add", "owner/repo", "--all", "--set", file], { upstream: up });
      const result = yield* run(["install", file, "-y"], { upstream: up });
      assert.strictEqual(result.code, 0);
      assert.isTrue(yield* fs.exists(`${dir}/project/universal/alpha`));
      yield* fs.writeFileString(file, "not json");
      const invalid = yield* run(["install", file, "-y"]);
      assert.strictEqual(invalid.code, 1);
      assert.include(invalid.err.join("\n"), "Invalid Skillset file");
      const badFlag = yield* run(["install", "--set", "owner/repo", "-y"]);
      assert.include(badFlag.err.join("\n"), '"owner/repo" is not a Skillset name or .json path.');
      const both = yield* run(["install", file, "--set", "other", "-y"]);
      assert.include(both.err.join("\n"), `"${file}" cannot be combined with --set.`);
    }),
  ),
);

it.effect("ls --user lists User Skillset names sorted without .json", () =>
  withHome((home, run) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      yield* fs.makeDirectory(home, { recursive: true });
      for (const file of ["b.json", "a.json", "notes.txt", "bad name.json"])
        yield* fs.writeFileString(`${home}/${file}`, "{}");
      const result = yield* run(["ls", "--user"]);
      assert.strictEqual(result.code, 0);
      assert.deepStrictEqual(result.out, ["a", "b"]);
    }),
  ),
);

// Issue #22: -g is reserved for global installation scope.
it.effect("ls rejects the removed -g flag", () =>
  withHome((_home, run) =>
    Effect.gen(function* () {
      const result = yield* run(["ls", "-g"]);
      assert.strictEqual(result.code, 1);
      assert.include(result.err.join("\n"), "Unrecognized flag: -g in command skillset list");
    }),
  ),
);

it.effect("ls --user prints nothing when the user directory is missing", () =>
  withHome((_home, run) =>
    Effect.gen(function* () {
      const result = yield* run(["list", "--user"]);
      assert.strictEqual(result.code, 0);
      assert.deepStrictEqual(result.out, []);
    }),
  ),
);

it.effect("ls --user --set x is an error", () =>
  withHome((_home, run) =>
    Effect.gen(function* () {
      const result = yield* run(["ls", "--user", "--set", "x"]);
      assert.notStrictEqual(result.code, 0);
      assert.include(result.err.join("\n"), "--user cannot be used with --set.");
    }),
  ),
);

it.effect("ls --user uses $XDG_CONFIG_HOME/skillset when SKILLSET_HOME is unset", () =>
  withHome((_home, run) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const xdg = yield* fs.makeTempDirectoryScoped();
      yield* fs.makeDirectory(`${xdg}/skillset`);
      yield* fs.writeFileString(`${xdg}/skillset/via-xdg.json`, "{}");
      assert.deepStrictEqual(
        (yield* run(["ls", "--user"], { env: { XDG_CONFIG_HOME: xdg } })).out,
        ["via-xdg"],
      );
    }),
  ),
);
