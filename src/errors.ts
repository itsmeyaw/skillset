import { Schema } from "effect";
import { CliError } from "effect/cli";

// effect/cli CliError.userMessage: present typed failures without a stack trace.
export class CliMessageError extends Schema.TaggedError<
  CliMessageError,
  { readonly brand: unique symbol }
>()("CliMessageError", { message: Schema.String }) {
  override get [CliError.userMessage]() {
    return this.message;
  }
}

// Issue #15: empty Skillsets share the same message across commands.
export const emptySkillsetMessage = "This Skillset is empty.";

// Spec #1, User Stories 14 and 40: report missing skills at the checked Pin.
export const missingSkillsMessage = (commit: string, names: ReadonlyArray<string>) =>
  `Skills not found at ${commit}: ${names.join(", ")}`;

// git-ls-remote(1): multiple possible tree refs require an explicit branch.
export const ambiguousTreeMessage =
  "Ambiguous tree URL; use owner/repo#<branch-with-slashes> and -s <skill>.";
