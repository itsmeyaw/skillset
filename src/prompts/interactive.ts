import { Effect, Stdio } from "effect";

// Issue #11: prompts run only on a TTY when --yes is absent.
export const isInteractive = (yes: boolean) =>
  yes ? Effect.succeed(false) : Stdio.Stdio.use((stdio) => stdio.stdinIsTerminal);
