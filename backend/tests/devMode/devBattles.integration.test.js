import request from 'supertest';
import app from '../../app.js';
import User from '../../models/User.js';
import Codebase from '../../devMode/models/Codebase.js';
import DevBattle from '../../devMode/models/DevBattle.js';
import DevBattleRegistration from '../../devMode/models/DevBattleRegistration.js';
import { removeProjectFiles } from '../../devMode/modules/post-codebase/services/projectFiles.js';
import { clearDB, closeDB, connectDB } from '../setup/mongoSetup.js';

const password = 'test-password-123';
const api = '/api/dev/v1';
const future = minutes => new Date(Date.now() + minutes * 60000).toISOString();

async function login(email) {
  const result = await request(app).post('/api/auth/login').send({ email, password });
  expect(result.status).toBe(200);
  return result.headers['set-cookie'];
}

beforeAll(connectDB);
beforeEach(async () => User.create([
  { name: 'Admin', email: 'dev-admin@example.test', password, role: 'admin' },
  { name: 'User', email: 'dev-user@example.test', password, role: 'user' }
]));
afterEach(async () => {
  const codebases = await Codebase.find({}).select('+files.storageKey');
  await Promise.all(codebases.map(codebase => removeProjectFiles(codebase.files)));
  await clearDB();
});
afterAll(closeDB);

test('requires admin authorization for Dev Battle organization', async () => {
  const user = await login('dev-user@example.test');
  expect((await request(app).post(`${api}/battles`).set('Cookie', user).send({})).status).toBe(403);
  expect((await request(app).get(`${api}/battles`)).status).toBe(401);
});

test('admin creates a battle and an eligible user registers within the schedule', async () => {
  const admin = await login('dev-admin@example.test');
  const created = await request(app).post(`${api}/creator/codebases`).set('Cookie', admin).send({
    title: 'Battle challenge', description: 'Challenge', detailedDescription: 'Details',
    problemStatement: 'Problem', bugTitle: 'Bug', bugDescription: 'Bug description',
    expectedBehavior: 'Expected', actualBehavior: 'Actual', instructions: 'Test',
    acceptanceCriteria: ['Pass'], files: [{ path: 'src/index.js', content: 'export const x = 1;' }]
  });
  expect(created.status).toBe(201);
  const published = await request(app).post(`${api}/creator/codebases/${created.body.data._id}/publish`).set('Cookie', admin).send();
  expect(published.status).toBe(200);
  const battle = await request(app).post(`${api}/battles`).set('Cookie', admin).send({
    title: 'Fix the cache', description: 'Debug it', codebaseId: created.body.data._id,
    codebaseVersion: published.body.data.version, startsAt: future(30), registrationDeadline: future(15),
    durationMinutes: 30, capacity: 10
  });
  expect(battle.status).toBe(201);
  expect(battle.body.data.evaluation).toBe('DISABLED');
  const edited = await request(app).patch(`${api}/battles/manage/${battle.body.data.id}`).set('Cookie', admin).send({ title: 'Fix the stale cache' });
  expect(edited.status).toBe(200);
  const nonAdminEdit = await request(app).patch(`${api}/battles/manage/${battle.body.data.id}`).set('Cookie', await login('dev-user@example.test')).send({ title: 'Unauthorized' });
  expect(nonAdminEdit.status).toBe(403);
  const user = await login('dev-user@example.test');
  const registration = await request(app).post(`${api}/battles/${battle.body.data.id}/register`).set('Cookie', user).send({});
  expect(registration.status).toBe(201);
  expect(await DevBattleRegistration.countDocuments({ userId: (await User.findOne({ email: 'dev-user@example.test' })).id })).toBe(1);
  const detail = await request(app).get(`${api}/battles/${battle.body.data.id}`).set('Cookie', user);
  expect(detail.status).toBe(200);
  expect(detail.body.data.registration.status).toBe('REGISTERED');
  await DevBattle.updateOne({ _id: battle.body.data.id }, { $set: { startsAt: new Date(Date.now() - 5 * 60000), registrationDeadline: new Date(Date.now() - 10 * 60000), status: 'SCHEDULED' } });
  const workspace = await request(app).post(`${api}/battles/${battle.body.data.id}/workspace`).set('Cookie', user).send({});
  expect(workspace.status).toBe(201);
  const savedWorkspace = await request(app).patch(`${api}/battles/${battle.body.data.id}/workspace/${workspace.body.data.id}`).set('Cookie', user).send({ revision: 0, files: [{ path: 'src/index.js', content: 'export const x = 2;' }] });
  expect(savedWorkspace.status).toBe(200);
  const submission = await request(app).post(`${api}/battles/${battle.body.data.id}/submit`).set('Cookie', user).send({ workspaceId: workspace.body.data.id });
  expect(submission.status).toBe(201);
  expect(submission.body.data.evaluationStatus).toBe('NOT_EVALUATED');
  const filteredBattle = await request(app).get(`${api}/battles?status=LIVE&language=JavaScript`).set('Cookie', user);
  expect(filteredBattle.status).toBe(200);
  expect(filteredBattle.body.data).toHaveLength(1);
  await DevBattle.updateOne({ _id: battle.body.data.id }, { $set: { startsAt: new Date(Date.now() - 60 * 60000), registrationDeadline: new Date(Date.now() - 70 * 60000) } });
  const reviewQueue = await request(app).get(`${api}/battles/${battle.body.data.id}/submissions`).set('Cookie', admin);
  expect(reviewQueue.status).toBe(200);
  expect(reviewQueue.body.data[0].evaluationStatus).toBe('NOT_EVALUATED');
  const evaluated = await request(app).patch(`${api}/battles/${battle.body.data.id}/submissions/${submission.body.data.id}/result`).set('Cookie', admin).send({ valid: true, place: 1 });
  expect(evaluated.status).toBe(200);
  const duplicateReview = await request(app).patch(`${api}/battles/${battle.body.data.id}/submissions/${submission.body.data.id}/result`).set('Cookie', admin).send({ valid: true, place: 1 });
  expect(duplicateReview.status).toBe(409);
  const results = await request(app).get(`${api}/battles/${battle.body.data.id}/results`).set('Cookie', user);
  expect(results.status).toBe(200);
  expect(results.body.data.results[0]).toMatchObject({ userName: 'User', place: 1, points: 120, won: true });
  const devLeaderboard = await request(app).get('/api/leaderboard/dev');
  expect(devLeaderboard.body.users[0]).toMatchObject({ _id: expect.any(String), devPoints: 120, points: 120, totalWins: 1 });
  const cancelled = await request(app).post(`${api}/battles/manage/${battle.body.data.id}/cancel`).set('Cookie', admin).send({});
  expect(cancelled.status).toBe(409);
  expect(await DevBattle.countDocuments()).toBe(1);
});
