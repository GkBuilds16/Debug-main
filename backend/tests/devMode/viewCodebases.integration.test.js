import request from 'supertest';
import app from '../../app.js';
import User from '../../models/User.js';
import Codebase from '../../devMode/models/Codebase.js';
import { removeProjectFiles } from '../../devMode/modules/post-codebase/services/projectFiles.js';
import { clearDB, closeDB, connectDB } from '../setup/mongoSetup.js';

const API = '/api/dev/v1';
const password = 'test-password-123';

async function login(email) {
  const response = await request(app).post('/api/auth/login').send({ email, password });
  expect(response.status).toBe(200);
  return response.headers['set-cookie'];
}

beforeAll(connectDB);
beforeEach(async () => {
  await User.create([
    { name: 'Publisher', email: 'publisher@example.test', password },
    { name: 'Viewer', email: 'viewer@example.test', password }
  ]);
});
afterEach(async () => {
  const codebases = await Codebase.find({}).select('+files.storageKey');
  await Promise.all(codebases.map(codebase => removeProjectFiles(codebase.files)));
  await clearDB();
});
afterAll(closeDB);

test('lists published codebases while keeping drafts private and supports filters', async () => {
  const publisher = await login('publisher@example.test');
  const draft = await request(app).post('/api/dev/v1/creator/codebases').set('Cookie', publisher).send({
    title: 'Private draft', description: 'Not published', languages: ['JavaScript'],
    files: [{ path: 'src/index.js', content: 'export const draft = true;' }]
  });
  expect(draft.status).toBe(201);
  const published = await request(app).post(`/api/dev/v1/creator/codebases/${draft.body.data._id}/publish`).set('Cookie', publisher).send();
  expect(published.status).toBe(422);

  const completed = await request(app).post('/api/dev/v1/creator/codebases').set('Cookie', publisher).send({
    title: 'Public cache challenge', description: 'Repair the cache invalidation.',
    detailedDescription: 'Published challenge details.', problemStatement: 'Find the stale branch.',
    bugTitle: 'Stale cache', bugDescription: 'Results remain stale.', expectedBehavior: 'Refresh results.',
    actualBehavior: 'Results remain stale.', instructions: 'Run the tests.',
    acceptanceCriteria: ['Results refresh.'], languages: ['JavaScript'], technologies: ['Redis'],
    files: [{ path: 'src/index.js', content: 'export const fix = true;' }]
  });
  expect(completed.status).toBe(201);
  const publication = await request(app).post(`/api/dev/v1/creator/codebases/${completed.body.data._id}/publish`).set('Cookie', publisher).send();
  expect(publication.status).toBe(200);

  const viewer = await login('viewer@example.test');
  const listing = await request(app).get(`${API}/view/codebases?language=JavaScript&q=cache&sort=popular`).set('Cookie', viewer);
  expect(listing.status).toBe(200);
  expect(listing.body.data).toHaveLength(1);
  expect(listing.body.data[0].author.name).toBe('Publisher');
  expect(listing.body.data[0].title).toBe('Public cache challenge');
  expect(listing.body.data[0].fileCount).toBe(1);
  expect(listing.body.data[0].reportedIssueCount).toBe(1);
});

test('restricts published file access to normalized project paths', async () => {
  const publisher = await login('publisher@example.test');
  const created = await request(app).post('/api/dev/v1/creator/codebases').set('Cookie', publisher).send({
    title: 'File preview challenge', description: 'Preview safe files.',
    detailedDescription: 'Details', problemStatement: 'Problem', bugTitle: 'Bug',
    bugDescription: 'Bug', expectedBehavior: 'Expected', actualBehavior: 'Actual',
    instructions: 'Test', acceptanceCriteria: ['Pass'],
    files: [{ path: 'src/index.js', content: 'export const safe = true;' }]
  });
  const published = await request(app).post(`/api/dev/v1/creator/codebases/${created.body.data._id}/publish`).set('Cookie', publisher).send();
  expect(published.status).toBe(200);
  const id = created.body.data._id;
  const viewer = await login('viewer@example.test');
  const file = await request(app).get(`${API}/view/codebases/${id}/file?path=src%2Findex.js`).set('Cookie', viewer);
  expect(file.status).toBe(200);
  expect(file.body.data.content).toContain('safe');
  const traversal = await request(app).get(`${API}/view/codebases/${id}/file?path=..%2F.env`).set('Cookie', viewer);
  expect(traversal.status).toBe(422);
});
