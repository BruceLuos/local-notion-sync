import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

// 测试里只关心 env-loader 会影响到的这一组环境变量，
// 便于在每次用例前后精确地保存和恢复现场。
const ENV_KEYS = ['NOTES_DIR', 'NOTION_TOKEN', 'NOTION_DATABASE_ID', 'STATE_FILE'];

test('loadProjectEnv loads .env from the module project root instead of cwd', async () => {
  // 这里故意构造两个不同位置：
  // - `projectRoot`：模拟 notion-sync 仓库本身
  // - `cwdRoot`：模拟外部调用方的当前工作目录
  // 用来验证 env-loader 是不是按照“模块位置”而不是“当前 cwd”找 `.env`
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'notion-sync-env-loader-'));
  const projectRoot = path.join(tempRoot, 'project');
  const cwdRoot = path.join(tempRoot, 'cwd');
  const srcDir = path.join(projectRoot, 'src');

  await fs.mkdir(srcDir, { recursive: true });
  await fs.mkdir(cwdRoot, { recursive: true });
  await fs.writeFile(
    path.join(projectRoot, '.env'),
    [
      'NOTES_DIR=/expected/notes',
      'NOTION_TOKEN=test-token',
      'NOTION_DATABASE_ID=test-database',
      'STATE_FILE=/expected/state.json'
    ].join('\n')
  );
  // 在 cwd 里放一份“错误配置”，确保测试真的能区分两个来源。
  await fs.writeFile(path.join(cwdRoot, '.env'), 'NOTES_DIR=/wrong/from-cwd\n');

  const originalCwd = process.cwd();
  const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

  // 先清理相关环境变量，避免本机真实配置污染测试结果。
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }

  process.chdir(cwdRoot);

  try {
    const { loadProjectEnv } = await import('../src/env-loader.mjs');

    // 把一个“看起来位于 project/src 下的模块 URL”传进去，
    // 验证 env-loader 是否能反推出 projectRoot/.env。
    loadProjectEnv(pathToFileURL(path.join(srcDir, 'sync-latest-note.mjs')).href);

    assert.equal(process.env.NOTES_DIR, '/expected/notes');
    assert.equal(process.env.NOTION_TOKEN, 'test-token');
    assert.equal(process.env.NOTION_DATABASE_ID, 'test-database');
    assert.equal(process.env.STATE_FILE, '/expected/state.json');
  } finally {
    // 无论测试成功还是失败，都恢复 cwd 和环境变量，
    // 保证这个用例不会污染后续测试。
    process.chdir(originalCwd);
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    }
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
