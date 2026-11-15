#!/usr/bin/env node
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { CliConfig } from "effect/cli";
import { cliConfig, run } from "./cli.ts";
import { UpstreamLive } from "./upstream-live.ts";

// Issue #11: the production runner uses the same wizard-free configuration as runArgv.
run.pipe(
  Effect.provideService(CliConfig.CliConfig, cliConfig),
  Effect.provide(Layer.provideMerge(UpstreamLive, NodeServices.layer)),
  NodeRuntime.runMain,
);
