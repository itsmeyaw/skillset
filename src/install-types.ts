import type { SkillEntry } from "./skillset-file.ts";
import type { InstallChoices } from "./upstream.ts";

export type InstallPlan = {
  readonly skillEntries: ReadonlyArray<SkillEntry>;
  readonly agents: ReadonlyArray<string> | undefined;
  readonly scope: InstallChoices["scope"];
  readonly mode: InstallChoices["mode"];
};
