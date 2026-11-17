---
"@itsmeyaw/skillset": patch
---

Reuse each pinned Source when adding and installing, avoiding a second clone during `add --install`. Handle branch, tree URL, and GitHub alias Sources consistently across add and install, and reject executable Git transports before invoking Git.
