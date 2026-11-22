import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCodebaseInput } from './validators/codebaseInput.js';
import { normalizeProjectPath, validateProjectFiles, MAX_FILE_BYTES, MAX_FILES } from './services/filePolicy.js';

test('codebase input accepts supported metadata and rejects browser supplied identity fields', () => {
  const input = validateCodebaseInput({ title: 'Repair sync', description: 'Fix inventory sync', files: [{ path: 'src/index.js', content: 'export {};' }] });
  assert.equal(input.title, 'Repair sync');
  assert.throws(() => validateCodebaseInput({ title: 'Repair sync', description: 'Fix it', ownerId: 'attacker' }), /Unsupported fields/);
  assert.throws(() => validateCodebaseInput({ title: 'Repair sync', description: 'Fix it', role: 'admin' }), /Unsupported fields/);
});

test('project paths reject traversal, absolute paths, secrets, and dependency metadata', () => {
  for (const path of ['../outside.js', 'src/../../outside.js', '/tmp/secret.js', 'C:\\temp\\secret.js', '.env', 'node_modules/pkg/index.js', '.git/config']) {
    assert.throws(() => normalizeProjectPath(path), undefined, path);
  }
  assert.equal(normalizeProjectPath('.env.example'), '.env.example');
});

test('project files enforce per-file, total-size, count, and duplicate-path limits', () => {
  assert.throws(() => validateProjectFiles([{ path: 'large.js', content: 'x'.repeat(MAX_FILE_BYTES + 1) }]), /1 MiB/);
  const overTotal = Array.from({ length: 9 }, (_, index) => ({ path: `f${index}.js`, content: 'x'.repeat(MAX_FILE_BYTES) }));
  assert.throws(() => validateProjectFiles(overTotal), /8 MiB/);
  assert.throws(() => validateProjectFiles(Array.from({ length: MAX_FILES + 1 }, (_, index) => ({ path: `f${index}.js`, content: '' }))), /300 files/);
  assert.throws(() => validateProjectFiles([{ path: 'src/a.js', content: '' }, { path: 'SRC/A.JS', content: '' }]), /Duplicate/);
});
