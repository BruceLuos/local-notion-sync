import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

test('desktop packaging smoke setup is present', async () => {
  const packageJsonPath = path.join(repoRoot, 'package.json');
  const packageJsonRaw = await fs.readFile(packageJsonPath, 'utf8');
  const packageJson = JSON.parse(packageJsonRaw);

  assert.equal(packageJson.main, 'electron/main.mjs');

  assert.equal(packageJson.scripts?.['desktop:dev'], 'electron-forge start');
  assert.equal(packageJson.scripts?.['desktop:package'], 'electron-forge package');
  assert.equal(packageJson.scripts?.['desktop:make'], 'electron-forge make');

  assert.equal(packageJson.devDependencies?.electron, '^36.3.1');
  assert.equal(packageJson.devDependencies?.['@electron-forge/cli'], '^7.7.0');
  assert.equal(packageJson.devDependencies?.['@electron-forge/maker-dmg'], '^7.7.0');
  assert.equal(packageJson.devDependencies?.['@electron-forge/maker-squirrel'], '^7.7.0');

  const forgeConfigPath = path.join(repoRoot, 'forge.config.cjs');
  const forgeConfigRaw = await fs.readFile(forgeConfigPath, 'utf8');

  assert.match(forgeConfigRaw, /asar:\s*true/);
  assert.match(forgeConfigRaw, /@electron-forge\/maker-squirrel/);
  assert.match(forgeConfigRaw, /@electron-forge\/maker-dmg/);
});
