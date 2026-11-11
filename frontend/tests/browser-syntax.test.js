import { it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

it('browser regression scripts can parse before they launch', () => {
  const directory = new URL('../../scripts/', import.meta.url);
  const failures = readdirSync(directory).filter(name => /^browser-.*\.cjs$/.test(name)).flatMap(name => {
    const result = spawnSync(process.execPath, ['--check', fileURLToPath(new URL(name, directory))], { encoding: 'utf8' });
    return result.status === 0 ? [] : [`${name}: ${result.stderr || result.error}`];
  });
  expect(failures).toEqual([]);
});
