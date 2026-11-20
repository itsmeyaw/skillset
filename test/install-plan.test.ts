import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { assert, it } from "@effect/vitest";
import { Effect, Layer, Stdio } from "effect";
import { buildInstallPlan, type InstallPlanOptions } from "../src/install-plan.ts";
import { makePrompter, type Prompter } from "../src/prompts/prompter.ts";
import type { SearchChoice } from "../src/prompts/search.ts";
import { SCHEMA_URL, type Skillset } from "../src/skillset-file.ts";
import { fakeTerminal, fakeUpstream } from "./harness.ts";

const alpha = { name: "alpha", source: "owner/repo", commit: "a".repeat(40) };
const beta = { name: "beta", source: "owner/repo", commit: "b".repeat(40) };
const skillset = { $schema: SCHEMA_URL, skills: [alpha, beta] } as const;
const options = { selected: [], agents: [], global: false, copy: false };

const scripted = (
  answers: {
    skills?: ReadonlyArray<string>;
    agents?: ReadonlyArray<string>;
    proceed?: boolean;
  } = {},
) => {
  const asked: Array<string> = [];
  const offered: Record<string, ReadonlyArray<SearchChoice>> = {};
  const prompter: Prompter = {
    skills: () => Effect.die("unexpected optional skills question"),
    mcpServers: () => Effect.die("unexpected MCP servers question"),
    requiredSkills: (choices) =>
      Effect.sync(() => {
        asked.push("skills");
        offered.skills = choices;
        return (
          answers.skills ??
          choices.filter((choice) => choice.selected).map((choice) => choice.value)
        );
      }),
    agents: (choices) =>
      Effect.sync(() => {
        asked.push("agents");
        offered.agents = choices;
        return (
          answers.agents ??
          choices.filter((choice) => choice.selected).map((choice) => choice.value)
        );
      }),
    scope: () => Effect.sync(() => (asked.push("scope"), "global" as const)),
    mode: () => Effect.sync(() => (asked.push("mode"), "symlink" as const)),
    confirmPlan: () => Effect.sync(() => (asked.push("confirm"), answers.proceed ?? true)),
    confirmRemote: () => Effect.die("unexpected remote question"),
    source: () => Effect.die("unexpected source question"),
    ensureRemoveInput: () => Effect.die("unexpected remove question"),
    anotherSource: () => Effect.die("unexpected add question"),
    confirmInstall: () => Effect.die("unexpected install question"),
  };
  return { prompter, asked, offered };
};

const runPlan = Effect.fn("runPlan")(function* (
  set: Skillset,
  flags: InstallPlanOptions,
  prompter: Prompter,
  upstream: Parameters<typeof fakeUpstream>[0] = {},
) {
  const terminal = yield* fakeTerminal([], []);
  return yield* buildInstallPlan(set, flags, prompter).pipe(
    Effect.provide(
      Layer.mergeAll(NodeFileSystem.layer, NodePath.layer, terminal, fakeUpstream(upstream)),
    ),
  );
});

it.effect("explicit install flags skip their questions", () =>
  Effect.gen(function* () {
    const asked: Array<string> = [];
    const prompter: Prompter = {
      skills: () => Effect.die("unexpected skills question"),
      mcpServers: () => Effect.die("unexpected MCP servers question"),
      requiredSkills: () => Effect.die("unexpected skills question"),
      agents: () => Effect.die("unexpected agents question"),
      scope: () => Effect.die("unexpected scope question"),
      mode: () => Effect.die("unexpected mode question"),
      confirmPlan: () => Effect.sync(() => (asked.push("confirm"), true)),
      confirmRemote: () => Effect.die("unexpected remote question"),
      source: () => Effect.die("unexpected source question"),
      ensureRemoveInput: () => Effect.die("unexpected remove question"),
      anotherSource: () => Effect.die("unexpected add question"),
      confirmInstall: () => Effect.die("unexpected install question"),
    };
    const terminal = yield* fakeTerminal([], []);
    const plan = yield* buildInstallPlan(
      skillset,
      { ...options, selected: ["beta"], agents: ["cursor"], global: true, copy: true },
      prompter,
    ).pipe(Effect.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer, terminal)));
    assert.deepStrictEqual(plan, {
      skillEntries: [beta],
      agents: ["cursor"],
      scope: "global",
      mode: "copy",
    });
    assert.deepStrictEqual(asked, ["confirm"]);
  }).pipe(Effect.provide(fakeUpstream())),
);

it.effect("plan uses scripted answers and offers all Skill Entries selected", () =>
  Effect.gen(function* () {
    const script = scripted({ skills: ["beta"], agents: ["cursor"] });
    const plan = yield* runPlan(skillset, options, script.prompter, {
      supportedAgents: [
        {
          id: "cursor",
          name: "Cursor",
          universal: false,
          projectSkillsDir: ".cursor/skills",
          globalSkillsDir: null,
        },
      ],
    });
    assert.deepStrictEqual(plan, {
      skillEntries: [beta],
      agents: ["cursor"],
      scope: "global",
      mode: "symlink",
    });
    assert.deepStrictEqual(script.asked, ["skills", "agents", "scope", "mode", "confirm"]);
    assert.deepStrictEqual(
      script.offered.skills?.map(({ value, selected }) => [value, selected]),
      [
        ["alpha", true],
        ["beta", true],
      ],
    );
  }),
);

it.effect("agent choices group Universal members and select supported defaults", () =>
  Effect.gen(function* () {
    const script = scripted();
    const agent = (id: string, name: string, universal: boolean) => ({
      id,
      name,
      universal,
      projectSkillsDir: ".agents/skills",
      globalSkillsDir: null,
    });
    const universal = agent("universal", "Universal", true);
    const cursor = agent("cursor", "Cursor", true);
    const claude = agent("claude-code", "Claude Code", false);
    const windsurf = agent("windsurf", "Windsurf", false);
    const members = Array.from({ length: 9 }, (_, index) =>
      agent(`member${index + 1}`, `Agent${index + 1}`, true),
    );
    const plan = yield* runPlan(skillset, options, script.prompter, {
      supportedAgents: [universal, cursor, ...members, claude, windsurf],
      detectedAgents: [cursor, windsurf, agent("unsupported", "Unsupported", false)],
    });
    assert.deepStrictEqual(plan?.agents, ["universal", "claude-code", "windsurf"]);
    assert.deepStrictEqual(
      script.offered.agents?.map(({ value, selected }) => [value, selected]),
      [
        ["universal", true],
        ["claude-code", true],
        ["windsurf", true],
      ],
    );
    assert.include(script.offered.agents?.[0]?.keywords ?? "", "Cursor");
    assert.strictEqual(
      script.offered.agents?.[0]?.description,
      "Cursor, Agent1, Agent2, Agent3, Agent4, Agent5, Agent6, Agent7 +2 more",
    );
  }),
);

it.effect("scripted agent selection can deselect a default", () =>
  Effect.gen(function* () {
    const script = scripted({ agents: ["claude-code"] });
    const plan = yield* runPlan(skillset, options, script.prompter);
    assert.deepStrictEqual(plan?.agents, ["claude-code"]);
    assert.isTrue(
      script.offered.agents?.some((choice) => choice.value === "universal" && choice.selected),
    );
  }),
);

it.effect("empty Skillsets and unknown names skip every question", () =>
  Effect.gen(function* () {
    const script = scripted();
    const empty = yield* runPlan(
      { ...skillset, skills: [] },
      { ...options, selected: ["missing"] },
      script.prompter,
    );
    assert.isUndefined(empty);
    const result = yield* runPlan(
      skillset,
      { ...options, selected: ["missing"] },
      script.prompter,
    ).pipe(Effect.result);
    assert.strictEqual(result._tag, "Failure");
    if (result._tag === "Failure")
      assert.strictEqual(result.failure.message, "Unknown skills: missing");
    assert.deepStrictEqual(script.asked, []);
  }),
);

it.effect("declining confirmation returns no plan", () =>
  Effect.gen(function* () {
    const script = scripted({ proceed: false });
    assert.isUndefined(yield* runPlan(skillset, options, script.prompter));
    assert.strictEqual(script.asked.at(-1), "confirm");
  }),
);

it.effect("unattended plans leave agents undefined when no defaults exist", () =>
  Effect.gen(function* () {
    const prompter = yield* makePrompter(true).pipe(Effect.provide(Stdio.layerTest({})));
    const plan = yield* runPlan(skillset, options, prompter, {
      supportedAgents: [
        {
          id: "cursor",
          name: "Cursor",
          universal: false,
          projectSkillsDir: ".cursor/skills",
          globalSkillsDir: null,
        },
      ],
    });
    assert.deepStrictEqual(plan, {
      skillEntries: [alpha, beta],
      agents: undefined,
      scope: "project",
      mode: "auto",
    });
  }),
);

it.effect("unattended agents keep default priority even when supported agents are reordered", () =>
  Effect.gen(function* () {
    const prompter = yield* makePrompter(true).pipe(Effect.provide(Stdio.layerTest({})));
    const agent = (id: string, universal = false) => ({
      id,
      name: id,
      universal,
      projectSkillsDir: ".agents/skills",
      globalSkillsDir: null,
    });
    const windsurf = agent("windsurf");
    const plan = yield* runPlan(skillset, options, prompter, {
      supportedAgents: [windsurf, agent("claude-code"), agent("universal", true)],
      detectedAgents: [windsurf],
    });
    assert.deepStrictEqual(plan?.agents, ["universal", "claude-code", "windsurf"]);
  }),
);

it.effect.each([
  { flags: { selected: ["alpha"] }, skipped: "skills" },
  { flags: { agents: ["cursor"] }, skipped: "agents" },
  { flags: { global: true }, skipped: "scope" },
  { flags: { copy: true }, skipped: "mode" },
])("$skipped question is skipped only by its flag", ({ flags, skipped }) =>
  Effect.gen(function* () {
    const script = scripted();
    yield* runPlan(skillset, { ...options, ...flags }, script.prompter);
    for (const question of ["skills", "agents", "scope", "mode", "confirm"])
      assert.strictEqual(script.asked.includes(question), question !== skipped);
  }),
);
