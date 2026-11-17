import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { Cause, Effect, FileSystem, Layer, Option, Queue, Runtime, Stdio, Terminal } from "effect";
import { ChildProcessSpawner } from "effect/process";
import { TestConsole } from "effect/testing";
import type { AgentInfo, SkillSource } from "skills";
import { runArgv } from "../src/cli.ts";
import { Upstream, UpstreamError } from "../src/upstream.ts";

// Issue #11: fake Sources and listings expose the same skill descriptions.
const toSkill = (skill: string | { readonly name: string; readonly description: string }) =>
  typeof skill === "string" ? { name: skill, description: "" } : skill;

// Spec #1, install: the fake supports the standard default agents unless overridden.
const defaultAgents: ReadonlyArray<AgentInfo> = [
  {
    id: "universal",
    name: "Universal",
    projectSkillsDir: ".agents/skills",
    globalSkillsDir: null,
    universal: true,
  },
  {
    id: "claude-code",
    name: "Claude Code",
    projectSkillsDir: ".claude/skills",
    globalSkillsDir: null,
    universal: false,
  },
];

// Spec #1, Testing Decisions: the fake supplies Pins, available skills, and install failures.
export const fakeUpstream = (
  options: {
    readonly commits?: Readonly<Record<string, string | undefined>>;
    readonly commitLookups?: Array<string>;
    readonly calls?: Array<string>;
    readonly skills?: Readonly<
      Record<
        string,
        ReadonlyArray<string | { readonly name: string; readonly description: string }>
      >
    >;
    readonly failedInstalls?: ReadonlyArray<string>;
    readonly failedResults?: ReadonlyArray<string>;
    readonly installCalls?: Array<string>;
    readonly installDir?: string;
    readonly disposalLog?: string;
    readonly detectedAgents?: ReadonlyArray<AgentInfo>;
    readonly supportedAgents?: ReadonlyArray<AgentInfo>;
  } = {},
) => {
  const disposed = new WeakSet<SkillSource>();
  return Layer.succeed(
    Upstream,
    Upstream.of({
      resolveRefs: (remote, refs) => {
        options.calls?.push("resolveRefs");
        options.commitLookups?.push(JSON.stringify([remote, refs[0] ?? null]));
        return Effect.succeed(
          refs.map((ref) => options.commits?.[JSON.stringify([remote, ref ?? null])]),
        );
      },
      resolveSource: (remote, commit) => {
        options.calls?.push(`resolveSource ${remote} ${commit}`);
        const skills = options.skills?.[JSON.stringify([remote, commit])];
        if (skills === undefined) {
          return Effect.fail(
            new UpstreamError({ message: `Fake skills not configured for ${remote} at ${commit}` }),
          );
        }
        const handle: SkillSource = {
          source: { input: remote, type: "git", url: remote, commit },
          skills: skills.map(toSkill),
          dispose: async () => {
            disposed.add(handle);
            if (options.disposalLog !== undefined) {
              await appendFile(options.disposalLog, `${remote} ${commit}\n`);
            }
          },
        };
        return Effect.acquireRelease(Effect.succeed(handle), (handle) =>
          Effect.promise(() => handle.dispose()),
        );
      },
      install: (source, installOptions) => {
        options.installCalls?.push(source.source.input);
        return disposed.has(source)
          ? Effect.fail(new UpstreamError({ message: "Fake source was disposed" }))
          : options.failedInstalls?.includes(source.source.input)
            ? Effect.fail(
                new UpstreamError({ message: `Fake install failed for ${source.source.input}` }),
              )
            : options.failedResults?.includes(source.source.input)
              ? Effect.succeed({
                  source: source.source,
                  installed: [],
                  skipped: [],
                  failed: [
                    {
                      skill: "fake",
                      agent: "fake",
                      code: "SKILLS_INSTALL_FAILED" as const,
                      message: `Fake install failed for ${source.source.input}`,
                    },
                  ],
                })
              : Effect.promise(async () => {
                  if (options.installDir !== undefined) {
                    for (const agent of installOptions.agents ?? ["default"]) {
                      const dir = join(
                        options.installDir,
                        installOptions.scope ?? "project",
                        agent,
                      );
                      await mkdir(dir, { recursive: true });
                      for (const name of installOptions.skills ??
                        source.skills.map((skill) => skill.name)) {
                        await writeFile(
                          join(dir, name),
                          `${source.source.commit}:${installOptions.mode ?? "auto"}`,
                        );
                      }
                    }
                  }
                  return { source: source.source, installed: [], skipped: [], failed: [] };
                });
      },
      detectAgents: () => Effect.succeed({ agents: options.detectedAgents ?? [] }),
      getSupportedAgents: Effect.succeed(options.supportedAgents ?? defaultAgents),
    }),
  );
};

export const key = (name: string, input?: string): Terminal.UserInput => ({
  input: Option.fromNullishOr(input),
  key: { name, ctrl: false, meta: false, shift: false },
});

// NodeTerminal: Esc and Ctrl+C close the input queue after earlier keys are consumed.
export const fakeTerminal = Effect.fn("fakeTerminal")(function* (
  keys: ReadonlyArray<Terminal.UserInput>,
  screen: Array<string>,
  columns = 80,
) {
  const input = yield* Queue.unbounded<Terminal.UserInput, Cause.Done>();
  const quit = keys.findIndex(
    ({ key }) => key.name === "escape" || (key.ctrl && (key.name === "c" || key.name === "d")),
  );
  yield* Queue.offerAll(input, quit < 0 ? keys : keys.slice(0, quit));
  if (quit >= 0) yield* Queue.end(input);
  return Layer.succeed(
    Terminal.Terminal,
    Terminal.make({
      columns: Effect.succeed(columns),
      rows: Effect.succeed(24),
      size: Effect.die("unused"),
      readInput: Effect.succeed(input),
      readLine: Effect.die("unused"),
      display: (text) =>
        Effect.sync(() => {
          screen.push(text);
        }),
    }),
  );
});

export const runCli = Effect.fn("runCli")(function* (
  argv: ReadonlyArray<string>,
  options: {
    readonly keys?: ReadonlyArray<Terminal.UserInput>;
    readonly tty?: boolean;
    readonly upstream?: Parameters<typeof fakeUpstream>[0];
    readonly env?: Readonly<Record<string, string | undefined>>;
  } = {},
) {
  const screen: Array<string> = [];
  const home = yield* Effect.gen(function* () {
    return yield* (yield* FileSystem.FileSystem).makeTempDirectoryScoped();
  }).pipe(Effect.provide(NodeFileSystem.layer));
  const terminal = yield* fakeTerminal(options.keys ?? [], screen);
  const services = Layer.mergeAll(
    NodeFileSystem.layer,
    NodePath.layer,
    Stdio.layerTest({ stdinIsTerminal: Effect.succeed(options.tty ?? false) }),
    terminal,
    Layer.succeed(
      ChildProcessSpawner.ChildProcessSpawner,
      ChildProcessSpawner.make(() => Effect.die("unused")),
    ),
    fakeUpstream(options.upstream),
  );
  const exit = yield* runArgv(argv, options.env ?? { SKILLSET_HOME: home }).pipe(
    Effect.provide(services),
    Effect.exit,
  );
  let code = -1;
  Runtime.defaultTeardown(exit, (value) => {
    code = value;
  });
  return { code, out: yield* TestConsole.logLines, err: yield* TestConsole.errorLines, screen };
});
