import express from 'express';
import mongoose from 'mongoose';
import Codebase from '../../models/Codebase.js';
import User from '../../../models/User.js';
import { identity } from '../../identity.js';
import { fileTree, readProjectFiles } from '../post-codebase/services/projectFiles.js';
import { normalizeProjectPath } from '../post-codebase/services/filePolicy.js';

const router = express.Router();
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const fail = (res, status, code, message) => res.status(status).json({ success: false, error: { code, message } });
const publicFields = 'ownerId title description detailedDescription estimatedMinutes problemStatement category difficulty languages technologies frameworks runtimeVersions databaseTechnology requiredTools dependencies commands tags readme instructions prerequisites environmentDocumentation configurationInstructions expectedStructure bugTitle bugDescription currentBehavior expectedBehavior actualBehavior reproductionSteps relevantFiles relevantSymbols errorLogs acceptanceCriteria expectedDeliverables publicHints state publishedAt version viewCount attemptCount createdAt updatedAt';

const serializeSummary = (row, owners) => {
  const owner = owners.get(String(row.ownerId));
  const { ownerId, files, ...publicData } = row;
  return {
    ...publicData,
    fileCount: files?.length || 0,
    reportedIssueCount: row.bugTitle || row.bugDescription ? 1 : 0,
    author: owner ? { id: String(owner._id), name: owner.name } : { id: row.ownerId, name: 'DebugDSA user' }
  };
};

router.use(identity);

router.get('/codebases', wrap(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(24, Math.max(1, Number.parseInt(req.query.limit, 10) || 12));
  const filter = { state: 'PUBLISHED' };
  if (['Easy', 'Medium', 'Hard'].includes(req.query.difficulty)) filter.difficulty = req.query.difficulty;
  for (const [query, field] of [['language', 'languages'], ['technology', 'technologies'], ['framework', 'frameworks'], ['tag', 'tags']]) {
    if (typeof req.query[query] === 'string' && req.query[query].trim().length <= 40) filter[field] = req.query[query].trim();
  }
  if (typeof req.query.q === 'string' && req.query.q.trim()) filter.$text = { $search: req.query.q.trim().slice(0, 100) };
  const sortName = ['newest', 'oldest', 'popular', 'difficulty', 'time'].includes(req.query.sort) ? req.query.sort : 'newest';
  const sort = { newest: { publishedAt: -1, createdAt: -1 }, oldest: { publishedAt: 1 }, popular: { viewCount: -1, attemptCount: -1, publishedAt: -1 }, time: { estimatedMinutes: 1, publishedAt: -1 } }[sortName];
  const query = Codebase.find(filter).select(`${publicFields} files.path`);
  const rowsPromise = sortName === 'difficulty'
    ? Codebase.aggregate([
      { $match: filter },
      { $addFields: { difficultyRank: { $switch: { branches: [
        { case: { $eq: ['$difficulty', 'Hard'] }, then: 3 },
        { case: { $eq: ['$difficulty', 'Medium'] }, then: 2 },
        { case: { $eq: ['$difficulty', 'Easy'] }, then: 1 }
      ], default: 0 } } } },
      { $sort: { difficultyRank: -1, publishedAt: -1 } }, { $skip: (page - 1) * limit }, { $limit: limit },
      { $project: { difficultyRank: 0, 'files.content': 0, 'files.storageKey': 0, 'files.checksum': 0, privateNotes: 0, intendedBugExplanation: 0, solutionApproach: 0, evaluationRubric: 0, hiddenRequirements: 0, internalReferences: 0, hiddenTests: 0 } }
    ])
    : query.sort(sort).skip((page - 1) * limit).limit(limit).lean();
  const [rows, total] = await Promise.all([
    rowsPromise,
    Codebase.countDocuments(filter)
  ]);
  const ownerIds = [...new Set(rows.map(row => String(row.ownerId)))];
  const owners = await User.find({ _id: { $in: ownerIds } }).select('name').lean();
  const ownerMap = new Map(owners.map(owner => [String(owner._id), owner]));
  res.json({ success: true, data: rows.map(row => serializeSummary(row, ownerMap)), pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}));

router.get('/codebases/:id', wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, 'INVALID_ID', 'Codebase ID is invalid.');
  const row = await Codebase.findOneAndUpdate({ _id: req.params.id, state: 'PUBLISHED' }, { $inc: { viewCount: 1 } }, { new: true }).select(`${publicFields} files.path`).lean();
  if (!row) return fail(res, 404, 'NOT_FOUND', 'Published codebase was not found.');
  const owner = await User.findById(row.ownerId).select('name').lean();
  res.json({ success: true, data: serializeSummary(row, new Map(owner ? [[String(owner._id), owner]] : [])) });
}));

router.get('/codebases/:id/files', wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, 'INVALID_ID', 'Codebase ID is invalid.');
  const row = await Codebase.findOne({ _id: req.params.id, state: 'PUBLISHED' }).select('files.path files.size files.contentType directories').lean();
  if (!row) return fail(res, 404, 'NOT_FOUND', 'Published codebase was not found.');
  const tree = fileTree(row.files, row.directories);
  const query = typeof req.query.q === 'string' ? req.query.q.toLowerCase().slice(0, 100) : '';
  res.json({ success: true, data: query ? { ...tree, files: tree.files.filter(file => file.path.toLowerCase().includes(query)) } : tree });
}));

router.get('/codebases/:id/file', wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, 'INVALID_ID', 'Codebase ID is invalid.');
  let filePath;
  try { filePath = normalizeProjectPath(req.query.path); } catch (error) { return fail(res, 422, 'INVALID_PATH', error.message); }
  const row = await Codebase.findOne({ _id: req.params.id, state: 'PUBLISHED' }).select('files.path files.size files.contentType files.storageProvider files.storageKey +files.checksum +files.content').lean();
  if (!row) return fail(res, 404, 'NOT_FOUND', 'Published codebase was not found.');
  const descriptor = row.files.find(file => file.path === filePath);
  if (!descriptor) return fail(res, 404, 'FILE_NOT_FOUND', 'Project file was not found.');
  try {
    const [file] = await readProjectFiles([descriptor]);
    res.json({ success: true, data: { path: file.path, content: file.content, size: Buffer.byteLength(file.content, 'utf8') } });
  } catch {
    return fail(res, 404, 'FILE_UNAVAILABLE', 'Project file is currently unavailable.');
  }
}));

export default router;
