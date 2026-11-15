import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { Cause, Effect, Layer, Option, Queue, Runtime, Stdio, Terminal } from "effect";
import { ChildProcessSpawner } from "effect/process";
import { TestConsole } from "effect/testing";
import type { AgentInfo, SkillSource } from "skills";
import { runArgv } from "../src/cli.ts";
import { Upstream, UpstreamError } from "../src/upstream.ts";

// Spec #1, Testing Decisions: the fake supplies Pins, available skills, and install failures.
export const fakeUpstream = (
  options: {
    readonly commits?: Readonly<Record<string, string>>;
    readonly commitLookups?: Array<string>;
    readonly skills?: Readonly<Record<string, ReadonlyArray<string>>>;
    readonly failedInstalls?: ReadonlyArray<string>;
    readonly failedResults?: ReadonlyArray<string>;
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
      resolveCommit: (source, ref) => {
        options.commitLookups?.push(JSON.stringify([source, ref ?? null]));
        const commit = options.commits?.[JSON.stringify([source, ref ?? null])];
        return commit === undefined
          ? Effect.fail(new UpstreamError({ message: `Fake commit not configured for ${source}` }))
          : Effect.succeed(commit);
      },
      listSkills: (source, commit) => {
        const skills = options.skills?.[JSON.stringify([source, commit])];
        return skills === undefined
          ? Effect.fail(
              new UpstreamError({
                message: `Fake skills not configured for ${source} at ${commit}`,
              }),
            )
          : Effect.succeed(skills);
      },
      resolveSource: (source, commit) => {
        const skills = options.skills?.[JSON.stringify([source, commit])];
        if (skills === undefined) {
          return Effect.fail(
            new UpstreamError({ message: `Fake skills not configured for ${source} at ${commit}` }),
          );
        }
        const handle: SkillSource = {
          source: { input: source, type: "git", url: source, commit },
          skills: skills.map((name) => ({ name, description: "" })),
          dispose: async () => {
            disposed.add(handle);
            if (options.disposalLog !== undefined) {
              await appendFile(options.disposalLog, `${source} ${commit}\n`);
            }
          },
        };
        return Effect.acquireRelease(Effect.succeed(handle), (handle) =>
          Effect.promise(() => handle.dispose()),
        );
      },
      install: (source, installOptions) =>
        disposed.has(source)
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
                }),
      detectAgents: () => Effect.succeed({ agents: options.detectedAgents ?? [] }),
      getSupportedAgents: Effect.succeed(options.supportedAgents ?? []),
    }),
  );
};

export const key = (name: string, input?: string): Terminal.UserInput => ({
  input: Option.fromNullishOr(input),
  key: { name, ctrl: false, meta: false, shift: false },
});

export const runCli = Effect.fn("runCli")(function* (
  argv: ReadonlyArray<string>,
  options: {
    readonly keys?: ReadonlyArray<Terminal.UserInput>;
    readonly tty?: boolean;
    readonly upstream?: Parameters<typeof fakeUpstream>[0];
  } = {},
) {
  const screen: Array<string> = [];
  const input = yield* Queue.unbounded<Terminal.UserInput, Cause.Done>();
  yield* Queue.offerAll(input, options.keys ?? []);
  const services = Layer.mergeAll(
    NodeFileSystem.layer,
    NodePath.layer,
    Stdio.layerTest({ stdinIsTerminal: Effect.succeed(options.tty ?? false) }),
    Layer.succeed(
      Terminal.Terminal,
      Terminal.make({
        columns: Effect.succeed(80),
        rows: Effect.succeed(24),
        size: Effect.die("unused"),
        readInput: Effect.succeed(input),
        readLine: Effect.die("unused"),
        display: (text) =>
          Effect.sync(() => {
            screen.push(text);
          }),
      }),
    ),
    Layer.succeed(
      ChildProcessSpawner.ChildProcessSpawner,
      ChildProcessSpawner.make(() => Effect.die("unused")),
    ),
    fakeUpstream(options.upstream),
  );
  const exit = yield* runArgv(argv).pipe(Effect.provide(services), Effect.exit);
  let code = -1;
  Runtime.defaultTeardown(exit, (value) => {
    code = value;
  });
  return { code, out: yield* TestConsole.logLines, err: yield* TestConsole.errorLines, screen };
});
