import { assert, it } from "@effect/vitest";
import { expandSkillFlags as expand } from "../src/argv.ts";

const expandSkillFlags = (argv: ReadonlyArray<string>) =>
  expand(argv, ["universal", "fake-one", "fake-two"]);

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
