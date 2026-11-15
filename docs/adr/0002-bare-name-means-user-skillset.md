# A bare `--set` name always means a User Skillset

`--set` takes either a path or a name, and the form alone decides which. A value ending in `.json` (any case) is a path relative to the working directory. A bare name is always `<user dir>/<name>.json`. We considered looking up a name in the project first and then in the user directory, but then a command could edit a different file than the user expects, depending on what happens to exist in the working directory. Values that are neither a valid name nor a `.json` path are rejected rather than guessed.

## Consequences

- `--set my-set` never reads `./my-set.json`. Use `--set my-set.json` for that.
- `add --set <name>` creates a missing User Skillset outside the project.
- The user directory is `SKILLSET_HOME`, else `$XDG_CONFIG_HOME/skillset`, else `~/.skillset`. The first that applies wins, and directories are never merged.
