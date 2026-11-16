# @itsmeyaw/skillset

## 0.3.0

### Minor Changes

- [`478bde4`](https://github.com/itsmeyaw/skillset/commit/478bde43a87aadcde2e66c7975aef7119bb0edb1) Thanks [@itsmeyaw](https://github.com/itsmeyaw)! - Add shared default agent selection for install and searchable prompt choices, with a fallback when no default agent exists. Fix empty Skillset installs, atomic Skillset saves, preserved file permissions, rejection of control characters and existing temp files, wide-text prompt wrapping, and named Skillsets placed after agent arguments.

- [`b07d6c2`](https://github.com/itsmeyaw/skillset/commit/b07d6c2f1a8803ce47b25c5b8bf65f29791a6fd2) Thanks [@itsmeyaw](https://github.com/itsmeyaw)! - `install` now accepts only a Skillset name or `.json` path. Replace `install <source>` with `add <source> --install` to add skills and install the whole Skillset. Replace `ls -g` with `ls --user` to list User Skillsets; `-g` now means global installation scope only.

## 0.2.4

### Patch Changes

- [`6f15798`](https://github.com/itsmeyaw/skillset/commit/6f15798d1620149d2133060fbaa2f98f200e4a3e) Thanks [@itsmeyaw](https://github.com/itsmeyaw)! - First publish using changeset
