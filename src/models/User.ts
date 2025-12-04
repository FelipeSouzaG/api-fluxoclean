import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
  tenantId: mongoose.Types.ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  role: 'owner' | 'superadmin';
  resetPasswordToken?: string;
  resetPasswordExpires?: Date;
}

const UserSchema: Schema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  role: { type: String, default: 'owner' },
  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date },
});

export default mongoose.model<IUser>('User', UserSchema);
