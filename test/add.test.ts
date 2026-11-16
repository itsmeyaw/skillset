import { NodeFileSystem } from "@effect/platform-node";
import { assert, it } from "@effect/vitest";
import { Effect, FileSystem } from "effect";
import { key, runCli } from "./harness.ts";

const cursor = {
  id: "cursor",
  name: "Cursor",
  projectSkillsDir: ".cursor/skills",
  globalSkillsDir: null,
  universal: false,
};
const commit = "a".repeat(40);
const upstream = {
  commits: { [JSON.stringify(["owner/repo", null])]: commit },
  skills: { [JSON.stringify(["owner/repo", commit])]: ["zeta", "alpha"] },
};

it.effect("add alias accepts a Source after skills and a global option", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    const result = yield* runCli(
      ["--log-level", "info", "a", "-s", "alpha", "owner/repo", "--set", file],
      { upstream },
    );
    assert.strictEqual(result.code, 0);
    assert.deepStrictEqual(JSON.parse(yield* fs.readFileString(file)).skills, [
      { name: "alpha", source: "owner/repo", commit },
    ]);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("add -y keeps non-interactive listing behavior on a TTY", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/set.json`;
    const result = yield* runCli(["add", "owner/repo", "-y", "--set", file], {
      tty: true,
      upstream,
    });
    assert.strictEqual(result.code, 0);
    assert.deepStrictEqual(result.screen, []);
    assert.match(result.out.join("\n"), /alpha/);
    assert.isFalse(yield* fs.exists(file));
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("submitting an empty interactive selection does not create a Skillset", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/set.json`;
    const result = yield* runCli(["add", "owner/repo", "--set", file], {
      tty: true,
      keys: [key("enter")],
      upstream,
    });
    assert.strictEqual(result.code, 0);
    assert.isFalse(yield* fs.exists(file));
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("Ctrl+C cancels the Source prompt", () =>
  Effect.gen(function* () {
    const ctrlC = { ...key("c"), key: { ...key("c").key, ctrl: true } };
    const result = yield* runCli(["add"], { tty: true, keys: [ctrlC] });
    assert.strictEqual(result.code, 130);
    assert.include(result.out.join("\n"), "Cancelled");
  }),
);

it.effect("interactive add asks for a Source and selects skills", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    const result = yield* runCli(["add", "--set", file], {
      tty: true,
      keys: [
        ...Array.from("owner/repo", (char) => key(char, char)),
        key("enter"),
        key("l", "l"),
        key("space"),
        key("enter"),
        key("n", "n"),
        key("n", "n"),
      ],
      upstream,
    });
    assert.strictEqual(result.code, 0);
    assert.match(result.screen.join(""), /Source/);
    assert.match(result.screen.join(""), /Add another source\?/);
    assert.match(result.screen.join(""), /Install skillset\?/);
    assert.notInclude(result.out.join("\n"), "Installed");
    assert.deepStrictEqual(JSON.parse(yield* fs.readFileString(file)).skills, [
      { name: "alpha", source: "owner/repo", commit },
    ]);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("cancelling interactive add leaves the file absent", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    const result = yield* runCli(["add", "owner/repo", "--set", file], {
      tty: true,
      keys: [key("escape")],
      upstream,
    });
    assert.strictEqual(result.code, 130);
    assert.include(result.out.join("\n"), "Cancelled");
    assert.isFalse(yield* fs.exists(file));
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("add reports a Source with no skills", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const result = yield* runCli(["add", "owner/repo", "--all", "--set", `${dir}/set.json`], {
      upstream: { ...upstream, skills: { [JSON.stringify(["owner/repo", commit])]: [] } },
    });
    assert.strictEqual(result.code, 1);
    assert.match(result.err.join("\n"), /no skills/i);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("add without a selection lists skills without creating a Skillset file", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    const result = yield* runCli(["add", "owner/repo", "--set", file], { upstream });
    assert.strictEqual(result.code, 0);
    assert.match(result.out.join("\n"), /alpha/);
    assert.match(result.out.join("\n"), /zeta/);
    assert.match(result.out.join("\n"), /-s.*--all/);
    assert.isFalse(yield* fs.exists(file));
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("add writes selected skills in canonical order to a new Skillset file", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    const result = yield* runCli(["add", "owner/repo", "-s", "zeta", "alpha", "--set", file], {
      upstream,
    });
    assert.strictEqual(result.code, 0);
    assert.include(result.out.join("\n"), `Added zeta, alpha to ${file}`);
    assert.strictEqual(
      yield* fs.readFileString(file),
      `{
  "$schema": "https://raw.githubusercontent.com/itsmeyaw/skillset/main/schemas/skillset/v1.json",
  "skills": [
    {
      "name": "alpha",
      "source": "owner/repo",
      "commit": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    },
    {
      "name": "zeta",
      "source": "owner/repo",
      "commit": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    }
  ]
}\n`,
    );
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("add rejects missing skills without changing an existing Skillset", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    const original = `{"$schema":"https://raw.githubusercontent.com/itsmeyaw/skillset/main/schemas/skillset/v1.json","skills":[]}\n`;
    yield* fs.writeFileString(file, original);
    const result = yield* runCli(["add", "owner/repo", "-s", "alpha", "missing", "--set", file], {
      upstream,
    });
    assert.strictEqual(result.code, 1);
    assert.match(result.err.join("\n"), /missing/i);
    assert.strictEqual(yield* fs.readFileString(file), original);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("re-adding a skill from the same Source moves its Pin", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    yield* fs.writeFileString(
      file,
      JSON.stringify({
        $schema:
          "https://raw.githubusercontent.com/itsmeyaw/skillset/main/schemas/skillset/v1.json",
        skills: [{ name: "alpha", source: "owner/repo", commit: "b".repeat(40) }],
      }),
    );
    const result = yield* runCli(["add", "owner/repo", "-s", "alpha", "--set", file], { upstream });
    assert.strictEqual(result.code, 0);
    assert.deepStrictEqual(JSON.parse(yield* fs.readFileString(file)).skills, [
      { name: "alpha", source: "owner/repo", commit },
    ]);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("add refuses a name from a different Source without changing the file", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    const original = JSON.stringify({
      $schema: "https://raw.githubusercontent.com/itsmeyaw/skillset/main/schemas/skillset/v1.json",
      skills: [{ name: "alpha", source: "other/repo", commit: "b".repeat(40) }],
    });
    yield* fs.writeFileString(file, original);
    const result = yield* runCli(["add", "owner/repo", "-s", "zeta", "alpha", "--set", file], {
      upstream,
    });
    assert.strictEqual(result.code, 1);
    assert.match(result.err.join("\n"), /alpha.*other\/repo/i);
    assert.strictEqual(yield* fs.readFileString(file), original);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("add --all writes every available skill", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    const result = yield* runCli(["add", "owner/repo", "--all", "--set", file], { upstream });
    assert.strictEqual(result.code, 0);
    assert.deepStrictEqual(JSON.parse(yield* fs.readFileString(file)).skills, [
      { name: "alpha", source: "owner/repo", commit },
      { name: "zeta", source: "owner/repo", commit },
    ]);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("add -l lists skills even with --all and leaves the file unchanged", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    const original = "do not rewrite";
    yield* fs.writeFileString(file, original);
    const result = yield* runCli(["add", "owner/repo", "-l", "--all", "--set", file], { upstream });
    assert.strictEqual(result.code, 0);
    assert.match(result.out.join("\n"), /alpha/);
    assert.match(result.out.join("\n"), /-s.*--all/);
    assert.strictEqual(yield* fs.readFileString(file), original);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("add resolves a branch and preserves its Source with repeated skill flags", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    const result = yield* runCli(
      ["add", "owner/repo#feature/docs", "-s", "zeta", "-s", "alpha", "--set", file],
      {
        upstream: {
          commits: { [JSON.stringify(["owner/repo", "feature/docs"])]: commit },
          skills: { [JSON.stringify(["owner/repo", commit])]: ["alpha", "zeta"] },
        },
      },
    );
    assert.strictEqual(result.code, 0);
    assert.deepStrictEqual(JSON.parse(yield* fs.readFileString(file)).skills, [
      { name: "alpha", source: "owner/repo#feature/docs", commit },
      { name: "zeta", source: "owner/repo#feature/docs", commit },
    ]);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("add accepts --skill and --set before the command", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    const result = yield* runCli(["--set", file, "add", "owner/repo", "--skill", "alpha", "zeta"], {
      upstream,
    });
    assert.strictEqual(result.code, 0);
    assert.deepStrictEqual(JSON.parse(yield* fs.readFileString(file)).skills, [
      { name: "alpha", source: "owner/repo", commit },
      { name: "zeta", source: "owner/repo", commit },
    ]);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("add accepts the Source after multiple skill flag values", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    const result = yield* runCli(["add", "-s", "alpha", "zeta", "owner/repo", "--set", file], {
      upstream,
    });
    assert.strictEqual(result.code, 0);
    assert.deepStrictEqual(
      JSON.parse(yield* fs.readFileString(file)).skills.map(
        (entry: { name: string }) => entry.name,
      ),
      ["alpha", "zeta"],
    );
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("add leaves the file absent when Source lookup fails", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    const result = yield* runCli(["add", "owner/repo", "--all", "--set", file]);
    assert.strictEqual(result.code, 1);
    assert.match(result.err.join("\n"), /Fake commit not configured/);
    assert.isFalse(yield* fs.exists(file));
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("add rejects an empty -s flag", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    const result = yield* runCli(["add", "owner/repo", "-s", "--set", file], { upstream });
    assert.strictEqual(result.code, 1);
    assert.isFalse(yield* fs.exists(file));
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("add rejects an invalid Skillset file without overwriting it", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    const original = '{"$schema":"https://example.com/v2","skills":[]}';
    yield* fs.writeFileString(file, original);
    const result = yield* runCli(["add", "owner/repo", "-s", "alpha", "--set", file], { upstream });
    assert.strictEqual(result.code, 1);
    assert.match(result.err.join("\n"), /invalid Skillset file/i);
    assert.strictEqual(yield* fs.readFileString(file), original);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

for (const ref of ["v1.2.3", "1.2-beta+build", "b".repeat(40)]) {
  it.effect(`add accepts version-pinned Source ${ref} and preserves it`, () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped();
      const file = `${dir}/skillset.json`;
      const source = `owner/repo@${ref}`;
      const result = yield* runCli(["add", source, "-s", "alpha", "--set", file], {
        upstream: {
          commits: { [JSON.stringify(["owner/repo", ref])]: commit },
          skills: { [JSON.stringify(["owner/repo", commit])]: ["alpha"] },
        },
      });
      assert.strictEqual(result.code, 0);
      assert.deepStrictEqual(JSON.parse(yield* fs.readFileString(file)).skills, [
        { name: "alpha", source, commit },
      ]);
    }).pipe(Effect.provide(NodeFileSystem.layer)),
  );
}

it.effect("add preserves an uppercase SHA while resolving its lowercase Pin", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    const source = `owner/repo@${"A".repeat(40)}`;
    const result = yield* runCli(["add", source, "-s", "alpha", "--set", file], {
      upstream: {
        commits: { [JSON.stringify(["owner/repo", commit])]: commit },
        skills: { [JSON.stringify(["owner/repo", commit])]: ["alpha"] },
      },
    });
    assert.strictEqual(result.code, 0);
    assert.deepStrictEqual(JSON.parse(yield* fs.readFileString(file)).skills, [
      { name: "alpha", source, commit },
    ]);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

for (const source of [
  "owner/repo@grilling",
  "owner/repo#dev@grilling",
  "https://gitlab.com/owner/repo#dev@grilling",
  "git@gitlab.com:owner/repo.git#dev@grilling",
]) {
  it.effect(`add suggests -s for ${source} without writing`, () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped();
      const file = `${dir}/skillset.json`;
      yield* fs.writeFileString(file, "unchanged");
      const result = yield* runCli(["add", source, "--all", "--set", file], { upstream });
      assert.strictEqual(result.code, 1);
      assert.match(result.err.join("\n"), /-s grilling/);
      assert.strictEqual(yield* fs.readFileString(file), "unchanged");
    }).pipe(Effect.provide(NodeFileSystem.layer)),
  );
}

it.effect("add selects the skill implied by a GitHub tree URL", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    const result = yield* runCli(
      ["add", "https://github.com/owner/repo/tree/dev/alpha", "--set", file],
      {
        upstream: {
          commits: { [JSON.stringify(["https://github.com/owner/repo", "dev"])]: commit },
          skills: {
            [JSON.stringify(["https://github.com/owner/repo", commit])]: ["alpha", "zeta"],
          },
        },
      },
    );
    assert.strictEqual(result.code, 0);
    assert.deepStrictEqual(JSON.parse(yield* fs.readFileString(file)).skills, [
      { name: "alpha", source: "https://github.com/owner/repo/tree/dev", commit },
    ]);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

for (const hasShortRef of [false, true]) {
  it.effect(
    `add rejects a longer tree ref when the short ref ${hasShortRef ? "exists" : "is absent"}`,
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const dir = yield* fs.makeTempDirectoryScoped();
        const file = `${dir}/skillset.json`;
        const result = yield* runCli(
          ["add", "https://github.com/owner/repo/tree/feature/docs/skills/alpha", "--set", file],
          {
            upstream: {
              commits: {
                ...(hasShortRef
                  ? { [JSON.stringify(["https://github.com/owner/repo", "feature"])]: commit }
                  : {}),
                [JSON.stringify(["https://github.com/owner/repo", "feature/docs"])]: "b".repeat(40),
              },
              skills: { [JSON.stringify(["https://github.com/owner/repo", commit])]: ["alpha"] },
            },
          },
        );
        assert.strictEqual(result.code, 1);
        assert.match(result.err.join("\n"), /#.*branch.*-s/i);
        assert.isFalse(yield* fs.exists(file));
      }).pipe(Effect.provide(NodeFileSystem.layer)),
  );
}

for (const [flags, expected] of [
  [["-s", "zeta"], ["zeta"]],
  [["--all"], ["alpha", "zeta"]],
] as const) {
  it.effect(`add tree URL honors ${flags.join(" ")}`, () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped();
      const file = `${dir}/skillset.json`;
      const result = yield* runCli(
        ["add", "https://github.com/owner/repo/tree/dev/skills/alpha/", ...flags, "--set", file],
        {
          upstream: {
            commits: { [JSON.stringify(["https://github.com/owner/repo", "dev"])]: commit },
            skills: {
              [JSON.stringify(["https://github.com/owner/repo", commit])]: ["alpha", "zeta"],
            },
          },
        },
      );
      assert.strictEqual(result.code, 0);
      assert.deepStrictEqual(
        JSON.parse(yield* fs.readFileString(file)).skills.map(
          (entry: { name: string }) => entry.name,
        ),
        expected,
      );
    }).pipe(Effect.provide(NodeFileSystem.layer)),
  );
}

it.effect("add -l lists a tree Source without writing", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    const result = yield* runCli(
      ["add", "https://github.com/owner/repo/tree/dev/skills/alpha", "-l", "--set", file],
      {
        upstream: {
          commits: { [JSON.stringify(["https://github.com/owner/repo", "dev"])]: commit },
          skills: {
            [JSON.stringify(["https://github.com/owner/repo", commit])]: ["alpha", "zeta"],
          },
        },
      },
    );
    assert.strictEqual(result.code, 0);
    assert.match(result.out.join("\n"), /zeta/);
    assert.isFalse(yield* fs.exists(file));
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("add --all ignores a missing tree-path skill", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    const result = yield* runCli(
      ["add", "https://github.com/owner/repo/tree/dev/skills/missing", "--all", "--set", file],
      {
        upstream: {
          commits: { [JSON.stringify(["https://github.com/owner/repo", "dev"])]: commit },
          skills: { [JSON.stringify(["https://github.com/owner/repo", commit])]: ["alpha"] },
        },
      },
    );
    assert.strictEqual(result.code, 0);
    assert.deepStrictEqual(JSON.parse(yield* fs.readFileString(file)).skills, [
      { name: "alpha", source: "https://github.com/owner/repo/tree/dev", commit },
    ]);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("add rejects an encoded slash in a tree ref", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    const result = yield* runCli(
      [
        "add",
        "https://github.com/owner/repo/tree/feature%2Fdocs/skills/alpha%2Ddocs",
        "--set",
        file,
      ],
      {
        upstream: {
          commits: {
            [JSON.stringify(["https://github.com/owner/repo", "feature%2Fdocs"])]: commit,
          },
          skills: { [JSON.stringify(["https://github.com/owner/repo", commit])]: ["alpha%2Ddocs"] },
        },
      },
    );
    assert.strictEqual(result.code, 1);
    assert.match(result.err.join("\n"), /#.*branch.*-s/i);
    assert.isFalse(yield* fs.exists(file));
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("add rejects a missing tree-path skill without writing", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    const result = yield* runCli(
      ["add", "https://github.com/owner/repo/tree/dev/skills/missing", "--set", file],
      {
        upstream: {
          commits: { [JSON.stringify(["https://github.com/owner/repo", "dev"])]: commit },
          skills: { [JSON.stringify(["https://github.com/owner/repo", commit])]: ["alpha"] },
        },
      },
    );
    assert.strictEqual(result.code, 1);
    assert.match(result.err.join("\n"), /missing/i);
    assert.isFalse(yield* fs.exists(file));
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

for (const [source, repository, ref] of [
  ["github:owner/repo#dev", "owner/repo", "dev"],
  ["gitlab:team/repo", "https://gitlab.com/team/repo", undefined],
  ["https://github.com/owner/repo", "https://github.com/owner/repo", undefined],
  [
    "https://gitlab.example.com/team/repo.git#dev",
    "https://gitlab.example.com/team/repo.git",
    "dev",
  ],
  ["https://gitlab.com/team/repo", "https://gitlab.com/team/repo", undefined],
  ["git@gitlab.com:team/repo.git#dev", "git@gitlab.com:team/repo.git", "dev"],
  ["git.example.com:team/repo.git", "git.example.com:team/repo.git", undefined],
  ["git@gitlab.com:team/repo.git#feature%2Fdocs", "git@gitlab.com:team/repo.git", "feature/docs"],
  ["ssh://git@example.com/team/repo", "ssh://git@example.com/team/repo", undefined],
  ["git://example.com/team/repo", "git://example.com/team/repo", undefined],
] as const) {
  it.effect(`add accepts remote Git Source ${source}`, () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped();
      const file = `${dir}/skillset.json`;
      const result = yield* runCli(["add", source, "-s", "alpha", "--set", file], {
        upstream: {
          commits: { [JSON.stringify([repository, ref ?? null])]: commit },
          skills: { [JSON.stringify([repository, commit])]: ["alpha"] },
        },
      });
      assert.strictEqual(result.code, 0);
      assert.deepStrictEqual(JSON.parse(yield* fs.readFileString(file)).skills, [
        { name: "alpha", source, commit },
      ]);
    }).pipe(Effect.provide(NodeFileSystem.layer)),
  );
}

it.effect("add decodes a percent-encoded shorthand branch", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    const source = "owner/repo#feature%2Fdocs";
    const result = yield* runCli(["add", source, "--all", "--set", file], {
      upstream: {
        commits: { [JSON.stringify(["owner/repo", "feature/docs"])]: commit },
        skills: { [JSON.stringify(["owner/repo", commit])]: ["alpha"] },
      },
    });
    assert.strictEqual(result.code, 0);
    assert.deepStrictEqual(JSON.parse(yield* fs.readFileString(file)).skills, [
      { name: "alpha", source, commit },
    ]);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

for (const [source, message] of [
  ["../repo", /local/i],
  ["./repo", /local/i],
  ["/tmp/repo", /local/i],
  ["~/repo", /local/i],
  ["file:///tmp/repo", /local/i],
  ["C:\\repo", /local/i],
  ["https://example.com", /well-known/i],
  ["https://example.com/.well-known/agent-skills/index.json", /well-known/i],
  ["https://raw.githubusercontent.com/owner/repo/main/SKILL.md", /download/i],
  ["https://github.com/owner/repo/archive/refs/heads/main.zip", /download/i],
  ["https://gitlab.com/owner/repo/-/raw/main/SKILL.md", /download/i],
  ["https://example.com/skill.tar.gz", /download/i],
  ["https://example.com/skills/SKILL.md", /download/i],
  ["owner/repo#", /invalid|unsupported/i],
  ["owner/repo\n", /invalid|unsupported/i],
] as const) {
  it.effect(`add rejects non-pinnable Source ${source} without creating a file`, () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped();
      const file = `${dir}/skillset.json`;
      const result = yield* runCli(["add", source, "--all", "--set", file], { upstream });
      assert.strictEqual(result.code, 1);
      assert.match(result.err.join("\n"), message);
      assert.isFalse(yield* fs.exists(file));
    }).pipe(Effect.provide(NodeFileSystem.layer)),
  );
}

it.effect("accepting the install prompt after add installs the Skillset", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    const result = yield* runCli(["add", "owner/repo", "-s", "alpha", "--set", file], {
      tty: true,
      keys: [
        key("n", "n"),
        key("y", "y"),
        ...Array.from({ length: 4 }, () => key("enter")),
        key("y", "y"),
      ],
      upstream: {
        ...upstream,
        installDir: dir,
        supportedAgents: [cursor],
        detectedAgents: [cursor],
      },
    });
    assert.strictEqual(result.code, 0);
    assert.match(result.out.join("\n"), /Installed alpha/);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

it.effect("interactive add repeats for another Source until declined", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    const result = yield* runCli(["add", "owner/repo", "-s", "alpha", "--set", file], {
      tty: true,
      keys: [
        key("y", "y"),
        ...Array.from("other/repo", (char) => key(char, char)),
        key("enter"),
        key("space"),
        key("enter"),
        key("n", "n"),
        key("n", "n"),
      ],
      upstream: {
        commits: { ...upstream.commits, [JSON.stringify(["other/repo", null])]: commit },
        skills: { ...upstream.skills, [JSON.stringify(["other/repo", commit])]: ["beta"] },
      },
    });
    assert.strictEqual(result.code, 0);
    assert.deepStrictEqual(
      JSON.parse(yield* fs.readFileString(file)).skills.map(
        (entry: { name: string }) => entry.name,
      ),
      ["alpha", "beta"],
    );
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

// Interactive add recovery spec: retain successful rounds when a later Source fails.
it.effect("interactive add keeps earlier Entries when a later Source fails", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    const result = yield* runCli(["add", "owner/repo", "-s", "alpha", "--set", file], {
      tty: true,
      keys: [
        key("y", "y"),
        ...Array.from("other/repo", (char) => key(char, char)),
        key("enter"),
        key("n", "n"),
        key("n", "n"),
      ],
      upstream,
    });
    assert.strictEqual(result.code, 0);
    assert.include(result.err, "Warning: Fake commit not configured for other/repo");
    assert.match(result.screen.join(""), /Install skillset\?/);
    assert.deepStrictEqual(JSON.parse(yield* fs.readFileString(file)).skills, [
      { name: "alpha", source: "owner/repo", commit },
    ]);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

// Interactive add recovery spec: first-Source flags must not affect a retry.
it.effect.each([{ flags: ["-s", "missing"] }, { flags: ["--all"] }, { flags: ["-l"] }])(
  "interactive add retries a failed argv Source without $flags",
  ({ flags }) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped();
      const file = `${dir}/skillset.json`;
      const result = yield* runCli(["add", "bad/repo", ...flags, "--set", file], {
        tty: true,
        keys: [
          key("enter"),
          ...Array.from("owner/repo", (char) => key(char, char)),
          key("enter"),
          key("l", "l"),
          key("space"),
          key("enter"),
          key("n", "n"),
          key("n", "n"),
        ],
        upstream,
      });
      assert.strictEqual(result.code, 0);
      assert.include(result.err, "Warning: Fake commit not configured for bad/repo");
      assert.deepStrictEqual(JSON.parse(yield* fs.readFileString(file)).skills, [
        { name: "alpha", source: "owner/repo", commit },
      ]);
    }).pipe(Effect.provide(NodeFileSystem.layer)),
);

// Interactive add recovery spec: no additions means the last failure is fatal.
it.effect("interactive add fails with the last error when every round fails", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    const result = yield* runCli(["add", "empty/repo", "--set", file], {
      tty: true,
      keys: [
        key("enter"),
        ...Array.from("bad/repo", (char) => key(char, char)),
        key("enter"),
        key("n", "n"),
      ],
      upstream: {
        commits: { [JSON.stringify(["empty/repo", null])]: commit },
        skills: { [JSON.stringify(["empty/repo", commit])]: [] },
      },
    });
    assert.strictEqual(result.code, 1);
    assert.include(result.err, `Warning: No skills found in empty/repo at ${commit}`);
    assert.include(result.err, "Warning: Fake commit not configured for bad/repo");
    assert.match(String(result.err.at(-1)), /Fake commit not configured for bad\/repo/);
    assert.notInclude(result.screen.join(""), "Install skillset?");
    assert.isFalse(yield* fs.exists(file));
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

// Interactive add recovery spec: -y remains fail-fast even on a TTY.
it.effect("add -y fails without a warning or retry prompt", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    const result = yield* runCli(["add", "bad/repo", "--all", "-y", "--set", file], {
      tty: true,
      upstream,
    });
    assert.strictEqual(result.code, 1);
    assert.match(result.err.join("\n"), /Fake commit not configured for bad\/repo/);
    assert.notInclude(result.err.join("\n"), "Warning:");
    assert.deepStrictEqual(result.screen, []);
    assert.isFalse(yield* fs.exists(file));
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

// Issue #11: quitting after a failed round still cancels without writing.
it.effect("cancelling the retry prompt exits 130 without writing earlier Entries", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    const result = yield* runCli(["add", "owner/repo", "-s", "alpha", "--set", file], {
      tty: true,
      keys: [
        key("y", "y"),
        ...Array.from("bad/repo", (char) => key(char, char)),
        key("enter"),
        key("escape"),
      ],
      upstream,
    });
    assert.strictEqual(result.code, 130);
    assert.include(result.out.join("\n"), "Cancelled");
    assert.include(result.err, "Warning: Fake commit not configured for bad/repo");
    assert.isFalse(yield* fs.exists(file));
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

// Interactive add recovery spec: discard conflicts while retaining the prior in-memory Skillset.
it.effect("interactive add retries after a conflict without losing earlier Entries", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    const result = yield* runCli(["add", "owner/repo", "-s", "alpha", "--set", file], {
      tty: true,
      keys: [
        key("y", "y"),
        ...Array.from("other/repo", (char) => key(char, char)),
        key("enter"),
        key("space"),
        key("enter"),
        key("enter"),
        ...Array.from("third/repo", (char) => key(char, char)),
        key("enter"),
        key("space"),
        key("enter"),
        key("n", "n"),
        key("n", "n"),
      ],
      upstream: {
        commits: {
          ...upstream.commits,
          [JSON.stringify(["other/repo", null])]: commit,
          [JSON.stringify(["third/repo", null])]: commit,
        },
        skills: {
          ...upstream.skills,
          [JSON.stringify(["other/repo", commit])]: ["alpha"],
          [JSON.stringify(["third/repo", commit])]: ["beta"],
        },
      },
    });
    assert.strictEqual(result.code, 0);
    assert.include(result.err, "Warning: Skill alpha already belongs to owner/repo");
    assert.deepStrictEqual(JSON.parse(yield* fs.readFileString(file)).skills, [
      { name: "alpha", source: "owner/repo", commit },
      { name: "beta", source: "third/repo", commit },
    ]);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);

// Interactive add recovery spec: Skillset file errors warn without overwriting the file.
it.effect("interactive add warns on an invalid Skillset and fails if no Source is added", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const file = `${dir}/skillset.json`;
    const original = '{"$schema":"https://example.com/v2","skills":[]}';
    yield* fs.writeFileString(file, original);
    const result = yield* runCli(["add", "owner/repo", "-s", "alpha", "--set", file], {
      tty: true,
      keys: [key("n", "n")],
      upstream,
    });
    assert.strictEqual(result.code, 1);
    assert.match(result.err.join("\n"), /Warning:.*invalid Skillset file/i);
    assert.match(result.screen.join(""), /Add another source\?/);
    assert.notInclude(result.screen.join(""), "Install skillset?");
    assert.strictEqual(yield* fs.readFileString(file), original);
  }).pipe(Effect.provide(NodeFileSystem.layer)),
);
