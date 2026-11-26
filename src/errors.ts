import { Schema } from "effect";
import { CliError } from "effect/cli";

// effect/cli CliError.userMessage: present typed failures without a stack trace.
// CliMessageError is the cross-cutting failure; the others name one concept each.
export class CliMessageError extends Schema.TaggedError<
  CliMessageError,
  { readonly brand: unique symbol }
>()("CliMessageError", { message: Schema.String }) {
  override get [CliError.userMessage]() {
    return this.message;
  }
}

// Adding Entries to a Skillset.
export class AddError extends Schema.TaggedError<AddError, { readonly brand: unique symbol }>()(
  "AddError",
  { message: Schema.String },
) {
  override get [CliError.userMessage]() {
    return this.message;
  }
}

// Removing Entries from a Skillset.
export class RemoveError extends Schema.TaggedError<
  RemoveError,
  { readonly brand: unique symbol }
>()("RemoveError", { message: Schema.String }) {
  override get [CliError.userMessage]() {
    return this.message;
  }
}

// Updating Pins.
export class UpdateError extends Schema.TaggedError<
  UpdateError,
  { readonly brand: unique symbol }
>()("UpdateError", { message: Schema.String }) {
  override get [CliError.userMessage]() {
    return this.message;
  }
}

// Reading or validating a Skillset file.
export class SkillsetFileError extends Schema.TaggedError<
  SkillsetFileError,
  { readonly brand: unique symbol }
>()("SkillsetFileError", { message: Schema.String }) {
  override get [CliError.userMessage]() {
    return this.message;
  }
}

// Git, Source resolution and the `skills` library.
export class UpstreamError extends Schema.TaggedError<
  UpstreamError,
  { readonly brand: unique symbol }
>()("UpstreamError", { message: Schema.String }) {
  override get [CliError.userMessage]() {
    return this.message;
  }
}

// Issue #15: empty Skillsets share the same message across commands.
export const emptySkillsetMessage = "This Skillset is empty.";
export const noSkillsMessage = "This Skillset has no skills.";

// Spec #1, User Stories 14 and 40: report missing skills at the checked Pin.
export const missingSkillsMessage = (commit: string, names: ReadonlyArray<string>) =>
  `Skills not found at ${commit}: ${names.join(", ")}`;

// git-ls-remote(1): multiple possible tree refs require an explicit branch.
export const ambiguousTreeMessage =
  "Ambiguous tree URL; use owner/repo#<branch-with-slashes> and -s <skill>.";
