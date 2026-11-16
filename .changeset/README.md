# Changesets

Run `pnpm changeset` to describe a user-facing change. Merging the generated "Version Packages" PR publishes to npm.

To release: merge the "Version Packages" PR. `version.yml` then pushes the `v<version>` tag with `RELEASE_PAT`, which triggers `release.yml` (approve the `npm` environment).
