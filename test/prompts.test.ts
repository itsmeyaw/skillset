import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { assert, it } from "@effect/vitest";
import { Cause, Effect, Layer, Terminal } from "effect";
import { searchMultiSelect, searchSelect } from "../src/prompts/search.ts";
import { fakeTerminal, key } from "./harness.ts";

const choices = [
  { title: "Alpha", value: "a", description: "First skill" },
  { title: "Beta", value: "b", description: "Second skill" },
  { title: "Gamma", value: "c", description: "Third skill" },
];

const runPrompt = Effect.fn("runPrompt")(function* <A>(
  prompt: Effect.Effect<
    A,
    Terminal.QuitError,
    Terminal.Terminal | import("effect").FileSystem.FileSystem | import("effect").Path.Path
  >,
  keys: ReadonlyArray<Terminal.UserInput>,
) {
  const screen: Array<string> = [];
  const terminal = yield* fakeTerminal(keys, screen);
  const result = yield* prompt.pipe(
    Effect.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer, terminal)),
    Effect.exit,
  );
  return { result, screen: screen.join("") };
});

it.effect("search multiselect filters, moves, toggles, and submits", () =>
  Effect.gen(function* () {
    const result = yield* runPrompt(searchMultiSelect({ message: "Choose", choices }), [
      key("a", "a"),
      key("down"),
      key("space"),
      key("enter"),
    ]);
    assert.strictEqual(result.result._tag, "Success");
    if (result.result._tag === "Success") assert.deepStrictEqual(result.result.value, ["b"]);
    assert.include(result.screen, "Second skill");
    assert.include(result.screen, "Selected: Beta");
  }),
);

it.effect("search select filters by value and submits", () =>
  Effect.gen(function* () {
    const result = yield* runPrompt(searchSelect({ message: "Choose", choices }), [
      key("c", "c"),
      key("enter"),
    ]);
    assert.strictEqual(result.result._tag, "Success");
    if (result.result._tag === "Success") assert.strictEqual(result.result.value, "c");
  }),
);

it.effect("ctrl+a selects matches without losing hidden selections", () =>
  Effect.gen(function* () {
    const ctrlA = { ...key("a"), key: { ...key("a").key, ctrl: true } };
    const result = yield* runPrompt(searchMultiSelect({ message: "Choose", choices }), [
      key("space"),
      key("b", "b"),
      ctrlA,
      key("backspace"),
      key("down"),
      key("down"),
      key("space"),
      key("enter"),
    ]);
    assert.strictEqual(result.result._tag, "Success");
    if (result.result._tag === "Success")
      assert.deepStrictEqual(result.result.value, ["a", "b", "c"]);
    assert.include(result.screen, "Selected: Alpha, Beta +1 more");
  }),
);

it.effect("empty match state recovers after backspace", () =>
  Effect.gen(function* () {
    const result = yield* runPrompt(searchSelect({ message: "Choose", choices }), [
      key("z", "z"),
      key("enter"),
      key("backspace"),
      key("enter"),
    ]);
    assert.include(result.screen, "No matches");
    assert.strictEqual(result.result._tag, "Success");
    if (result.result._tag === "Success") assert.strictEqual(result.result.value, "a");
  }),
);

it.effect("scrolling reports remaining choices", () =>
  Effect.gen(function* () {
    const many = Array.from({ length: 12 }, (_, index) => ({
      title: `Item ${index}`,
      value: `${index}`,
    }));
    const result = yield* runPrompt(searchSelect({ message: "Choose", choices: many }), [
      ...Array.from({ length: 8 }, () => key("down")),
      key("enter"),
    ]);
    assert.include(result.screen, "↓ 5 more");
    assert.include(result.screen, "↑ 2 more");
    assert.strictEqual(result.result._tag, "Success");
    if (result.result._tag === "Success") assert.strictEqual(result.result.value, "8");
  }),
);

it.effect("escape quits the prompt", () =>
  Effect.gen(function* () {
    const result = yield* runPrompt(searchMultiSelect({ message: "Choose", choices }), [
      key("escape"),
    ]);
    assert.strictEqual(result.result._tag, "Failure");
    if (result.result._tag === "Failure")
      assert.isTrue(Terminal.isQuitError(Cause.squash(result.result.cause)));
  }),
);
