import { Console, Effect } from "effect";
import type { Prompt } from "effect/cli";

// Spec #11: quitting any prompt reports cancellation and exits with status 130.
export const cancelOnQuit = <A>(prompt: Prompt.Prompt<A>) =>
  prompt.pipe(
    Effect.catchTag("QuitError", () => Effect.andThen(Console.log("Cancelled"), Effect.interrupt)),
  );
