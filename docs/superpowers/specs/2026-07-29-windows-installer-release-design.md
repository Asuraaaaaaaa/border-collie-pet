# Windows Installer Release Design

## Goal

Produce a Windows x64 NSIS installer that users can download from GitHub Releases and install through the normal Windows setup wizard. Creating a version tag such as `v0.3.0` must build, test, and publish the installer automatically without requiring a local Windows machine.

## Scope

This work adds one GitHub Actions workflow for Windows packaging and release publishing. It does not add MSI or portable ZIP packages, Windows ARM64 builds, code signing, automatic updates, or changes to the application UI.

The first releases will be unsigned. Windows SmartScreen may therefore show an unknown-publisher warning. Code signing can be added later without changing the release trigger or installer format.

## Release Interface

The workflow supports two entry points:

- A pushed `v*` tag builds the application and publishes a non-draft GitHub Release for that tag. The NSIS `.exe` installer is attached to the release.
- A manual `workflow_dispatch` run performs the same test and build steps, then uploads the installer as a GitHub Actions artifact without creating a GitHub Release.

Tag releases are intended for end users. Manual runs are intended for checking Windows packaging before a version is published.

## Build Environment

The workflow runs on GitHub's `windows-latest` x64 runner and uses:

- `actions/checkout` to obtain the tagged source
- `actions/setup-node` with npm caching
- the stable Rust MSVC toolchain with Cargo caching
- `npm ci` for the locked Node dependency set
- `npm test` as the release gate
- the official `tauri-apps/tauri-action` to build the NSIS installer and publish tag releases
- `actions/upload-artifact` to retain the installer from manual runs

The Tauri build target is NSIS only. The expected user-facing result is one Windows setup `.exe` rather than multiple installer formats.

## Version Validation

For a tag-triggered release, the workflow derives the version from the tag by removing the leading `v`. Before building, it verifies that this value matches all three application version declarations:

- `package.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`

Any mismatch fails the job before packaging. Manual runs skip tag comparison but still run the full test and build path.

## Permissions And Publishing

The workflow declares `contents: write` so the tag job can create a GitHub Release and upload assets through the repository-provided `GITHUB_TOKEN`. No custom token or long-lived credential is required.

Release publishing occurs only after version validation, tests, and the Windows build succeed. The release is created as a normal published release rather than a draft or prerelease.

## Failure Behavior

- Dependency installation failure stops the job.
- Version mismatch stops the job and prevents a mislabeled release.
- Test failure prevents packaging and publishing.
- Packaging failure leaves no successful Release asset.
- Manual runs always avoid Release creation, even when the build succeeds.

The workflow must not overwrite an unrelated existing release or silently publish an installer built from a version-mismatched source tree.

## Verification

Implementation is complete when:

1. The workflow YAML is syntactically valid and follows GitHub Actions event semantics.
2. The version-validation step passes for a matching sample tag and fails for a mismatch.
3. Existing JavaScript and Rust tests pass locally.
4. A manual GitHub Actions run on `windows-latest` produces a downloadable NSIS `.exe` artifact.
5. Pushing a matching version tag creates a published GitHub Release containing the same installer format.

The final two checks require GitHub's Windows runner and therefore occur after the workflow commit is pushed.

## Release Procedure

For each release, update the versions in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`, commit the release source, and push a matching tag:

```text
v0.3.0
```

GitHub Actions then tests, packages, and publishes the Windows installer. The release page becomes the stable download location for users.
