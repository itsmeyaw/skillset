# Skillset

A curated, shareable list of agent skills and MCP servers, recorded exactly as the curator reviewed them, so a user can install all of them at once and get exactly that.

## Language

**Skillset**:
A named, shareable collection of Entries that a curator publishes for others to install together.
_Avoid_: Skill set, bundle, pack, collection

**Skillset file**:
The file on disk that holds one Skillset.
_Avoid_: Manifest, index, lockfile

**Skillset store**:
The module that resolves and loads a Skillset file, saves it, and edits its Entries.

**Project Skillset**:
A Skillset file that lives in the project the user is working in.
_Avoid_: Local skillset

**User Skillset**:
A Skillset the user keeps by name, outside any project, so it can be used from any project. A Skillset referred to by bare name is always a User Skillset.
_Avoid_: Global skillset, saved skillset, profile

**Remote Skillset**:
A Skillset published at an `https` URL instead of kept on disk. It can be installed or listed, never edited.
_Avoid_: Remote source (a Source is where an Entry comes from), URL skillset

**Entry**:
One item inside a Skillset: a Skill Entry or an MCP Entry, identified by its name.
_Avoid_: Item, record

**Skill Entry**:
An Entry for one agent skill, taken from a Source at a Pin.
_Avoid_: Skill (when meaning the Entry)

**MCP Entry**:
An Entry for one MCP server: how an agent starts or reaches it, and which inputs it needs. It never holds secret values.
_Avoid_: Server, MCP, tool, connector

**Source**:
Where a Skill Entry comes from, written the way the curator gave it (e.g. `owner/repo`, `owner/repo#branch`).
_Avoid_: Origin, upstream, repo

**Pin**:
The exact commit of the Source that a Skill Entry was taken from. MCP Entries have versions, not Pins.
_Avoid_: Version, lock, hash

**Registry**:
A service that publishes MCP servers through the MCP Registry API, such as the official MCP Registry. An MCP Entry added from one remembers it.
_Avoid_: Marketplace, catalog, Source

**Pinning**:
The module that resolves Sources to Pins and skills. Upstream verifies Entries at their Pins during Install.

**Install plan**:
The Entries, agents, scope, and mode chosen for one Install before any skills are written.

**Prompter**:
The interface that asks for user choices or supplies unattended defaults to Add, Install, and Remove.

**Agent**:
A coding tool, such as Claude Code or Cursor, that Skillset installs skills or MCP servers into.
_Avoid_: Client, host, IDE

**Universal agents**:
The agents that read skills from the shared `.agents/skills` directory, so one install reaches all of them.
_Avoid_: Generic agents, shared agents

## Roles and actions

**Curator**:
The person who maintains and publishes a Skillset.
_Avoid_: Author, owner, maintainer

**Add**:
Putting an Entry into a Skillset; it changes only the Skillset file.
_Avoid_: Install (when meaning this)

**Install**:
Placing a Skillset's Entries into Agents: Skill Entries at their Pins into skill directories, MCP Entries into each Agent's MCP configuration. Install always starts from a Skillset, never from a Source or a Registry.
_Avoid_: Add (as a synonym), sync, restore
