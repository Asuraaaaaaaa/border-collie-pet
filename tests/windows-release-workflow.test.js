import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import YAML from "yaml";

const workflow = YAML.parse(
  readFileSync(
    new URL("../.github/workflows/windows-release.yml", import.meta.url),
    "utf8",
  ),
);
const job = workflow.jobs.windows_installer;
const steps = job.steps;

function step(id) {
  const result = steps.find((candidate) => candidate.id === id);
  assert.ok(result, `workflow must include a step with id ${id}`);
  return result;
}

function stepIndex(id) {
  const index = steps.findIndex((candidate) => candidate.id === id);
  assert.notEqual(index, -1, `workflow must include a step with id ${id}`);
  return index;
}

test("configures tag and manual Windows installer triggers", () => {
  assert.deepEqual(workflow.on.push.tags, ["v*"]);
  assert.deepEqual(workflow.on.workflow_dispatch, {});
  assert.equal(workflow.permissions.contents, "write");
  assert.equal(job["runs-on"], "windows-latest");
});

test("installs dependencies and tests before either build path", () => {
  assert.equal(step("install").run, "npm ci");
  assert.equal(step("tests").run, "npm test");

  assert.ok(stepIndex("install") < stepIndex("version_check"));
  assert.ok(stepIndex("version_check") < stepIndex("tests"));
  assert.ok(stepIndex("tests") < stepIndex("tag_release"));
  assert.ok(stepIndex("tests") < stepIndex("manual_build"));
  assert.ok(stepIndex("manual_build") < stepIndex("manual_artifact"));
});

test("validates matching project versions only for pushed tags", () => {
  const tagCondition =
    "github.event_name == 'push' && startsWith(github.ref, 'refs/tags/')";
  const versionCheck = step("version_check");

  assert.equal(versionCheck.if, tagCondition);
  assert.equal(
    versionCheck.run,
    'node tools/validate-release-version.js "${{ github.ref_name }}"',
  );
});

test("publishes pushed tags as final GitHub releases", () => {
  const tagRelease = step("tag_release");

  assert.equal(
    tagRelease.if,
    "github.event_name == 'push' && startsWith(github.ref, 'refs/tags/')",
  );
  assert.equal(tagRelease.uses, "tauri-apps/tauri-action@v0");
  assert.equal(tagRelease.with.args, "--bundles nsis");
  assert.equal(tagRelease.with.tagName, "${{ github.ref_name }}");
  assert.equal(tagRelease.with.releaseDraft, false);
  assert.equal(tagRelease.with.prerelease, false);
});

test("manual runs build without creating a GitHub release", () => {
  const manualBuild = step("manual_build");

  assert.equal(manualBuild.if, "github.event_name == 'workflow_dispatch'");
  assert.equal(manualBuild.uses, "tauri-apps/tauri-action@v0");
  assert.equal(manualBuild.with.args, "--bundles nsis");
  assert.ok(!("tagName" in manualBuild.with));
  assert.ok(!("releaseName" in manualBuild.with));
  assert.ok(!("releaseId" in manualBuild.with));
});

test("uploads manually built NSIS installers as an artifact", () => {
  const artifact = step("manual_artifact");

  assert.equal(artifact.if, "github.event_name == 'workflow_dispatch'");
  assert.equal(artifact.uses, "actions/upload-artifact@v4");
  assert.equal(artifact.with["if-no-files-found"], "error");
  assert.equal(
    artifact.with.path,
    "src-tauri/target/release/bundle/nsis/*.exe",
  );
});
