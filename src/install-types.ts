import type { Entry } from "./skillset-file.ts";
import type { InstallChoices } from "./upstream.ts";

export type InstallPlan = {
  readonly entries: ReadonlyArray<Entry>;
  readonly agents: ReadonlyArray<string> | undefined;
  readonly scope: InstallChoices["scope"];
  readonly mode: InstallChoices["mode"];
};
