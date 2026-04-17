import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const require = createRequire(import.meta.url);

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

  const forgeConfig = require(path.join(repoRoot, 'forge.config.cjs'));

  assert.equal(forgeConfig.packagerConfig?.asar, true);
  assert.ok(Array.isArray(forgeConfig.makers));
  assert.equal(forgeConfig.makers.length, 2);

  const squirrelMaker = forgeConfig.makers.find(
    (maker) => maker?.name === '@electron-forge/maker-squirrel'
  );
  const dmgMaker = forgeConfig.makers.find(
    (maker) => maker?.name === '@electron-forge/maker-dmg'
  );

  assert.deepEqual(squirrelMaker?.config, {});
  assert.deepEqual(dmgMaker?.platforms, ['darwin']);
});
