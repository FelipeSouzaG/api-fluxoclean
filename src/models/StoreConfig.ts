import mongoose, { Document, Schema } from 'mongoose';

export interface ICompanyAddress {
  cep: string;
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  complement?: string;
}

export interface ICompanyInfo {
  name: string;
  cnpjCpf: string;
  phone: string;
  email: string;
  address: ICompanyAddress;
}

export interface IStoreConfig extends Document {
  tenantId: string;
  companyInfo: ICompanyInfo;
}

const CompanyAddressSchema = new Schema(
  {
    cep: { type: String, default: '' },
    street: { type: String, default: '' },
    number: { type: String, default: '' },
    neighborhood: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    complement: String,
  },
  { _id: false }
);

const CompanyInfoSchema = new Schema(
  {
    name: { type: String, default: '' },
    cnpjCpf: { type: String, default: '' },
    phone: { type: String, default: '' },
    email: { type: String, default: '' },
    address: { type: CompanyAddressSchema, default: () => ({}) },
  },
  { _id: false }
);

const StoreConfigSchema: Schema = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    companyInfo: { type: CompanyInfoSchema, default: () => ({}) },
  },
  {
    timestamps: true,
    strict: false, // Allow other fields (KPIs, settings) to exist in DB without explicit definition here
  }
);

export default mongoose.model<IStoreConfig>('StoreConfig', StoreConfigSchema);
