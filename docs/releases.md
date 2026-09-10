# Release automation

[Back to README](../README.md)

[Release Please](https://github.com/googleapis/release-please) runs on pushes to `main` and can also be run manually from the Actions tab. It maintains a release PR that updates `package.json`, `.release-please-manifest.json`, and `CHANGELOG.md`. Merge that PR to create the corresponding `vX.Y.Z` tag and GitHub Release. A dependent job builds that exact release commit and publishes the multi-platform Docker image to GitHub Container Registry with `X.Y.Z` and `latest` tags. It does not publish to npm.

Squash-merge feature PRs with a [Conventional Commit](https://www.conventionalcommits.org/) message, using the PR title as the squash commit title:

- `fix: correct queue status` triggers a patch bump.
- `feat: add calendar filters` triggers a minor bump.
- `feat!: change configuration format` (or a `BREAKING CHANGE:` footer) triggers a minor bump while below `1.0.0`, and a major bump afterward.
- Routine `chore:`, `docs:`, and `refactor:` commits without breaking changes do not trigger releases on their own.

The first automated release uses `0.1.0` as its version baseline and only considers commits after `e5f0eb2ec4ed5a5f4fac302c67df5ebf08331316`. This avoids including the earlier development history. The `bootstrap-sha` setting is ignored after the first release. A setup-only chore commit will not open a release PR until a releasable change is merged.

Release Please uses the repository Actions secret `RELEASE_PLEASE_TOKEN`. Configure it as a fine-grained personal access token restricted to this repository with **Contents**, **Issues**, and **Pull requests** read/write permissions. Replace the secret before the token expires. Review the generated release PR and ensure its CI checks pass before merging.

Using `RELEASE_PLEASE_TOKEN` instead of the built-in `GITHUB_TOKEN` allows release PR creation and updates to trigger the PR build and test checks automatically. Image publishing still runs in the same workflow using Release Please's outputs and does not use the personal access token.

The image publishing job has `packages: write` permission and uses `GITHUB_TOKEN` to authenticate to GHCR. After the first successful publish, check the `arrsenal` package settings on GitHub and set its visibility to **Public** if anonymous image pulls are desired; new packages default to private. The image's source label links it to this repository.

If image publishing fails after the GitHub Release is created, use **Re-run failed jobs** on that workflow run. This preserves the successful release job's version and commit outputs. Do not start a new manual workflow run to retry publication: Release Please will not report the existing release as newly created. When retrying an older release after a newer one has shipped, note that publishing also moves `latest` to the retried version.
