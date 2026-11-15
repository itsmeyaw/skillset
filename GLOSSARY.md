# Skillset

A curated, shareable list of agent skills pinned to exact upstream versions, so a user can install all of them at once and get exactly what the curator reviewed.

## Language

**Skillset**:
A named, shareable collection of Entries that a curator publishes for others to install together.
_Avoid_: Skill set, bundle, pack, collection

**Skillset file**:
The file on disk that holds one Skillset.
_Avoid_: Manifest, index, lockfile

**Project Skillset**:
A Skillset file that lives in the project the user is working in.
_Avoid_: Local skillset

**User Skillset**:
A Skillset the user keeps by name, outside any project, so it can be used from any project. A Skillset referred to by bare name is always a User Skillset.
_Avoid_: Global skillset, saved skillset, profile

**Entry**:
One skill inside a Skillset, identified by the skill's name.
_Avoid_: Item, record

**Source**:
Where an Entry comes from, written the way the curator gave it (e.g. `owner/repo`, `owner/repo#branch`).
_Avoid_: Origin, upstream, repo

**Pin**:
The exact commit of the Source that an Entry was taken from.
_Avoid_: Version, lock, hash

## Roles and actions

**Curator**:
The person who maintains and publishes a Skillset.
_Avoid_: Author, owner, maintainer

**Add**:
Putting an Entry into a Skillset; it changes only the Skillset file.
_Avoid_: Install (when meaning this)

**Install**:
Placing a Skillset's Entries, at their Pins, into agent skill directories. When given a Source, it first Adds Entries from that Source, then Installs every Entry in the Skillset.
_Avoid_: Add (as a synonym), sync, restore
