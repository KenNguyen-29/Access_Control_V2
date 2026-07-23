#!/usr/bin/env node
/**
 * Production uses compiled prisma/seed.js (Docker build).
 * Local fallback uses ts-node on prisma/seed.ts.
 */
const { existsSync } = require('fs');
const { join } = require('path');
const { spawnSync } = require('child_process');

const prismaDir = __dirname;
const compiled = join(prismaDir, 'seed.js');
const apiRoot = join(prismaDir, '..');

if (existsSync(compiled)) {
  require(compiled);
} else {
  const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const result = spawnSync(
    cmd,
    ['ts-node', '--project', 'tsconfig.seed.json', 'prisma/seed.ts'],
    { stdio: 'inherit', cwd: apiRoot, shell: process.platform === 'win32' },
  );
  process.exit(result.status ?? 1);
}
