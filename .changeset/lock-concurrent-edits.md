---
"@itsmeyaw/skillset": patch
---

Running skillset in parallel on the same Skillset file or Agent config no longer silently loses edits: the run that would overwrite another run's change now fails with a clear message and a non-zero exit code.
