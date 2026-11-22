import express from 'express';
import mongoose from 'mongoose';
import DevBattle from '../../models/DevBattle.js';
import DevBattleRegistration from '../../models/DevBattleRegistration.js';
import Codebase from '../../models/Codebase.js';
import CodebaseVersion from '../../models/CodebaseVersion.js';
import DevBattleWorkspace from '../../models/DevBattleWorkspace.js';
import DevBattleSubmission from '../../models/DevBattleSubmission.js';
import User from '../../../models/User.js';
import { identity } from '../../identity.js';
import { getStoredFile, putStoredFile, removeStoredFile, StorageNotFoundError } from '../post-codebase/services/storage.js';
import { readProjectFiles } from '../post-codebase/services/projectFiles.js';
import { validateProjectFiles, MAX_TOTAL_BYTES } from '../post-codebase/services/filePolicy.js';
import { rankVerifiedDevBattle } from '../../../services/competitiveScoring.js';

const router = express.Router();
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const fail = (res, status, code, message) => res.status(status).json({ success: false, error: { code, message } });
const idOk = id => mongoose.isValidObjectId(id);
const adminOnly = (req, res, next) => req.user?.role === 'admin'
  ? next()
  : fail(res, 403, 'ADMIN_REQUIRED', 'Only administrators can manage Dev Battles.');
const endAt = battle => new Date(+new Date(battle.startsAt) + battle.durationMinutes * 60000);
const state = battle => {
  if (battle.status === 'DRAFT' || battle.status === 'CANCELLED') return battle.status;
  const now = new Date();
  if (now >= endAt(battle)) return 'COMPLETED';
  if (now >= battle.startsAt) return 'LIVE';
  return 'SCHEDULED';
};
const challengeFiles = async battle => {
  const version = await CodebaseVersion.findOne({ _id: battle.codebaseVersionId, codebaseId: battle.codebaseId, version: battle.codebaseVersion }).select('+snapshot');
  if (!version?.snapshot) return null;
  const files = version.snapshot.files || [];
  return { version, files: await readProjectFiles(files) };
};
const serializeWorkspace = (workspace, files) => ({ id: String(workspace._id), battleId: String(workspace.battleId), revision: workspace.revision, status: workspace.status, files, updatedAt: workspace.updatedAt });
const serialize = (battle, registration = null, organizer = false) => {
  const data = battle.toObject ? battle.toObject() : { ...battle };
  delete data.ownerId;
  delete data.eligibleUserIds;
  return { ...data, id: String(battle._id), status: state(battle), endsAt: endAt(battle), registration, evaluation: 'DISABLED', ...(organizer ? { ownerView: true } : {}) };
};
const requiredText = (value, label, max) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${label} is required and must be at most ${max} characters.`);
  return value.trim();
};
const escapedPattern = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

router.use(identity);

router.get('/', wrap(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 12));
  const now = new Date();
  const filter = { status: { $nin: ['DRAFT', 'CANCELLED'] } };
  if (['Easy', 'Medium', 'Hard'].includes(req.query.difficulty)) filter.difficulty = req.query.difficulty;
  if (typeof req.query.q === 'string' && req.query.q.trim()) {
    const q = escapedPattern(req.query.q.trim().slice(0, 100));
    filter.$or = [{ title: { $regex: q, $options: 'i' } }, { description: { $regex: q, $options: 'i' } }];
  }
  if (typeof req.query.language === 'string' && req.query.language.trim().length <= 30) filter.languages = req.query.language.trim();
  if (typeof req.query.technology === 'string' && req.query.technology.trim().length <= 40) {
    const technology = escapedPattern(req.query.technology.trim());
    const exactTechnology = { $regex: `^${technology}$`, $options: 'i' };
    const codebases = await Codebase.find({ $or: [{ technologies: exactTechnology }, { frameworks: exactTechnology }, { databaseTechnology: exactTechnology }] }).select('_id').lean();
    filter.codebaseId = { $in: codebases.map(item => item._id) };
  }
  const durationEnd = { $add: ['$startsAt', { $multiply: ['$durationMinutes', 60000] }] };
  if (req.query.status === 'UPCOMING') filter.$expr = { $gt: ['$startsAt', now] };
  else if (req.query.status === 'LIVE') filter.$expr = { $and: [{ $lte: ['$startsAt', now] }, { $gt: [durationEnd, now] }] };
  else if (req.query.status === 'COMPLETED') filter.$expr = { $lte: [durationEnd, now] };
  if (req.query.tab === 'mine') {
    const registrations = await DevBattleRegistration.find({ userId: req.user.id, status: 'REGISTERED' }).select('battleId').lean();
    filter._id = { $in: registrations.map(item => item.battleId) };
  }
  const rows = await DevBattle.find(filter).sort({ startsAt: -1 }).skip((page - 1) * limit).limit(limit).select('-eligibleUserIds').lean();
  const total = await DevBattle.countDocuments(filter);
  const [owners, codebases] = await Promise.all([
    User.find({ _id: { $in: [...new Set(rows.map(row => row.ownerId))] } }).select('name').lean(),
    Codebase.find({ _id: { $in: rows.map(row => row.codebaseId) } }).select('technologies frameworks databaseTechnology').lean()
  ]);
  const ownerNames = new Map(owners.map(owner => [String(owner._id), owner.name]));
  const codebaseStacks = new Map(codebases.map(item => [String(item._id), [...(item.technologies || []), ...(item.frameworks || []), item.databaseTechnology].filter(Boolean)]));
  res.json({ success: true, data: rows.map(row => ({ ...serialize(row), hostName: ownerNames.get(String(row.ownerId)) || 'DebugDSA host', technologies: codebaseStacks.get(String(row.codebaseId)) || [] })), pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}));

router.get('/mine', adminOnly, wrap(async (req, res) => {
  const rows = await DevBattle.find({ ownerId: req.user.id }).sort({ startsAt: -1 });
  res.json({ success: true, data: rows.map(row => serialize(row, null, true)) });
}));

router.get('/:id/submissions', adminOnly, wrap(async (req, res) => {
  if (!idOk(req.params.id)) return fail(res, 400, 'INVALID_ID', 'Battle ID is invalid.');
  const battle = await DevBattle.findById(req.params.id);
  if (!battle) return fail(res, 404, 'NOT_FOUND', 'Battle was not found.');
  const submissions = await DevBattleSubmission.find({ battleId: battle._id })
    .select('userId fileCount evaluationStatus createdAt updatedAt')
    .sort({ createdAt: 1 }).lean();
  const ids = [...new Set(submissions.map(item => item.userId))];
  const users = await User.find({ _id: { $in: ids } }).select('name').lean();
  const names = new Map(users.map(user => [String(user._id), user.name]));
  res.json({ success: true, data: submissions.map(item => ({
    id: String(item._id), userId: item.userId, userName: names.get(item.userId) || 'DebugDSA user',
    fileCount: item.fileCount, evaluationStatus: item.evaluationStatus, submittedAt: item.createdAt
  })) });
}));

router.get('/:id/results', wrap(async (req, res) => {
  if (!idOk(req.params.id)) return fail(res, 400, 'INVALID_ID', 'Battle ID is invalid.');
  const battle = await DevBattle.findById(req.params.id);
  if (!battle) return fail(res, 404, 'NOT_FOUND', 'Battle was not found.');
  if (state(battle) !== 'COMPLETED') return fail(res, 409, 'RESULTS_NOT_READY', 'Battle results are only available after it ends.');
  const evaluated = await DevBattleSubmission.find({ battleId: battle._id, evaluationStatus: 'EVALUATED' }).select('userId evaluationStatus +result').lean();
  const ranked = rankVerifiedDevBattle(evaluated);
  const users = ranked.length ? await User.find({ _id: { $in: ranked.map(item => item.userId) } }).select('name').lean() : [];
  const names = new Map(users.map(user => [String(user._id), user.name]));
  const results = ranked.map(item => ({ ...item, userName: names.get(item.userId) || 'DebugDSA user' }))
    .sort((a, b) => (a.place || Number.MAX_SAFE_INTEGER) - (b.place || Number.MAX_SAFE_INTEGER) || b.points - a.points || a.userId.localeCompare(b.userId));
  res.json({ success: true, data: { battleId: String(battle._id), status: 'COMPLETED', results } });
}));

router.patch('/:id/submissions/:submissionId/result', adminOnly, wrap(async (req, res) => {
  if (!idOk(req.params.id) || !idOk(req.params.submissionId)) return fail(res, 400, 'INVALID_ID', 'An identifier is invalid.');
  const battle = await DevBattle.findById(req.params.id);
  if (!battle || state(battle) === 'CANCELLED' || state(battle) !== 'COMPLETED') return fail(res, 409, 'BATTLE_NOT_COMPLETED', 'Only completed battles can be evaluated.');
  const submission = await DevBattleSubmission.findOne({ _id: req.params.submissionId, battleId: battle._id }).select('evaluationStatus');
  if (!submission) return fail(res, 404, 'SUBMISSION_NOT_FOUND', 'Submission was not found.');
  if (submission.evaluationStatus === 'EVALUATED') return fail(res, 409, 'ALREADY_EVALUATED', 'This submission already has a final evaluation.');
  if (typeof req.body.valid !== 'boolean') return fail(res, 422, 'INVALID_RESULT', 'Set whether the submitted debugging work is valid.');
  const place = req.body.place === null || req.body.place === undefined || req.body.place === '' ? null : Number(req.body.place);
  if (req.body.valid && place !== null && (!Number.isInteger(place) || place < 1 || place > Math.max(1, battle.registrationCount))) {
    return fail(res, 422, 'INVALID_PLACE', 'Place must be a positive position within the registered participant count.');
  }
  if (!req.body.valid && place !== null) return fail(res, 422, 'INVALID_PLACE', 'An invalid submission cannot receive a place.');
  const evaluated = await DevBattleSubmission.findOneAndUpdate(
    { _id: submission._id, battleId: battle._id, evaluationStatus: { $ne: 'EVALUATED' } },
    { $set: { evaluationStatus: 'EVALUATED', result: { verified: true, valid: req.body.valid, place, verifiedAt: new Date(), verifiedBy: String(req.user.id) } } },
    { new: true, runValidators: true }
  ).select('evaluationStatus');
  if (!evaluated) return fail(res, 409, 'ALREADY_EVALUATED', 'This submission already has a final evaluation.');
  res.json({ success: true, data: { id: String(evaluated._id), evaluationStatus: evaluated.evaluationStatus } });
}));

router.patch('/manage/:id', adminOnly, wrap(async (req, res) => {
  if (!idOk(req.params.id)) return fail(res, 400, 'INVALID_ID', 'Battle ID is invalid.');
  const battle = await DevBattle.findOne({ _id: req.params.id, ownerId: req.user.id });
  if (!battle) return fail(res, 404, 'NOT_FOUND', 'Battle was not found.');
  if (state(battle) !== 'SCHEDULED' || new Date() >= battle.startsAt) return fail(res, 409, 'BATTLE_LOCKED', 'A started battle cannot be edited.');
  const body = req.body || {};
  if (body.title !== undefined) battle.title = requiredText(body.title, 'Title', 100);
  for (const field of ['description', 'instructions', 'rules']) if (body[field] !== undefined) battle[field] = String(body[field]).trim();
  if (body.startsAt !== undefined) battle.startsAt = new Date(body.startsAt);
  if (body.registrationDeadline !== undefined) battle.registrationDeadline = new Date(body.registrationDeadline);
  if (body.durationMinutes !== undefined) battle.durationMinutes = Number(body.durationMinutes);
  if (body.capacity !== undefined) battle.capacity = Number(body.capacity);
  if (!Number.isFinite(+battle.startsAt) || !Number.isFinite(+battle.registrationDeadline) || battle.registrationDeadline >= battle.startsAt || battle.startsAt <= new Date()) return fail(res, 422, 'INVALID_SCHEDULE', 'Use a future start time with a registration deadline before it.');
  if (!Number.isInteger(battle.durationMinutes) || battle.durationMinutes < 5 || battle.durationMinutes > 360) return fail(res, 422, 'INVALID_DURATION', 'Duration must be between 5 and 360 minutes.');
  if (!Number.isInteger(battle.capacity) || battle.capacity < battle.registrationCount) return fail(res, 422, 'INVALID_CAPACITY', 'Capacity cannot be below current registrations.');
  await battle.save();
  res.json({ success: true, data: serialize(battle, null, true) });
}));

router.post('/manage/:id/cancel', adminOnly, wrap(async (req, res) => {
  if (!idOk(req.params.id)) return fail(res, 400, 'INVALID_ID', 'Battle ID is invalid.');
  const battle = await DevBattle.findOne({ _id: req.params.id, ownerId: req.user.id });
  if (!battle) return fail(res, 404, 'NOT_FOUND', 'Battle was not found.');
  if (state(battle) === 'LIVE' || state(battle) === 'COMPLETED') return fail(res, 409, 'BATTLE_LOCKED', 'A started or completed battle cannot be cancelled.');
  battle.status = 'CANCELLED';
  await battle.save();
  res.json({ success: true, data: serialize(battle, null, true) });
}));

router.post('/:id/submit', wrap(async (req, res) => {
  if (!idOk(req.params.id) || !idOk(req.body.workspaceId)) return fail(res, 400, 'INVALID_ID', 'An identifier is invalid.');
  const battle = await DevBattle.findById(req.params.id);
  if (!battle || state(battle) !== 'LIVE') return fail(res, 409, 'SUBMISSION_CLOSED', 'The battle submission window is closed.');
  const registration = await DevBattleRegistration.findOne({ battleId: battle._id, userId: req.user.id, status: 'REGISTERED' });
  const workspace = await DevBattleWorkspace.findOne({ _id: req.body.workspaceId, battleId: battle._id, userId: req.user.id, status: 'ACTIVE' }).select('+files.storageKey +files.checksum');
  if (!registration || !workspace) return fail(res, 404, 'WORKSPACE_NOT_FOUND', 'An active registered workspace was not found.');
  const challenge = await challengeFiles(battle);
  const submissionFiles = [];
  let submission;
  try {
    for (const file of challenge.files) {
      const override = workspace.files.find(item => item.path === file.path);
      const content = override ? (await getStoredFile(override)).toString('utf8') : file.content;
      const reference = await putStoredFile(Buffer.from(content), { contentType: 'text/plain; charset=utf-8' });
      submissionFiles.push({ path: file.path, ...reference });
    }
    submission = await DevBattleSubmission.create({ battleId: battle._id, workspaceId: workspace._id, registrationId: registration._id, codebaseVersionId: battle.codebaseVersionId, userId: req.user.id, files: submissionFiles, fileCount: submissionFiles.length, evaluationStatus: 'NOT_EVALUATED' });
    workspace.status = 'SUBMITTED'; workspace.revision += 1; await workspace.save();
    res.status(201).json({ success: true, data: { id: String(submission._id), battleId: String(battle._id), evaluationStatus: submission.evaluationStatus, fileCount: submission.fileCount, evaluation: 'DISABLED' } });
  } catch (error) {
    if (error.code === 11000) return fail(res, 409, 'DUPLICATE_SUBMISSION', 'This workspace has already been submitted.');
    if (submission?._id) {
      const deleted = await DevBattleSubmission.deleteOne({ _id: submission._id, workspaceId: workspace._id });
      if (deleted.deletedCount === 1) await Promise.allSettled(submissionFiles.map(removeStoredFile));
    } else {
      await Promise.allSettled(submissionFiles.map(removeStoredFile));
    }
    throw error;
  }
}));

router.post('/', adminOnly, wrap(async (req, res) => {
  const body = req.body || {};
  const durationMinutes = Number(body.durationMinutes);
  const capacity = Number(body.capacity || 100);
  if (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 360) return fail(res, 422, 'INVALID_DURATION', 'Duration must be between 5 and 360 minutes.');
  if (!Number.isInteger(capacity) || capacity < 2 || capacity > 10000) return fail(res, 422, 'INVALID_CAPACITY', 'Capacity must be between 2 and 10000.');
  const startsAt = new Date(body.startsAt);
  const registrationDeadline = new Date(body.registrationDeadline);
  if (!Number.isFinite(+startsAt) || !Number.isFinite(+registrationDeadline) || registrationDeadline >= startsAt || startsAt <= new Date()) return fail(res, 422, 'INVALID_SCHEDULE', 'Use a future start time with a registration deadline before it.');
  if (!idOk(body.codebaseId) || !Number.isInteger(Number(body.codebaseVersion)) || Number(body.codebaseVersion) < 1) return fail(res, 422, 'INVALID_CHALLENGE', 'A published codebase version is required.');
  const codebase = await Codebase.findOne({ _id: body.codebaseId, state: 'PUBLISHED' });
  const version = codebase && await CodebaseVersion.findOne({ codebaseId: body.codebaseId, version: Number(body.codebaseVersion) }).select('+snapshot');
  if (!codebase || !version) return fail(res, 404, 'CHALLENGE_NOT_FOUND', 'The published challenge version was not found.');
  try {
    const battle = await DevBattle.create({
      ownerId: req.user.id, codebaseId: codebase._id, codebaseVersionId: version._id, codebaseVersion: version.version,
      challengeTitle: version.snapshot.title, difficulty: version.snapshot.difficulty, languages: version.snapshot.languages || [],
      title: requiredText(body.title, 'Title', 100), description: typeof body.description === 'string' ? body.description.trim().slice(0, 2000) : '',
      instructions: typeof body.instructions === 'string' ? body.instructions.trim().slice(0, 10000) : '',
      rules: typeof body.rules === 'string' ? body.rules.trim().slice(0, 5000) : '',
      startsAt, registrationDeadline, durationMinutes, capacity,
      status: 'SCHEDULED'
    });
    res.status(201).json({ success: true, data: serialize(battle, null, true) });
  } catch (error) { return fail(res, 422, 'VALIDATION_ERROR', error.message); }
}));

router.post('/:id/register', wrap(async (req, res) => {
  if (!idOk(req.params.id)) return fail(res, 400, 'INVALID_ID', 'Battle ID is invalid.');
  const battle = await DevBattle.findById(req.params.id).select('+eligibleUserIds');
  if (!battle || state(battle) !== 'SCHEDULED' || new Date() >= battle.registrationDeadline || (battle.eligibleUserIds.length && !battle.eligibleUserIds.includes(req.user.id))) return fail(res, 409, 'REGISTRATION_CLOSED', 'Registration is closed or you are not eligible.');
  const existing = await DevBattleRegistration.findOne({ battleId: battle._id, userId: req.user.id });
  if (existing?.status === 'REGISTERED') return fail(res, 409, 'ALREADY_REGISTERED', 'You are already registered.');
  if (battle.registrationCount >= battle.capacity) return fail(res, 409, 'BATTLE_FULL', 'This battle is full.');
  const registration = existing ? await DevBattleRegistration.findByIdAndUpdate(existing._id, { status: 'REGISTERED' }, { new: true }) : await DevBattleRegistration.create({ battleId: battle._id, userId: req.user.id });
  await DevBattle.updateOne({ _id: battle._id }, { $inc: { registrationCount: 1 } });
  res.status(201).json({ success: true, data: { id: String(registration._id), status: registration.status } });
}));

router.delete('/:id/register', wrap(async (req, res) => {
  const registration = await DevBattleRegistration.findOneAndUpdate({ battleId: req.params.id, userId: req.user.id, status: 'REGISTERED' }, { status: 'CANCELLED' }, { new: true });
  if (registration) await DevBattle.updateOne({ _id: req.params.id, registrationCount: { $gt: 0 } }, { $inc: { registrationCount: -1 } });
  res.status(204).end();
}));

router.get('/:id/workspace', wrap(async (req, res) => {
  if (!idOk(req.params.id)) return fail(res, 400, 'INVALID_ID', 'Battle ID is invalid.');
  const battle = await DevBattle.findById(req.params.id);
  if (!battle) return fail(res, 404, 'NOT_FOUND', 'Battle was not found.');
  const registration = await DevBattleRegistration.findOne({ battleId: battle._id, userId: req.user.id, status: 'REGISTERED' });
  if (!registration) return fail(res, 403, 'REGISTRATION_REQUIRED', 'Register for the battle first.');
  const workspace = await DevBattleWorkspace.findOne({ battleId: battle._id, userId: req.user.id }).select('+files.storageKey +files.checksum');
  if (!workspace) return res.json({ success: true, data: null });
  const challenge = await challengeFiles(battle);
  if (!challenge) return fail(res, 404, 'CHALLENGE_NOT_FOUND', 'The challenge version is unavailable.');
  const overrides = new Map(await Promise.all(workspace.files.map(async file => [file.path, { path: file.path, content: (await getStoredFile(file)).toString('utf8') }])));
  res.json({ success: true, data: serializeWorkspace(workspace, challenge.files.map(file => overrides.get(file.path) || file)) });
}));

router.post('/:id/workspace', wrap(async (req, res) => {
  if (!idOk(req.params.id)) return fail(res, 400, 'INVALID_ID', 'Battle ID is invalid.');
  const battle = await DevBattle.findById(req.params.id);
  if (!battle || state(battle) !== 'LIVE') return fail(res, 409, 'BATTLE_NOT_LIVE', 'The battle workspace is only available while the battle is live.');
  const registration = await DevBattleRegistration.findOne({ battleId: battle._id, userId: req.user.id, status: 'REGISTERED' });
  if (!registration) return fail(res, 403, 'REGISTRATION_REQUIRED', 'Register for the battle first.');
  let workspace = await DevBattleWorkspace.findOne({ battleId: battle._id, userId: req.user.id }).select('+files.storageKey +files.checksum');
  if (!workspace) workspace = await DevBattleWorkspace.create({ battleId: battle._id, registrationId: registration._id, codebaseVersionId: battle.codebaseVersionId, userId: req.user.id });
  const challenge = await challengeFiles(battle);
  res.status(201).json({ success: true, data: serializeWorkspace(workspace, challenge.files) });
}));

router.patch('/:id/workspace/:workspaceId', wrap(async (req, res) => {
  if (!idOk(req.params.id) || !idOk(req.params.workspaceId)) return fail(res, 400, 'INVALID_ID', 'An identifier is invalid.');
  const battle = await DevBattle.findById(req.params.id);
  if (!battle || state(battle) !== 'LIVE') return fail(res, 409, 'BATTLE_NOT_LIVE', 'The battle workspace is closed.');
  const workspace = await DevBattleWorkspace.findOne({ _id: req.params.workspaceId, battleId: battle._id, userId: req.user.id }).select('+files.storageKey +files.checksum');
  if (!workspace) return fail(res, 404, 'WORKSPACE_NOT_FOUND', 'Workspace was not found.');
  if (workspace.status !== 'ACTIVE' || Number(req.body.revision) !== workspace.revision) return fail(res, 409, 'WORKSPACE_CONFLICT', 'Workspace changed or is no longer editable.');
  const challenge = await challengeFiles(battle);
  let files;
  try { files = validateProjectFiles(req.body.files, challenge.files.map(file => file.path)); }
  catch (error) { return fail(res, 422, 'INVALID_WORKSPACE', error.message); }
  const created = [];
  try {
    const refs = [];
    for (const file of files) {
      const reference = await putStoredFile(Buffer.from(file.content), { contentType: file.contentType });
      created.push(reference);
      refs.push({ path: file.path, ...reference });
    }
    if (refs.reduce((sum, file) => sum + file.size, 0) > MAX_TOTAL_BYTES) {
      const error = new Error('Workspace exceeds the project size limit.');
      error.code = 'WORKSPACE_TOO_LARGE';
      throw error;
    }
    const saved = await DevBattleWorkspace.findOneAndUpdate({ _id: workspace._id, revision: workspace.revision, status: 'ACTIVE' }, { $set: { files: refs }, $inc: { revision: 1 } }, { new: true }).select('+files.storageKey +files.checksum');
    if (!saved) {
      const error = new Error('Workspace changed before saving.');
      error.code = 'WORKSPACE_CONFLICT';
      throw error;
    }
    await Promise.allSettled(workspace.files.map(removeStoredFile));
    const overrides = new Map(files.map(file => [file.path, file]));
    res.json({ success: true, data: serializeWorkspace(saved, challenge.files.map(file => overrides.get(file.path) || file)) });
  } catch (error) {
    await Promise.allSettled(created.map(removeStoredFile));
    if (error.code === 'WORKSPACE_TOO_LARGE') return fail(res, 413, error.code, error.message);
    if (error.code === 'WORKSPACE_CONFLICT') return fail(res, 409, error.code, error.message);
    throw error;
  }
}));

router.get('/:id', wrap(async (req, res) => {
  if (!idOk(req.params.id)) return fail(res, 400, 'INVALID_ID', 'Battle ID is invalid.');
  const battle = await DevBattle.findOne({ _id: req.params.id, status: { $ne: 'DRAFT' } });
  if (!battle) return fail(res, 404, 'NOT_FOUND', 'Battle was not found.');
  const registration = await DevBattleRegistration.findOne({ battleId: battle._id, userId: req.user.id, status: 'REGISTERED' }).select('_id status');
  const [owner, codebase] = await Promise.all([
    User.findById(battle.ownerId).select('name').lean(),
    Codebase.findById(battle.codebaseId).select('technologies frameworks databaseTechnology').lean()
  ]);
  const technologies = [...(codebase?.technologies || []), ...(codebase?.frameworks || []), codebase?.databaseTechnology].filter(Boolean);
  res.json({ success: true, data: { ...serialize(battle, registration ? { id: String(registration._id), status: registration.status } : null), hostName: owner?.name || 'DebugDSA host', technologies } });
}));

router.use((error, _req, res, _next) => {
  if (error instanceof StorageNotFoundError) return fail(res, 404, 'FILE_UNAVAILABLE', 'Battle file is currently unavailable.');
  console.error(JSON.stringify({ level: 'error', module: 'battles', name: error.name || 'Error', code: error.code || 'INTERNAL_ERROR' }));
  return fail(res, 500, 'INTERNAL_ERROR', 'An internal error occurred.');
});

export default router;
