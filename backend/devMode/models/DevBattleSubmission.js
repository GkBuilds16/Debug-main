import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  battleId: { type: mongoose.Schema.Types.ObjectId, ref: 'DevBattle', required: true },
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'DevBattleWorkspace', required: true },
  registrationId: { type: mongoose.Schema.Types.ObjectId, ref: 'DevBattleRegistration', required: true },
  codebaseVersionId: { type: mongoose.Schema.Types.ObjectId, ref: 'CodebaseVersion', required: true },
  userId: { type: String, required: true },
  files: { type: [{ path: String, storageProvider: { type: String, enum: ['local', 'r2'], default: 'local' }, size: Number, checksum: { type: String, select: false }, contentType: String, metadataVersion: Number, storageKey: { type: String, select: false } }], required: true, select: false },
  fileCount: { type: Number, required: true, min: 1, max: 300 },
  evaluationStatus: { type: String, enum: ['NOT_EVALUATED', 'PENDING', 'EVALUATED', 'FAILED'], default: 'NOT_EVALUATED' },
  result: { type: mongoose.Schema.Types.Mixed, default: null, select: false }
}, { timestamps: true, collection: 'devBattleSubmissions' });

schema.index({ workspaceId: 1 }, { unique: true });
schema.index({ battleId: 1, userId: 1 });
schema.index({ evaluationStatus: 1, battleId: 1, userId: 1 });
export default mongoose.models.DevBattleSubmission || mongoose.model('DevBattleSubmission', schema);
