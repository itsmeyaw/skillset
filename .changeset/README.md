# Changesets

Run `pnpm changeset` to describe a user-facing change. Merging the generated "Version Packages" PR publishes to npm.

To release: merge the "Version Packages" PR, then tag the merge commit and push the tag (the tag triggers the publish):

```sh
git checkout main && git pull
git tag "v$(node -p "require('./package.json').version")" && git push origin --tags
```
