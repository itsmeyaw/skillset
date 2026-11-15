#!/usr/bin/env node
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { run } from "./cli.ts";
import { UpstreamLive } from "./upstream-live.ts";

run.pipe(Effect.provide(Layer.provideMerge(UpstreamLive, NodeServices.layer)), NodeRuntime.runMain);
