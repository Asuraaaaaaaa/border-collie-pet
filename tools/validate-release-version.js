import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultProjectRoot = path.resolve(scriptDirectory, '..');

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

export function readProjectVersions(projectRoot = defaultProjectRoot) {
  const packageJson = readJson(path.resolve(projectRoot, 'package.json'));
  const tauriConfig = readJson(path.resolve(projectRoot, 'src-tauri/tauri.conf.json'));
  const cargoManifestPath = path.resolve(projectRoot, 'src-tauri/Cargo.toml');
  const cargoMetadata = JSON.parse(
    execFileSync(
      'cargo',
      [
        'metadata',
        '--no-deps',
        '--format-version',
        '1',
        '--manifest-path',
        cargoManifestPath,
      ],
      { encoding: 'utf8' },
    ),
  );
  const resolvedManifestPath = realpathSync(cargoManifestPath);
  const cargoPackage = cargoMetadata.packages.find(
    (candidate) => realpathSync(candidate.manifest_path) === resolvedManifestPath,
  );

  if (!cargoPackage) {
    throw new Error(`Cargo package was not found for ${resolvedManifestPath}`);
  }

  return {
    packageJson: packageJson.version,
    cargoPackage: cargoPackage.version,
    tauriConfig: tauriConfig.version,
  };
}

export function validateReleaseTag(tag, projectVersions) {
  if (!tag.startsWith('v')) {
    throw new Error('Release tag must start with v');
  }

  const version = tag.slice(1);
  if (!version) {
    throw new Error('Release tag must include a version');
  }

  const versionSources = [
    ['packageJson', 'package.json'],
    ['cargoPackage', 'Cargo package'],
    ['tauriConfig', 'Tauri config'],
  ];
  const mismatches = versionSources.flatMap(([key, label]) => {
    const projectVersion = projectVersions[key];
    return projectVersion === version
      ? []
      : [`${label} version ${projectVersion} does not match release tag ${tag}`];
  });

  return { version, mismatches };
}

function runCli() {
  const [tag] = process.argv.slice(2);
  const result = validateReleaseTag(tag, readProjectVersions(defaultProjectRoot));

  if (result.mismatches.length === 0) {
    console.log(`Release versions match ${result.version}`);
    return;
  }

  console.error(result.mismatches.join('\n'));
  process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli();
}
