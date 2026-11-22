import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  ownerId: { type: String, required: true },
  codebaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Codebase', required: true },
  codebaseVersionId: { type: mongoose.Schema.Types.ObjectId, ref: 'CodebaseVersion', required: true },
  codebaseVersion: { type: Number, required: true, min: 1 },
  challengeTitle: { type: String, required: true, maxlength: 100 },
  difficulty: { type: String, enum: ['Easy', 'Medium', 'Hard'], required: true },
  languages: { type: [{ type: String, maxlength: 30 }], default: [] },
  title: { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, default: '', maxlength: 2000 },
  instructions: { type: String, default: '', maxlength: 10000 },
  rules: { type: String, default: '', maxlength: 5000 },
  startsAt: { type: Date, required: true },
  registrationDeadline: { type: Date, required: true },
  durationMinutes: { type: Number, min: 5, max: 360, required: true },
  capacity: { type: Number, min: 2, max: 10000, default: 100 },
  registrationCount: { type: Number, min: 0, default: 0 },
  eligibleUserIds: { type: [String], default: [], select: false },
  status: { type: String, enum: ['DRAFT', 'SCHEDULED', 'LIVE', 'COMPLETED', 'CANCELLED'], default: 'DRAFT' }
}, { timestamps: true, collection: 'devBattles' });

schema.index({ startsAt: 1, status: 1 });
schema.index({ ownerId: 1, startsAt: -1 });
export default mongoose.models.DevBattle || mongoose.model('DevBattle', schema);
