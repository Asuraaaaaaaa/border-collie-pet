import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import {
  readProjectVersions,
  validateReleaseTag,
} from '../tools/validate-release-version.js';

test('accepts matching project versions for a release tag', () => {
  assert.deepEqual(
    validateReleaseTag('v0.3.0', {
      packageJson: '0.3.0',
      cargoPackage: '0.3.0',
      tauriConfig: '0.3.0',
    }),
    { version: '0.3.0', mismatches: [] },
  );
});

test('reports cargo and Tauri version mismatches', () => {
  assert.deepEqual(
    validateReleaseTag('v0.3.0', {
      packageJson: '0.3.0',
      cargoPackage: '0.3.1',
      tauriConfig: '0.2.9',
    }).mismatches,
    [
      'Cargo package version 0.3.1 does not match release tag v0.3.0',
      'Tauri config version 0.2.9 does not match release tag v0.3.0',
    ],
  );
});

test('rejects tags without a leading version suffix', () => {
  assert.throws(() => validateReleaseTag('0.3.0', {}), /must start with v/);
  assert.throws(() => validateReleaseTag('v', {}), /must include a version/);
});

test('reads the three version sources from this repository', () => {
  const projectRoot = path.resolve(import.meta.dirname, '..');
  const versions = readProjectVersions(projectRoot);

  assert.equal(Object.keys(versions).length, 3);
  assert.deepEqual(Object.values(versions), Array(3).fill(versions.packageJson));
  assert.match(versions.packageJson, /^\d+\.\d+\.\d+/);
});
