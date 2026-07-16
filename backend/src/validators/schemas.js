import { z } from 'zod';

const email = z.string().email().max(255);
const password = z.string().min(8, 'Password must be at least 8 characters').max(128);
const uuid = z.string().uuid();

// ─── Auth ──────────────────────────────────────────────────────────────────────
export const registerSchema = z.object({
  email,
  password,
  firstName: z.string().min(1).max(120),
  lastName: z.string().min(1).max(120),
  role: z.enum(['admin', 'prescriber', 'nurse', 'staff', 'pharmacist']).default('staff'),
  practiceName: z.string().min(1).max(200).optional(),
  practiceId: uuid.optional(),
  npi: z.string().max(20).optional(),
  deaNumber: z.string().max(20).optional(),
  stateLicense: z.string().max(40).optional(),
  phone: z.string().max(40).optional(),
});

export const loginSchema = z.object({ email, password });
export const verifyEmailSchema = z.object({ token: z.string().min(10) });
export const forgotPasswordSchema = z.object({ email });
export const resetPasswordSchema = z.object({ token: z.string().min(10), password });
export const resendVerificationSchema = z.object({ email });

// ─── Patients ────────────────────────────────────────────────────────────────────
export const createPatientSchema = z.object({
  firstName: z.string().min(1).max(120),
  lastName: z.string().min(1).max(120),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  sex: z.enum(['male', 'female', 'other', 'unknown']).default('unknown'),
  mrn: z.string().max(60).optional(),
  externalEmrId: z.string().max(120).optional(),
  phone: z.string().max(40).optional(),
  email: email.optional(),
  addressLine1: z.string().max(200).optional(),
  addressLine2: z.string().max(200).optional(),
  city: z.string().max(120).optional(),
  state: z.string().max(40).optional(),
  postalCode: z.string().max(20).optional(),
  weightKg: z.number().positive().max(700).optional(),
  heightCm: z.number().positive().max(300).optional(),
  notes: z.string().max(4000).optional(),
});
export const updatePatientSchema = createPatientSchema.partial();

export const createAllergySchema = z.object({
  allergen: z.string().min(1).max(200),
  rxnormCui: z.string().max(20).optional(),
  reaction: z.string().max(400).optional(),
  severity: z.enum(['mild', 'moderate', 'severe', 'life_threatening']).default('moderate'),
  onsetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// ─── Prescriptions ───────────────────────────────────────────────────────────────
export const createPrescriptionSchema = z.object({
  patientId: uuid,
  medicationId: uuid.optional(),
  rxnormCui: z.string().max(20).optional(),
  prescriberId: uuid.optional(),
  pharmacyId: uuid.optional(),
  sig: z.string().min(1).max(1000),
  quantity: z.number().positive(),
  quantityUnit: z.string().max(40).default('each'),
  daysSupply: z.number().int().positive().max(365).optional(),
  refills: z.number().int().min(0).max(99).default(0),
  substitutionAllowed: z.boolean().default(true),
  noteToPharmacist: z.string().max(1000).optional(),
  diagnosisCode: z.string().max(20).optional(),
}).refine((d) => d.medicationId || d.rxnormCui, {
  message: 'Either medicationId or rxnormCui is required',
  path: ['medicationId'],
});

export const updatePrescriptionSchema = z.object({
  pharmacyId: uuid.optional(),
  sig: z.string().min(1).max(1000).optional(),
  quantity: z.number().positive().optional(),
  quantityUnit: z.string().max(40).optional(),
  daysSupply: z.number().int().positive().max(365).optional(),
  refills: z.number().int().min(0).max(99).optional(),
  substitutionAllowed: z.boolean().optional(),
  noteToPharmacist: z.string().max(1000).optional(),
  diagnosisCode: z.string().max(20).optional(),
});

export const signPrescriptionSchema = z.object({
  overrides: z
    .array(z.object({ checkType: z.string(), reason: z.string().min(3).max(500) }))
    .optional()
    .default([]),
  // EPCS two-factor code, required only when signing controlled substances
  otpToken: z.string().regex(/^\d{6}$/).optional(),
});

export const cancelPrescriptionSchema = z.object({
  reason: z.string().min(3).max(500),
});

// ─── Pharmacies ──────────────────────────────────────────────────────────────────
export const createPharmacySchema = z.object({
  name: z.string().min(1).max(200),
  ncpdpId: z.string().max(40).optional(),
  npi: z.string().max(20).optional(),
  phone: z.string().max(40).optional(),
  fax: z.string().max(40).optional(),
  addressLine1: z.string().max(200).optional(),
  city: z.string().max(120).optional(),
  state: z.string().max(40).optional(),
  postalCode: z.string().max(20).optional(),
  acceptsControlled: z.boolean().default(false),
});
