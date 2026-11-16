# Changesets

Run `pnpm changeset` to describe a user-facing change. Merging the generated "Version Packages" PR publishes to npm.

To release: merge the "Version Packages" PR. `release.yml` then publishes (approve the `npm` environment), tags and creates the GitHub Release.
