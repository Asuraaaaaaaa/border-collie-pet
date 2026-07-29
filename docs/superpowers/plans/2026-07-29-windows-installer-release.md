# Windows Installer Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically test, build, and publish an unsigned Windows x64 NSIS installer when a matching `v*` tag is pushed, while allowing manual build-only runs.

**Architecture:** A Node script reads the JSON manifests and Cargo metadata, then validates a release tag against all application versions. A GitHub Actions workflow runs validation and tests on `windows-latest`, using separate Tauri steps for tag publishing and manual artifacts. The feature document becomes the release runbook.

**Tech Stack:** GitHub Actions, Node.js ESM and `node:test`, Cargo metadata, Tauri 2, `tauri-apps/tauri-action`, NSIS, YAML.

---

## File Map

- Create `tools/validate-release-version.js`: structured version reader and tag-validation CLI.
- Create `tests/release-version.test.js`: unit and repository integration tests.
- Create `.github/workflows/windows-release.yml`: Windows test, package, artifact, and release pipeline.
- Create `tests/windows-release-workflow.test.js`: parsed workflow contract tests.
- Modify `package.json` and `package-lock.json`: add the test-only `yaml` dependency.
- Modify `FEATURES.md`: document Windows installer publishing and unsigned-package behavior.

Implementation stays in the current worktree as previously requested. Each commit must stage only its named files because unrelated uncommitted `src-tauri/` changes already exist.
Commit this reviewed plan as its own documentation commit before starting Task 1.

### Task 1: Release Version Validator

**Files:**
- Create: `tools/validate-release-version.js`
- Create: `tests/release-version.test.js`

- [ ] **Step 1: Create a loadable behavior scaffold**

Create `tools/validate-release-version.js` with exports that return empty placeholder results:

```js
export function readProjectVersions() {
  return {};
}

export function validateReleaseTag() {
  return { version: null, mismatches: [] };
}
```

- [ ] **Step 2: Write the failing tests**

Create `tests/release-version.test.js`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  readProjectVersions,
  validateReleaseTag,
} from "../tools/validate-release-version.js";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));

test("accepts matching project versions", () => {
  assert.deepEqual(validateReleaseTag("v0.3.0", {
    packageJson: "0.3.0",
    cargo: "0.3.0",
    tauri: "0.3.0",
  }), { version: "0.3.0", mismatches: [] });
});

test("reports every mismatched project version", () => {
  assert.deepEqual(validateReleaseTag("v0.4.0", {
    packageJson: "0.4.0",
    cargo: "0.3.0",
    tauri: "0.2.0",
  }), {
    version: "0.4.0",
    mismatches: [
      "Cargo package is 0.3.0, expected 0.4.0",
      "Tauri config is 0.2.0, expected 0.4.0",
    ],
  });
});

test("rejects malformed release tags", () => {
  assert.throws(() => validateReleaseTag("release-0.3.0", {}), /must start with v/);
  assert.throws(() => validateReleaseTag("v", {}), /must contain a version/);
});

test("reads the current repository versions", () => {
  const versions = readProjectVersions(projectRoot);
  assert.equal(Object.keys(versions).length, 3);
  assert.equal(new Set(Object.values(versions)).size, 1);
  assert.match(versions.packageJson, /^\d+\.\d+\.\d+/);
});
```

- [ ] **Step 3: Verify RED**

Run: `node --test tests/release-version.test.js`

Expected: FAIL on the first deep-equality assertion because the scaffold returns `version: null`.

- [ ] **Step 4: Implement the validator and CLI**

Create `tools/validate-release-version.js`:

```js
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

export function readProjectVersions(projectRoot) {
  const packageJson = readJson(path.join(projectRoot, "package.json"));
  const tauriConfig = readJson(path.join(projectRoot, "src-tauri", "tauri.conf.json"));
  const manifestPath = path.resolve(projectRoot, "src-tauri", "Cargo.toml");
  const metadata = JSON.parse(execFileSync(
    "cargo",
    ["metadata", "--no-deps", "--format-version", "1", "--manifest-path", manifestPath],
    { encoding: "utf8" },
  ));
  const cargoPackage = metadata.packages.find(
    (candidate) => path.resolve(candidate.manifest_path) === manifestPath,
  );
  if (!cargoPackage) throw new Error(`Cargo package not found for ${manifestPath}`);
  return {
    packageJson: packageJson.version,
    cargo: cargoPackage.version,
    tauri: tauriConfig.version,
  };
}

export function validateReleaseTag(tag, versions) {
  if (!tag.startsWith("v")) throw new Error("Release tag must start with v");
  const version = tag.slice(1);
  if (!version) throw new Error("Release tag must contain a version after v");
  const labels = {
    packageJson: "package.json",
    cargo: "Cargo package",
    tauri: "Tauri config",
  };
  const mismatches = Object.entries(labels)
    .filter(([key]) => versions[key] !== version)
    .map(([key, label]) => `${label} is ${versions[key]}, expected ${version}`);
  return { version, mismatches };
}

function runCli() {
  const tag = process.argv[2];
  if (!tag) throw new Error("Usage: node tools/validate-release-version.js <v-tag>");
  const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
  const result = validateReleaseTag(tag, readProjectVersions(projectRoot));
  if (result.mismatches.length) throw new Error(result.mismatches.join("\n"));
  console.log(`Release versions match ${result.version}`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    runCli();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
```

- [ ] **Step 5: Verify GREEN and CLI failure behavior**

```bash
node --test tests/release-version.test.js
node tools/validate-release-version.js v0.3.0
node tools/validate-release-version.js v9.9.9
```

Expected: tests PASS; the matching command exits 0; the mismatch command exits 1 and lists all three mismatches.

- [ ] **Step 6: Commit only validator files**

```bash
git add tools/validate-release-version.js tests/release-version.test.js
git commit -m "test: validate release versions"
```

### Task 2: Windows Build And Release Workflow

**Files:**
- Create: `.github/workflows/windows-release.yml`
- Create: `tests/windows-release-workflow.test.js`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Add the YAML test dependency**

Run: `npm install --save-dev yaml`

Expected: only development dependency metadata changes.

- [ ] **Step 2: Create a parseable workflow scaffold**

Create `.github/workflows/windows-release.yml`:

```yaml
name: Windows installer
on:
  push:
    tags: []
  workflow_dispatch: {}
permissions:
  contents: read
jobs:
  windows_installer:
    runs-on: windows-latest
    steps: []
```

- [ ] **Step 3: Write the failing parsed-workflow test**

Create `tests/windows-release-workflow.test.js`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "yaml";

const workflowUrl = new URL("../.github/workflows/windows-release.yml", import.meta.url);

test("separates manual artifacts from tag releases", () => {
  const workflow = parse(readFileSync(workflowUrl, "utf8"));
  assert.deepEqual(workflow.on.push.tags, ["v*"]);
  assert.deepEqual(workflow.on.workflow_dispatch, {});
  assert.equal(workflow.permissions.contents, "write");
  const job = workflow.jobs.windows_installer;
  assert.equal(job["runs-on"], "windows-latest");
  const steps = job.steps;
  const index = (id) => steps.findIndex((step) => step.id === id);
  assert.ok(index("version_check") >= 0);
  assert.ok(index("install") >= 0);
  assert.ok(index("tests") > index("version_check"));
  assert.ok(index("tag_release") > index("tests"));
  assert.ok(index("manual_build") > index("tests"));
  assert.ok(index("manual_artifact") > index("manual_build"));

  const release = steps[index("tag_release")];
  const tagCondition = "github.event_name == 'push' && startsWith(github.ref, 'refs/tags/')";
  assert.equal(steps[index("version_check")].if, tagCondition);
  assert.equal(steps[index("version_check")].run, 'node tools/validate-release-version.js "${{ github.ref_name }}"');
  assert.equal(steps[index("install")].run, "npm ci");
  assert.equal(steps[index("tests")].run, "npm test");
  assert.equal(release.if, tagCondition);
  assert.equal(release.uses, "tauri-apps/tauri-action@v0");
  assert.equal(release.with.args, "--bundles nsis");
  assert.equal(release.with.tagName, "${{ github.ref_name }}");
  assert.equal(release.with.releaseDraft, false);
  assert.equal(release.with.prerelease, false);

  const manual = steps[index("manual_build")];
  assert.equal(manual.if, "github.event_name == 'workflow_dispatch'");
  assert.equal(manual.with.args, "--bundles nsis");
  assert.equal(manual.with.tagName, undefined);
  assert.equal(manual.with.releaseName, undefined);
  assert.equal(manual.with.releaseId, undefined);

  const artifact = steps[index("manual_artifact")];
  assert.equal(artifact.if, "github.event_name == 'workflow_dispatch'");
  assert.equal(artifact.with["if-no-files-found"], "error");
  assert.match(artifact.with.path, /bundle\/nsis\/\*\.exe/);
});
```

- [ ] **Step 4: Verify RED**

Run: `node --test tests/windows-release-workflow.test.js`

Expected: FAIL because the scaffold lacks the tag trigger, permissions, and required steps.

- [ ] **Step 5: Implement the workflow**

Create `.github/workflows/windows-release.yml`:

```yaml
name: Windows installer

on:
  push:
    tags:
      - "v*"
  workflow_dispatch: {}

permissions:
  contents: write

jobs:
  windows_installer:
    runs-on: windows-latest
    steps:
      - name: Check out source
        uses: actions/checkout@v4
      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - name: Set up Rust
        uses: dtolnay/rust-toolchain@stable
      - name: Cache Rust build
        uses: Swatinem/rust-cache@v2
        with:
          workspaces: src-tauri -> target
      - name: Install dependencies
        id: install
        run: npm ci
      - name: Validate release versions
        id: version_check
        if: github.event_name == 'push' && startsWith(github.ref, 'refs/tags/')
        run: node tools/validate-release-version.js "${{ github.ref_name }}"
      - name: Run tests
        id: tests
        run: npm test
      - name: Build and publish tag release
        id: tag_release
        if: github.event_name == 'push' && startsWith(github.ref, 'refs/tags/')
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tagName: ${{ github.ref_name }}
          releaseName: "LinePuppy ${{ github.ref_name }}"
          releaseBody: "Windows x64 installer for LinePuppy ${{ github.ref_name }}. This installer is unsigned, so Windows SmartScreen may show an unknown-publisher warning."
          releaseDraft: false
          prerelease: false
          args: --bundles nsis
      - name: Build manual artifact
        id: manual_build
        if: github.event_name == 'workflow_dispatch'
        uses: tauri-apps/tauri-action@v0
        with:
          args: --bundles nsis
      - name: Upload manual installer
        id: manual_artifact
        if: github.event_name == 'workflow_dispatch'
        uses: actions/upload-artifact@v4
        with:
          name: LinePuppy-Windows-x64-installer
          path: src-tauri/target/release/bundle/nsis/*.exe
          if-no-files-found: error
```

- [ ] **Step 6: Verify GREEN and the full suite**

```bash
node --test tests/windows-release-workflow.test.js
npm test
```

Expected: workflow contract and all existing tests PASS.

- [ ] **Step 7: Commit workflow files only**

```bash
git add .github/workflows/windows-release.yml tests/windows-release-workflow.test.js package.json package-lock.json
git commit -m "ci: build Windows installer releases"
```

### Task 3: Release Documentation

**Files:**
- Modify: `FEATURES.md`
- Modify: `tests/windows-release-workflow.test.js`

- [ ] **Step 1: Add a failing documentation contract**

Add:

```js
test("documents automated Windows installer releases", () => {
  const features = readFileSync(new URL("../FEATURES.md", import.meta.url), "utf8");
  assert.match(features, /GitHub Actions/);
  assert.match(features, /v0\.3\.0/);
  assert.match(features, /NSIS.*\.exe/);
  assert.match(features, /SmartScreen/);
  assert.match(features, /workflow_dispatch/);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test tests/windows-release-workflow.test.js`

Expected: FAIL because `FEATURES.md` does not document the automated release flow.

- [ ] **Step 3: Add the release runbook**

Add under `七、启动 / 构建`:

```markdown
### Windows 一键安装包

- 推送与项目版本一致的标签（例如 `v0.3.0`）后，GitHub Actions 会在 Windows x64 环境运行测试并构建 NSIS `.exe` 安装程序。
- 构建成功后，安装程序会自动附加到对应的 GitHub Release，用户从 Releases 页面下载并双击安装。
- Actions 页面可通过 `workflow_dispatch` 手动构建测试安装包；手动运行只上传 Artifact，不创建 Release。
- 当前安装包尚未进行代码签名，Windows SmartScreen 可能显示“未知发布者”提示。
- 发布标签必须与 `package.json`、`src-tauri/Cargo.toml` 和 `src-tauri/tauri.conf.json` 中的版本一致。
```

- [ ] **Step 4: Verify GREEN and commit**

```bash
node --test tests/windows-release-workflow.test.js
npm test
git add FEATURES.md tests/windows-release-workflow.test.js
git commit -m "docs: explain Windows installer releases"
```

### Task 4: Final Verification And GitHub Handoff

**Files:** Verify only.

- [ ] **Step 1: Verify syntax and whitespace**

```bash
git diff --check
node --check tools/validate-release-version.js
node --check tests/release-version.test.js
node --check tests/windows-release-workflow.test.js
```

Expected: all commands exit 0.

- [ ] **Step 2: Run project verification**

```bash
npm test
cargo check --manifest-path src-tauri/Cargo.toml
npm run tauri -- build --debug --no-bundle
```

Expected: tests, Cargo check, and the Tauri debug build pass. The existing upstream `block v0.1.6` future-incompatibility notice may remain.

- [ ] **Step 3: Audit commit boundaries**

```bash
git status --short --branch
git log --oneline -6
git diff HEAD~3..HEAD -- .github tools tests package.json package-lock.json FEATURES.md
```

Expected: three focused commits contain only the planned release files; unrelated `src-tauri/` changes remain separate.

- [ ] **Step 4: Obtain authorization before pushing**

GitHub-hosted verification requires the commits on the remote. Do not run `git push origin main` until the user explicitly authorizes the push.

- [ ] **Step 5: Verify a manual GitHub build**

Run `Windows installer` through `workflow_dispatch`. Expected: one successful `windows_installer` job and a `LinePuppy-Windows-x64-installer` artifact containing one NSIS `.exe`.

- [ ] **Step 6: Obtain confirmation before publishing the first release**

Creating and pushing a tag publishes externally. Confirm versions and obtain explicit approval immediately before:

```bash
git tag v0.3.0
git push origin v0.3.0
```

Expected: GitHub creates a published `LinePuppy v0.3.0` Release with the Windows x64 NSIS installer. Verify installation, launch, tray menu, transparent window, pomodoro start/stop, and global keyboard counting on Windows 10/11.
