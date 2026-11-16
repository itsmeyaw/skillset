import { stripVTControlCharacters } from "node:util";
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

// ECMA-48: upstream text must not execute terminal control sequences.
const safeText = (text: string) =>
  Array.from(stripVTControlCharacters(text), (char) => {
    const code = char.codePointAt(0)!;
    return code < 32 || (code >= 127 && code <= 159) ? " " : char;
  }).join("");

// Unicode UAX #11: conservatively count non-ASCII code points as two columns.
const width = (text: string) =>
  Array.from(text).reduce((columns, char) => columns + (char.codePointAt(0)! < 128 ? 1 : 2), 0);

// Issue #11: search names and IDs without discarding selections hidden by the filter.
const matches = (choices: ReadonlyArray<SearchChoice>, query: string) =>
  choices.filter((choice) =>
    `${choice.title}\n${choice.value}`.toLowerCase().includes(query.toLowerCase()),
  );

const search = (
  options: SearchOptions,
  multiple: boolean,
): Prompt.Prompt<ReadonlyArray<string>> => {
  // Issue #11: detected agents begin selected; skill choices begin unselected.
  const initial: SearchState = {
    query: "",
    index: 0,
    selected: new Set(
      options.choices.filter((choice) => choice.selected).map((choice) => choice.value),
    ),
    error: "",
  };
  // Issue #11: render a scrolling window, selection summary, and highlighted description.
  const frame = (state: SearchState, rows: number, columns: number) => {
    const filtered = matches(options.choices, state.query);
    const height = Math.max(1, Math.min(7, rows - 7));
    const start = Math.max(0, Math.min(state.index - height + 1, filtered.length - height));
    // Set iterates in insertion order, so reversing lists the most recently selected first.
    const titles = new Map(options.choices.map((choice) => [choice.value, choice.title]));
    const chosen = Array.from(state.selected)
      .reverse()
      .map((value) => safeText(titles.get(value) ?? value));
    const summary =
      chosen.slice(0, 2).join(", ") + (chosen.length > 2 ? ` +${chosen.length - 2} more` : "");
    const lines = [
      `${options.message}  Search: ${state.query}`,
      ...(multiple ? [`Selected: ${summary || "none"}`] : []),
    ];
    if (start > 0) lines.push(`  ↑ ${start} more`);
    for (const [index, choice] of filtered.slice(start, start + height).entries()) {
      lines.push(
        `${start + index === state.index ? "❯" : " "} ${multiple ? (state.selected.has(choice.value) ? "[x] " : "[ ] ") : ""}${safeText(choice.title)}`,
      );
    }
    if (start + height < filtered.length)
      lines.push(`  ↓ ${filtered.length - start - height} more`);
    if (filtered.length === 0) lines.push("  No matches");
    const description = filtered[state.index]?.description;
    if (description) lines.push(`  ${safeText(description).replace(/\s+/gu, " ")}`);
    if (state.error) lines.push(state.error);
    // Unicode UAX #11: reserve two columns for the ellipsis and truncate by code point.
    // Issue #11: keep the scrolling window visible when descriptions are long.
    return lines
      .map((line) => {
        if (width(line) < columns) return line;
        if (columns === 1) return ".";
        let prefix = "";
        let used = 0;
        for (const char of line) {
          used += width(char);
          if (used > columns - 2) break;
          prefix += char;
        }
        return `${prefix}…`;
      })
      .join("\n");
  };
  return Prompt.Custom<SearchState, ReadonlyArray<string>>(initial, {
    render: (state, action) =>
      Effect.gen(function* () {
        // ECMA-48: BEL signals an unsupported key without redrawing the frame.
        if (action._tag === "Beep") return "\u0007";
        if (action._tag === "Submit") {
          const chosen = options.choices
            .filter((choice) => action.value.includes(choice.value))
            .map((choice) => safeText(choice.title));
          return `${options.message}: ${chosen.join(", ")}\n`;
        }
        const terminal = yield* Terminal.Terminal;
        return frame(state, yield* terminal.rows, Math.max(1, yield* terminal.columns));
      }),
    clear: (state) =>
      Effect.gen(function* () {
        const terminal = yield* Terminal.Terminal;
        const columns = Math.max(1, yield* terminal.columns);
        const text = frame(state, yield* terminal.rows, columns);
        const lines = text
          .split("\n")
          .reduce((count, line) => count + Math.max(1, Math.ceil(width(line) / columns)), 0);
        // ECMA-48: CR and CSI erase-line/cursor-up clear the previous frame.
        return "\r\x1b[2K" + "\x1b[1A\r\x1b[2K".repeat(lines - 1);
      }),
    // Issue #11: navigation, filtering, selection, and submission respond to keypresses.
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
        return next({ query: Array.from(state.query).slice(0, -1).join(""), index: 0 });
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

// Issue #11: dropdowns and multiselects use the same searchable interaction.
export const searchMultiSelect = (options: SearchOptions) => search(options, true);
export const searchSelect = (options: SearchOptions) =>
  Prompt.map(search(options, false), (values) => values[0]!);
