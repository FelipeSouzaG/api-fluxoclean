import mongoose, { Document, Schema } from 'mongoose';

export enum SystemType {
  COMMERCE = 'commerce',
  INDUSTRY = 'industry',
  SERVICES = 'services',
}

export enum SubscriptionStatus {
  PENDING_VERIFICATION = 'pending_verification', // New status for email loop
  TRIAL = 'trial',
  ACTIVE = 'active',
  EXPIRED = 'expired',
  BLOCKED = 'blocked',
}

export enum PlanType {
  TRIAL = 'trial',
  SINGLE_TENANT = 'single_tenant',
}

export interface ITenantRequest {
  type: 'extension' | 'upgrade' | 'migrate';
  status: 'pending' | 'waiting_payment' | 'approved' | 'rejected';
  requestedAt: Date;
  amount: number;
  referenceCode: string;
  pixPayload?: string;
  pixImage?: string;
  preferenceId?: string;
}

export interface ITenant extends Document {
  name: string;
  tenantName: string; // Slug for subdomain (e.g., "minha-loja")
  document: string; // CPF or CNPJ
  email: string; // Contact email (stored here for pre-registration)
  systemType: SystemType;
  status: SubscriptionStatus;
  plan: PlanType;
  trialEndsAt: Date;
  subscriptionEndsAt?: Date;
  singleTenantUrl?: string;
  monthlyPaymentDay?: number;
  billingDayConfigured: boolean;
  lastPaymentDate?: Date;
  extensionCount: number;
  requests: ITenantRequest[];
  registrationToken?: string; // Token for email verification
  createdAt: Date;
}

const RequestSchema = new Schema(
  {
    type: {
      type: String,
      required: true,
      enum: ['extension', 'upgrade', 'migrate'],
    },
    status: {
      type: String,
      required: true,
      default: 'pending',
      enum: ['pending', 'waiting_payment', 'approved', 'rejected'],
    },
    requestedAt: { type: Date, default: Date.now },
    amount: { type: Number, required: true },
    referenceCode: { type: String, required: true },
    pixPayload: { type: String },
    pixImage: { type: String },
    preferenceId: { type: String },
  },
  { _id: false }
);

const TenantSchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    tenantName: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      index: true,
    }, // Unique Subdomain Slug
    document: { type: String, required: true, unique: true },
    email: { type: String, required: true }, // Required for pre-registration flow
    systemType: {
      type: String,
      enum: Object.values(SystemType),
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(SubscriptionStatus),
      default: SubscriptionStatus.PENDING_VERIFICATION,
    },
    plan: {
      type: String,
      enum: Object.values(PlanType),
      default: PlanType.TRIAL,
    },
    trialEndsAt: { type: Date },
    subscriptionEndsAt: { type: Date },
    singleTenantUrl: { type: String },
    monthlyPaymentDay: { type: Number, default: 5, min: 1, max: 28 },
    billingDayConfigured: { type: Boolean, default: false },
    lastPaymentDate: { type: Date },
    extensionCount: { type: Number, default: 0 },
    requests: [RequestSchema],
    registrationToken: { type: String, select: false }, // Hidden by default
  },
  { timestamps: true }
);

export default mongoose.model<ITenant>('Tenant', TenantSchema);
