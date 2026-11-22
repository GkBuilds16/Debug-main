import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  battleId: { type: mongoose.Schema.Types.ObjectId, ref: 'DevBattle', required: true },
  userId: { type: String, required: true },
  status: { type: String, enum: ['REGISTERED', 'CANCELLED'], default: 'REGISTERED' }
}, { timestamps: true, collection: 'devBattleRegistrations' });

schema.index({ battleId: 1, userId: 1 }, { unique: true });
export default mongoose.models.DevBattleRegistration || mongoose.model('DevBattleRegistration', schema);
