import { Effect, Option, Terminal } from "effect";
import { Prompt } from "effect/cli";

export type SearchChoice = {
  readonly title: string;
  readonly value: string;
  readonly description?: string;
  readonly selected?: boolean;
};

type SearchOptions = {
  readonly message: string;
  readonly choices: ReadonlyArray<SearchChoice>;
  readonly min?: number;
};

type SearchState = {
  readonly query: string;
  readonly index: number;
  readonly selected: ReadonlySet<string>;
  readonly error: string;
};

// Spec #11: search names and IDs without discarding selections hidden by the filter.
const matches = (choices: ReadonlyArray<SearchChoice>, query: string) =>
  choices.filter((choice) =>
    `${choice.title}\n${choice.value}`.toLowerCase().includes(query.toLowerCase()),
  );

const search = (
  options: SearchOptions,
  multiple: boolean,
): Prompt.Prompt<ReadonlyArray<string>> => {
  const initial: SearchState = {
    query: "",
    index: 0,
    selected: new Set(
      options.choices.filter((choice) => choice.selected).map((choice) => choice.value),
    ),
    error: "",
  };
  const frame = (state: SearchState, rows: number) => {
    const filtered = matches(options.choices, state.query);
    const height = Math.max(1, Math.min(7, rows - 7));
    const start = Math.max(0, Math.min(state.index - height + 1, filtered.length - height));
    const chosen = options.choices
      .filter((choice) => state.selected.has(choice.value))
      .map((choice) => choice.title);
    const summary =
      chosen.slice(0, 2).join(", ") + (chosen.length > 2 ? ` +${chosen.length - 2} more` : "");
    const lines = [
      `${options.message}  Search: ${state.query}`,
      ...(multiple ? [`Selected: ${summary || "none"}`] : []),
    ];
    if (start > 0) lines.push(`  ↑ ${start} more`);
    for (const [index, choice] of filtered.slice(start, start + height).entries()) {
      lines.push(
        `${start + index === state.index ? "❯" : " "} ${multiple ? (state.selected.has(choice.value) ? "[x] " : "[ ] ") : ""}${choice.title}`,
      );
    }
    if (start + height < filtered.length)
      lines.push(`  ↓ ${filtered.length - start - height} more`);
    if (filtered.length === 0) lines.push("  No matches");
    const description = filtered[state.index]?.description;
    if (description) lines.push(`  ${description.replace(/\s+/gu, " ")}`);
    if (state.error) lines.push(state.error);
    return lines.join("\n");
  };
  return Prompt.Custom<SearchState, ReadonlyArray<string>>(initial, {
    render: (state, action) =>
      Effect.gen(function* () {
        if (action._tag === "Submit") {
          const chosen = options.choices
            .filter((choice) => action.value.includes(choice.value))
            .map((choice) => choice.title);
          return `${options.message}: ${chosen.join(", ")}\n`;
        }
        const terminal = yield* Terminal.Terminal;
        return frame(state, yield* terminal.rows);
      }),
    clear: (state) =>
      Effect.gen(function* () {
        const terminal = yield* Terminal.Terminal;
        const text = frame(state, yield* terminal.rows);
        const columns = Math.max(1, yield* terminal.columns);
        const lines = text
          .split("\n")
          .reduce((count, line) => count + Math.max(1, Math.ceil(line.length / columns)), 0);
        return "\r\x1b[2K" + "\x1b[1A\r\x1b[2K".repeat(lines - 1);
      }),
    process: (input, state) => {
      const filtered = matches(options.choices, state.query);
      const selected = new Set(state.selected);
      const next = (change: Partial<SearchState>) =>
        Effect.succeed({ _tag: "NextFrame" as const, state: { ...state, error: "", ...change } });
      if (input.key.ctrl && input.key.name === "a" && multiple) {
        for (const choice of filtered) selected.add(choice.value);
        return next({ selected });
      }
      if (input.key.name === "up" || input.key.name === "down") {
        const delta = input.key.name === "up" ? -1 : 1;
        return next({
          index:
            filtered.length === 0 ? 0 : (state.index + delta + filtered.length) % filtered.length,
        });
      }
      if (input.key.name === "space" && multiple) {
        const choice = filtered[state.index];
        if (choice) {
          if (selected.has(choice.value)) selected.delete(choice.value);
          else selected.add(choice.value);
        }
        return next({ selected });
      }
      if (input.key.name === "enter" || input.key.name === "return") {
        const values = multiple
          ? options.choices
              .filter((choice) => selected.has(choice.value))
              .map((choice) => choice.value)
          : filtered[state.index]
            ? [filtered[state.index]!.value]
            : [];
        if (values.length < (options.min ?? (multiple ? 0 : 1)))
          return next({ error: `At least ${options.min ?? 1} are required` });
        return Effect.succeed({ _tag: "Submit" as const, value: values });
      }
      if (input.key.name === "backspace")
        return next({ query: state.query.slice(0, -1), index: 0 });
      if (
        !input.key.ctrl &&
        !input.key.meta &&
        Option.isSome(input.input) &&
        input.input.value &&
        Array.from(input.input.value).every(
          (char) => char >= " " && char !== String.fromCharCode(127),
        )
      )
        return next({ query: state.query + input.input.value, index: 0 });
      return Effect.succeed({ _tag: "Beep" as const });
    },
  });
};

// Spec #11: dropdowns and multiselects use the same searchable interaction.
export const searchMultiSelect = (options: SearchOptions) => search(options, true);
export const searchSelect = (options: SearchOptions) =>
  Prompt.map(search(options, false), (values) => values[0]!);
