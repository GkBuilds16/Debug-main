import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { deflateRawSync } from 'node:zlib';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import app from '../../app.js';
import User from '../../models/User.js';
import Codebase from '../../devMode/models/Codebase.js';
import CodebaseVersion from '../../devMode/models/CodebaseVersion.js';
import { removeProjectFiles } from '../../devMode/modules/post-codebase/services/projectFiles.js';
import { MAX_ARCHIVE_BYTES, MAX_FILE_BYTES } from '../../devMode/modules/post-codebase/services/filePolicy.js';
import { clearDB, closeDB, connectDB } from '../setup/mongoSetup.js';

const API = '/api/dev/v1/creator';
const PASSWORD = 'test-password-123';
const STORAGE_DIR = process.env.CODEBASE_STORAGE_DIR;

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const plain = Buffer.from(entry.content || '');
    const method = entry.compression === 'deflate' ? 8 : 0;
    const body = method === 8 ? deflateRawSync(plain) : plain;
    const crc = crc32(plain);
    const flags = entry.flags || 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(plain.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(plain.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(entry.externalAttributes || 0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + body.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

async function login(email) {
  const response = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  expect(response.status).toBe(200);
  expect(response.headers['set-cookie']).toEqual(expect.arrayContaining([expect.stringContaining('accessToken=')]));
  return response.headers['set-cookie'];
}

async function createCodebase(cookie, overrides = {}) {
  return request(app).post(`${API}/codebases`).set('Cookie', cookie).send({
    title: 'Inventory sync challenge',
    description: 'Repair the stale inventory synchronizer.',
    ...overrides
  });
}

function publishableFields() {
  return {
    detailedDescription: 'A small service synchronizes inventory records.',
    problemStatement: 'Find and repair the incorrect inventory update.',
    bugTitle: 'Stale quantity after sync',
    bugDescription: 'The sync process skips one update path.',
    expectedBehavior: 'Every valid update is persisted.',
    actualBehavior: 'Some updates are skipped.',
    instructions: 'Run npm install and npm test.',
    acceptanceCriteria: ['All valid updates persist.'],
    privateNotes: 'Private interviewer note',
    intendedBugExplanation: 'A private root cause.'
  };
}

async function createPublishable(cookie, extra = {}) {
  const created = await createCodebase(cookie, {
    ...publishableFields(),
    files: [{ path: 'src/index.js', content: 'export const sync = () => true;' }],
    ...extra
  });
  expect(created.status).toBe(201);
  return created.body.data;
}

beforeAll(async () => {
  await connectDB();
});

beforeEach(async () => {
  await User.create([
    { name: 'Creator A', email: 'creator-a@example.test', password: PASSWORD },
    { name: 'Creator B', email: 'creator-b@example.test', password: PASSWORD }
  ]);
});

afterEach(async () => {
  const codebases = await Codebase.find({}).select('+files.storageKey');
  await Promise.all(codebases.map(codebase => removeProjectFiles(codebase.files)));
  await clearDB();
});

afterAll(async () => {
  await closeDB();
});

describe('Dev Mode creator authentication', () => {
  const protectedRoutes = [
    ['get', '/dashboard'], ['get', '/codebases'], ['post', '/codebases'],
    ['get', '/codebases/507f1f77bcf86cd799439011'], ['patch', '/codebases/507f1f77bcf86cd799439011'],
    ['delete', '/codebases/507f1f77bcf86cd799439011'],
    ['get', '/codebases/507f1f77bcf86cd799439011/versions'], ['post', '/codebases/507f1f77bcf86cd799439011/versions'],
    ['get', '/codebases/507f1f77bcf86cd799439011/preview'], ['post', '/codebases/507f1f77bcf86cd799439011/publish'],
    ['post', '/codebases/507f1f77bcf86cd799439011/archive'], ['post', '/codebases/507f1f77bcf86cd799439011/restore'],
    ['get', '/codebases/507f1f77bcf86cd799439011/files'], ['get', '/codebases/507f1f77bcf86cd799439011/file?path=src%2Findex.js'],
    ['patch', '/codebases/507f1f77bcf86cd799439011/file-content'], ['put', '/codebases/507f1f77bcf86cd799439011/files'],
    ['post', '/codebases/507f1f77bcf86cd799439011/files'], ['patch', '/codebases/507f1f77bcf86cd799439011/files/rename'],
    ['delete', '/codebases/507f1f77bcf86cd799439011/files'], ['post', '/codebases/507f1f77bcf86cd799439011/upload'],
    ['post', '/codebases/507f1f77bcf86cd799439011/directories'], ['delete', '/codebases/507f1f77bcf86cd799439011/directories'],
    ['post', '/codebases/507f1f77bcf86cd799439011/import-github']
  ];

  test.each(protectedRoutes)('%s %s rejects requests without a host session', async (method, path) => {
    const response = await request(app)[method](`${API}${path}`).send({});
    expect(response.status).toBe(401);
  });

  test('rejects malformed, invalid, and expired host cookies', async () => {
    const malformed = await request(app).get(`${API}/dashboard`).set('Cookie', 'accessToken=%');
    expect(malformed.status).toBe(401);

    const invalid = await request(app).get(`${API}/dashboard`).set('Cookie', 'accessToken=not.a.valid.jwt');
    expect(invalid.status).toBe(401);

    const user = await User.findOne({ email: 'creator-a@example.test' });
    const expired = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: -1 });
    const expiredResponse = await request(app).get(`${API}/dashboard`).set('Cookie', `accessToken=${expired}`);
    expect(expiredResponse.status).toBe(401);
  });

  test('uses the existing DebugDSA cookie identity and rejects owner mass assignment', async () => {
    const cookie = await login('creator-a@example.test');
    const user = await User.findOne({ email: 'creator-a@example.test' });
    const created = await createCodebase(cookie, { ownerId: 'attacker', role: 'admin' });
    expect(created.status).toBe(422);
    expect(await Codebase.countDocuments()).toBe(0);

    const own = await createCodebase(cookie);
    expect(own.status).toBe(201);
    expect(own.body.data.ownerId).toBe(user.id);
    expect(await Codebase.countDocuments({ ownerId: user.id })).toBe(1);
    expect(own.headers['set-cookie']).toBeUndefined();
  });

  test('accepts a valid host JWT via the host middleware supported Bearer fallback', async () => {
    const cookie = await login('creator-a@example.test');
    const token = cookie.find(value => value.startsWith('accessToken=')).split(';')[0].slice('accessToken='.length);
    const response = await request(app).get(`${API}/dashboard`).set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
  });
});

describe('Dev Mode creator ownership isolation', () => {
  test('owners can access their records while another user cannot enumerate or change them', async () => {
    const cookieA = await login('creator-a@example.test');
    const cookieB = await login('creator-b@example.test');
    const ownerA = await User.findOne({ email: 'creator-a@example.test' });
    const draftA = await createCodebase(cookieA, {
      ...publishableFields(), files: [{ path: 'src/private.js', content: 'const secret = 42;' }]
    });
    const draftB = await createCodebase(cookieB);
    expect(draftA.status).toBe(201);
    expect(draftB.status).toBe(201);

    const ownRead = await request(app).get(`${API}/codebases/${draftA.body.data._id}`).set('Cookie', cookieA);
    expect(ownRead.status).toBe(200);
    expect(ownRead.body.data.ownerId).toBe(ownerA.id);

    const foreignDashboard = await request(app).get(`${API}/dashboard`).set('Cookie', cookieB);
    expect(foreignDashboard.status).toBe(200);
    expect(foreignDashboard.body.data.map(row => row._id)).not.toContain(draftA.body.data._id);

    const id = draftA.body.data._id;
    const foreignOperations = [
      request(app).get(`${API}/codebases/${id}`),
      request(app).get(`${API}/codebases/${id}/files`),
      request(app).get(`${API}/codebases/${id}/file?path=src%2Fprivate.js`),
      request(app).get(`${API}/codebases/${id}/preview`),
      request(app).get(`${API}/codebases/${id}/versions`),
      request(app).patch(`${API}/codebases/${id}`).send({ title: 'Taken over' }),
      request(app).patch(`${API}/codebases/${id}/file-content`).send({ path: 'src/private.js', content: 'changed' }),
      request(app).put(`${API}/codebases/${id}/files`).send({ files: [{ path: 'src/other.js', content: 'x' }] }),
      request(app).post(`${API}/codebases/${id}/files`).send({ file: { path: 'src/other.js', content: 'x' } }),
      request(app).patch(`${API}/codebases/${id}/files/rename`).send({ oldPath: 'src/private.js', newPath: 'src/stolen.js' }),
      request(app).delete(`${API}/codebases/${id}/files?path=src%2Fprivate.js`),
      request(app).post(`${API}/codebases/${id}/directories`).send({ path: 'private' }),
      request(app).delete(`${API}/codebases/${id}/directories?path=private`),
      request(app).post(`${API}/codebases/${id}/publish`).send({}),
      request(app).post(`${API}/codebases/${id}/archive`).send({}),
      request(app).post(`${API}/codebases/${id}/restore`).send({}),
      request(app).post(`${API}/codebases/${id}/versions`).send({}),
      request(app).delete(`${API}/codebases/${id}`),
      request(app).post(`${API}/codebases/${id}/upload`).attach('archive', makeZip([{ name: 'x.js', content: 'x' }]), { filename: 'x.zip', contentType: 'application/zip' })
    ];
    for (const operation of foreignOperations) {
      const response = await operation.set('Cookie', cookieB);
      expect(response.status).toBe(404);
      expect(JSON.stringify(response.body)).not.toMatch(/const secret = 42/);
    }

    const stillOwned = await Codebase.findById(id);
    expect(stillOwned.ownerId).toBe(ownerA.id);
    expect(stillOwned.title).toBe('Inventory sync challenge');
    expect(stillOwned.state).toBe('DRAFT');
  });

  test('creates, autosaves, publishes, versions, restores, archives, and deletes only eligible drafts', async () => {
    const cookie = await login('creator-a@example.test');
    const owner = await User.findOne({ email: 'creator-a@example.test' });
    const draftResponse = await createCodebase(cookie, publishableFields());
    expect(draftResponse.status).toBe(201);
    const draftId = draftResponse.body.data._id;

    const metadata = await request(app).patch(`${API}/codebases/${draftId}`).set('Cookie', cookie).send({ title: 'Updated inventory challenge', version: draftResponse.body.data.version });
    expect(metadata.status).toBe(200);
    expect(metadata.body.data.title).toBe('Updated inventory challenge');
    expect(await Codebase.findById(draftId).then(doc => doc.title)).toBe('Updated inventory challenge');

    const folder = await request(app).post(`${API}/codebases/${draftId}/directories`).set('Cookie', cookie).send({ path: 'src' });
    expect(folder.status).toBe(201);
    const added = await request(app).post(`${API}/codebases/${draftId}/files`).set('Cookie', cookie).send({ file: { path: 'src/index.js', content: 'export const value = 1;' } });
    expect(added.status).toBe(201);
    const descriptor = await Codebase.findById(draftId).select('+files.storageKey');
    expect(descriptor.files[0].storageKey).toBeTruthy();
    expect(existsSync(join(STORAGE_DIR, `${descriptor.files[0].storageKey}.txt`))).toBe(true);

    const editedFile = await request(app).patch(`${API}/codebases/${draftId}/file-content`).set('Cookie', cookie).send({ path: 'src/index.js', content: 'export const value = 2;', version: added.body.data.version });
    expect(editedFile.status).toBe(200);
    const readFile = await request(app).get(`${API}/codebases/${draftId}/file?path=src%2Findex.js`).set('Cookie', cookie);
    expect(readFile.status).toBe(200);
    expect(readFile.body.data.content).toBe('export const value = 2;');
    const preview = await request(app).get(`${API}/codebases/${draftId}/preview`).set('Cookie', cookie);
    expect(preview.status).toBe(200);
    expect(preview.body.data.privateNotes).toBeUndefined();
    expect(preview.body.data.intendedBugExplanation).toBeUndefined();

    const published = await request(app).post(`${API}/codebases/${draftId}/publish`).set('Cookie', cookie).send({});
    expect(published.status).toBe(200);
    expect(await Codebase.findById(draftId).then(doc => doc.state)).toBe('PUBLISHED');
    expect(await CodebaseVersion.countDocuments({ creatorId: owner.id, codebaseId: draftId })).toBe(1);

    const history = await request(app).get(`${API}/codebases/${draftId}/versions`).set('Cookie', cookie);
    expect(history.status).toBe(200);
    expect(history.body.data).toHaveLength(1);
    expect(history.body.data[0].creatorId).toBe(owner.id);

    const fork = await request(app).post(`${API}/codebases/${draftId}/versions`).set('Cookie', cookie).send({});
    expect(fork.status).toBe(201);
    const forkId = fork.body.data._id;
    expect(fork.body.data.state).toBe('DRAFT');
    const secondPublish = await request(app).post(`${API}/codebases/${forkId}/publish`).set('Cookie', cookie).send({});
    expect(secondPublish.status).toBe(200);
    expect(await Codebase.findById(draftId).then(doc => doc.state)).toBe('ARCHIVED');

    const restored = await request(app).post(`${API}/codebases/${draftId}/restore`).set('Cookie', cookie).send({});
    expect(restored.status).toBe(200);
    expect(await Codebase.findById(draftId).then(doc => doc.state)).toBe('PUBLISHED');
    expect(await Codebase.findById(forkId).then(doc => doc.state)).toBe('ARCHIVED');

    const archived = await request(app).post(`${API}/codebases/${draftId}/archive`).set('Cookie', cookie).send({});
    expect(archived.status).toBe(200);
    expect(await Codebase.findById(draftId).then(doc => doc.state)).toBe('ARCHIVED');
    const restoreArchived = await request(app).post(`${API}/codebases/${draftId}/restore`).set('Cookie', cookie).send({});
    expect(restoreArchived.status).toBe(200);

    const deletable = await createCodebase(cookie, { files: [{ path: 'README.md', content: 'Temporary draft' }] });
    expect(deletable.status).toBe(201);
    const file = await Codebase.findById(deletable.body.data._id).select('+files.storageKey');
    const storagePath = join(STORAGE_DIR, `${file.files[0].storageKey}.txt`);
    expect(existsSync(storagePath)).toBe(true);
    const deleted = await request(app).delete(`${API}/codebases/${deletable.body.data._id}`).set('Cookie', cookie);
    expect(deleted.status).toBe(204);
    expect(await Codebase.findById(deletable.body.data._id)).toBeNull();
    expect(existsSync(storagePath)).toBe(false);
  });

  test('rejects malformed metadata and missing resources safely', async () => {
    const cookie = await login('creator-a@example.test');
    const invalid = await createCodebase(cookie, { difficulty: 'Impossible' });
    expect(invalid.status).toBe(422);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
    const missing = await request(app).get(`${API}/codebases/507f1f77bcf86cd799439011`).set('Cookie', cookie);
    expect(missing.status).toBe(404);
    expect(JSON.stringify(missing.body)).not.toMatch(/storage-data|C:\\|\/home\//i);
  });
});

describe('Dev Mode integrated ZIP upload security', () => {
  test('accepts a valid ZIP and rejects unsafe, malformed, oversized, or unsupported archives without leaving files', async () => {
    const cookie = await login('creator-a@example.test');
    const draft = await createCodebase(cookie);
    const id = draft.body.data._id;
    const validZip = makeZip([{ name: 'src/', content: '' }, { name: 'src/main.js', content: 'export const ok = true;' }]);
    const valid = await request(app).post(`${API}/codebases/${id}/upload`).set('Cookie', cookie).attach('archive', validZip, { filename: 'project.zip', contentType: 'application/zip' });
    expect(valid.status).toBe(201);
    expect(valid.body.data.files.map(file => file.path)).toContain('src/main.js');
    const persistedBefore = await Codebase.findById(id).select('+files.storageKey');
    const beforeKeys = persistedBefore.files.map(file => file.storageKey);

    const rejectedArchives = [
      makeZip([{ name: '../escape.js', content: 'bad' }]),
      makeZip([{ name: '/absolute.js', content: 'bad' }]),
      makeZip([{ name: 'link.js', content: 'target', externalAttributes: (0o120777 << 16) >>> 0 }]),
      makeZip([{ name: 'secret.env', content: 'secret' }]),
      makeZip([{ name: 'src/node_modules/pkg.js', content: 'bad' }]),
      makeZip([{ name: 'bin/program.exe', content: 'bad' }]),
      makeZip([{ name: 'encrypted.js', content: 'bad', flags: 1 }]),
      makeZip([{ name: 'large.js', content: 'x'.repeat(MAX_FILE_BYTES + 1) }]),
      makeZip(Array.from({ length: 301 }, (_, index) => ({ name: `src/f${index}.js`, content: 'x' }))),
      makeZip([{ name: 'ratio.js', content: 'x'.repeat(500_000), compression: 'deflate' }]),
      makeZip(Array.from({ length: 9 }, (_, index) => ({ name: `src/big${index}.js`, content: 'x'.repeat(MAX_FILE_BYTES) }))),
      Buffer.from('not a ZIP archive')
    ];
    for (const archive of rejectedArchives) {
      const response = await request(app).post(`${API}/codebases/${id}/upload`).set('Cookie', cookie).attach('archive', archive, { filename: 'unsafe.zip', contentType: 'application/zip' });
      expect([413, 422]).toContain(response.status);
      expect(JSON.stringify(response.body)).not.toMatch(/storage-data|C:\\|\/home\//i);
    }

    const tooLarge = await request(app).post(`${API}/codebases/${id}/upload`).set('Cookie', cookie).attach('archive', Buffer.alloc(MAX_ARCHIVE_BYTES + 1), { filename: 'large.zip', contentType: 'application/zip' });
    expect(tooLarge.status).toBe(413);
    const wrongType = await request(app).post(`${API}/codebases/${id}/upload`).set('Cookie', cookie).attach('archive', validZip, { filename: 'project.zip', contentType: 'text/plain' });
    expect(wrongType.status).toBe(415);
    const missingArchive = await request(app).post(`${API}/codebases/${id}/upload`).set('Cookie', cookie).field('other', 'value');
    expect(missingArchive.status).toBe(400);

    const persistedAfter = await Codebase.findById(id).select('+files.storageKey');
    expect(persistedAfter.files.map(file => file.storageKey)).toEqual(beforeKeys);
  });

  test('rejects unauthenticated ZIP uploads before upload handling', async () => {
    const response = await request(app).post(`${API}/codebases/507f1f77bcf86cd799439011/upload`).attach('archive', makeZip([{ name: 'file.js', content: 'x' }]), { filename: 'file.zip', contentType: 'application/zip' });
    expect(response.status).toBe(401);
  });
});

test('the creator endpoints remain attached to the same Mongo connection used by the host app', () => {
  expect(mongoose.connection.readyState).toBe(1);
  expect(mongoose.connection.name).toMatch(/^debugdsa_creator_test_/);
});
