import { assert, it } from "@effect/vitest";
import { Command, Flag } from "effect/cli";
import { Expansion, expandSkillFlags as expand } from "../src/argv.ts";
import { cli, cliConfig } from "../src/cli.ts";

const expandSkillFlags = (argv: ReadonlyArray<string>) =>
  expand(argv, ["universal", "fake-one", "fake-two"], cli, cliConfig.builtIns);

it("expands a new repeating flag declared on a command", () => {
  const command = Command.make("app").pipe(
    Command.withSubcommands([
      Command.make("publish", {
        tags: Flag.String("tag").pipe(Flag.withAlias("t"), Flag.atLeast(0)),
      }).pipe(Command.withAlias("p")),
    ]),
  );
  assert.deepStrictEqual(expand(["p", "-t", "one", "two"], [], command), [
    "p",
    "-t",
    "one",
    "-t",
    "two",
  ]);
});

it("uses renamed command and flag declarations for positional ambiguity", () => {
  const command = Command.make("app").pipe(
    Command.withSharedFlags({
      collection: Flag.String("collection").pipe(
        Flag.withAlias("c"),
        Flag.annotate(Expansion, { blocksReserved: true }),
        Flag.optional,
      ),
    }),
    Command.withSubcommands([
      Command.make("publish", {
        items: Flag.String("item").pipe(
          Flag.withAlias("t"),
          Flag.annotate(Expansion, { reserveLast: true }),
          Flag.atLeast(0),
        ),
      }).pipe(Command.withAlias("p")),
    ]),
  );
  assert.deepStrictEqual(expand(["p", "-t", "one", "two"], [], command), ["p", "-t", "one", "two"]);
  assert.deepStrictEqual(expand(["-c", "p", "p", "-t", "one", "two"], [], command), [
    "-c",
    "p",
    "p",
    "-t",
    "one",
    "-t",
    "two",
  ]);
});

it("stops agent expansion at an ID absent from the supplied list", () => {
  assert.deepStrictEqual(expand(["install", "-a", "fake-one", "fake-two"], ["fake-one"], cli), [
    "install",
    "-a",
    "fake-one",
    "fake-two",
  ]);
});

it("keeps a User Skillset name after a selected skill", () => {
  assert.deepStrictEqual(expandSkillFlags(["install", "-s", "alpha", "my-set"]), [
    "install",
    "-s",
    "alpha",
    "my-set",
  ]);
});

it("keeps all skills when another skill flag follows", () => {
  assert.deepStrictEqual(expandSkillFlags(["install", "-s", "alpha", "beta", "-s", "gamma"]), [
    "install",
    "-s",
    "alpha",
    "-s",
    "beta",
    "-s",
    "gamma",
  ]);
});

it.each([
  {
    input: ["install", "-s", "alpha", "beta", "my-set"],
    expected: ["install", "-s", "alpha", "-s", "beta", "my-set"],
  },
  {
    input: ["i", "--skill", "alpha", "./set.json", "-y"],
    expected: ["i", "--skill", "alpha", "./set.json", "-y"],
  },
  {
    input: ["install", "-s", "alpha", "-a", "universal", "my-set"],
    expected: ["install", "-s", "alpha", "-a", "universal", "my-set"],
  },
  {
    input: ["install", "-s", "alpha", "beta", "--set", "my-set"],
    expected: ["install", "-s", "alpha", "-s", "beta", "--set", "my-set"],
  },
  {
    input: ["install", "-s", "alpha", "beta", "--", "my-set"],
    expected: ["install", "-s", "alpha", "-s", "beta", "--", "my-set"],
  },
  {
    input: ["add", "-s", "alpha", "owner/repo"],
    expected: ["add", "-s", "alpha", "owner/repo"],
  },
])("preserves Skillset and Source arguments: $input", ({ input, expected }) => {
  assert.deepStrictEqual(expandSkillFlags(input), expected);
});

it("keeps a User Skillset name after an agent", () => {
  assert.deepStrictEqual(expandSkillFlags(["install", "-a", "fake-one", "my-set"]), [
    "install",
    "-a",
    "fake-one",
    "my-set",
  ]);
});

for (const flag of ["-a", "--agent"]) {
  it(`expands known agents after ${flag} but stops at a User Skillset name`, () => {
    assert.deepStrictEqual(expandSkillFlags(["install", flag, "fake-one", "fake-two", "my-set"]), [
      "install",
      flag,
      "fake-one",
      flag,
      "fake-two",
      "my-set",
    ]);
  });
}

it("preserves an unknown first agent for validation", () => {
  assert.deepStrictEqual(expandSkillFlags(["install", "-a", "unknown", "my-set"]), [
    "install",
    "-a",
    "unknown",
    "my-set",
  ]);
});

it("keeps a Source after an agent", () => {
  assert.deepStrictEqual(expandSkillFlags(["install", "-a", "fake-one", "owner/repo"]), [
    "install",
    "-a",
    "fake-one",
    "owner/repo",
  ]);
});

// Issue #22: add accepts multiple agent IDs before its Source.
it("expands add agents without consuming the Source", () => {
  assert.deepStrictEqual(
    expandSkillFlags(["add", "--install", "-a", "fake-one", "fake-two", "owner/repo"]),
    ["add", "--install", "-a", "fake-one", "-a", "fake-two", "owner/repo"],
  );
});

it("keeps a Source before the first agent and later expands skills", () => {
  assert.deepStrictEqual(
    expandSkillFlags(["add", "-a", "owner/repo", "fake-one", "-s", "other/repo", "alpha"]),
    ["add", "-a", "owner/repo", "fake-one", "-s", "other/repo", "-s", "alpha"],
  );
});

it("does not count an agent value before the command as its positional argument", () => {
  assert.deepStrictEqual(
    expandSkillFlags(["-a", "fake-one", "unknown", "install", "-s", "alpha", "my-set"]),
    ["-a", "fake-one", "unknown", "install", "-s", "alpha", "my-set"],
  );
});

it("keeps skills after a User Skillset name following an agent", () => {
  assert.deepStrictEqual(
    expandSkillFlags(["install", "-a", "fake-one", "my-set", "-s", "alpha", "beta"]),
    ["install", "-a", "fake-one", "my-set", "-s", "alpha", "-s", "beta"],
  );
});

it("keeps multiple skills before a Source", () => {
  assert.deepStrictEqual(expandSkillFlags(["add", "-s", "a", "b", "owner/repo"]), [
    "add",
    "-s",
    "a",
    "-s",
    "b",
    "owner/repo",
  ]);
});

for (const argument of ["a", "i", "add", "install"]) {
  it(`does not treat later ${argument} as the subcommand`, () => {
    assert.deepStrictEqual(expandSkillFlags(["remove", argument, "-s", "alpha", "owner/repo"]), [
      "remove",
      argument,
      "-s",
      "alpha",
      "-s",
      "owner/repo",
    ]);
  });
}

it("finds the subcommand after shared and global option values", () => {
  assert.deepStrictEqual(
    expandSkillFlags(["--set", "a", "--log-level", "info", "a", "-s", "alpha", "owner/repo"]),
    ["--set", "a", "--log-level", "info", "a", "-s", "alpha", "owner/repo"],
  );
});
