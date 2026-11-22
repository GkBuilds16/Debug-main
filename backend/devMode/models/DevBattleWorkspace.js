import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  battleId: { type: mongoose.Schema.Types.ObjectId, ref: 'DevBattle', required: true },
  registrationId: { type: mongoose.Schema.Types.ObjectId, ref: 'DevBattleRegistration', required: true },
  codebaseVersionId: { type: mongoose.Schema.Types.ObjectId, ref: 'CodebaseVersion', required: true },
  userId: { type: String, required: true },
  files: { type: [{ path: String, storageProvider: { type: String, enum: ['local', 'r2'], default: 'local' }, size: Number, checksum: { type: String, select: false }, contentType: String, metadataVersion: Number, storageKey: { type: String, select: false } }], default: [] },
  revision: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ['ACTIVE', 'SUBMITTED', 'CLOSED'], default: 'ACTIVE' }
}, { timestamps: true, collection: 'devBattleWorkspaces' });

schema.index({ battleId: 1, userId: 1 }, { unique: true });
export default mongoose.models.DevBattleWorkspace || mongoose.model('DevBattleWorkspace', schema);
