import { validateProjectFiles } from './filePolicy.js';
import { getStoredFile, putStoredFile, removeStoredFile } from './storage.js';

export async function persistProjectFiles(files) {
  const valid = validateProjectFiles(files);
  const written = [];
  try {
    const result = [];
    for (const file of valid) {
      const reference = await putStoredFile(Buffer.from(file.content, 'utf8'), { contentType: file.contentType });
      written.push(reference);
      result.push({ path: file.path, ...reference });
    }
    return result;
  } catch (error) {
    await Promise.all(written.map(removeStoredFile));
    throw error;
  }
}

export async function readProjectFiles(files = []) {
  return Promise.all(files.map(async file => ({
    path: file.path,
    content: file.storageKey ? (await getStoredFile(file)).toString('utf8') : (file.content || '')
  })));
}

export async function removeProjectFiles(files = []) {
  return Promise.allSettled(files.map(file => file.storageKey && removeStoredFile(file)));
}

export async function updateStoredProjectFile(doc, file, expectedVersion) {
  if (expectedVersion !== undefined && Number(expectedVersion) !== doc.version) { const error = new Error('This codebase changed since you opened it. Reload and retry.'); error.code = 'VERSION_CONFLICT'; throw error; }
  const index = doc.files.findIndex(item => item.path === file.path);
  if (index < 0) { const error = new Error('Project file was not found.'); error.code = 'FILE_NOT_FOUND'; throw error; }
  const old = doc.files[index];
  const reference = await putStoredFile(Buffer.from(file.content, 'utf8'), { contentType: file.contentType });
  doc.files.set(index, { path: file.path, ...reference });
  doc.version += 1;
  try { await doc.save(); }
  catch (error) { await removeStoredFile(reference); throw error; }
  await removeProjectFiles([old]);
  return doc;
}

export function fileTree(files = [], directories = []) {
  const values = new Set(directories);
  for (const file of files) {
    const parts = file.path.split('/');
    parts.pop();
    while (parts.length) { values.add(parts.join('/')); parts.pop(); }
  }
  return { directories: [...values].sort(), files: files.map(({ path, size, contentType }) => ({ path, size, contentType })) };
}
