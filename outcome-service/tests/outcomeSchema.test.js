const { configureEnv, dropAll } = require('./helpers/testEnv');

const NAMESPACE = 'outcschema';
configureEnv(NAMESPACE);

const mongoose = require('mongoose');
const { getClinicConnection, getClinicOutcomeModel, closeAll } = require('../src/tenancy/connectionPool');
const { getOutcomeSchema } = require('../src/schemas/outcome');

const CLINIC_ID = 'test-clinic-schema';
let Outcome;

const base = {
  clinicId: CLINIC_ID,
  patientName: 'Test Patient Schema',
  diagnosis: 'Synthetic Condition S',
  treatment: 'Synthetic Protocol S',
  outcome: 'stable',
  createdBy: 'test.user',
};

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_REGISTRY_URI);
  const conn = await getClinicConnection(CLINIC_ID, `${NAMESPACE}_db`);
  Outcome = getClinicOutcomeModel(conn);
});

afterAll(async () => {
  await closeAll();
  await dropAll(NAMESPACE);
  await mongoose.disconnect();
});

beforeEach(async () => {
  await Outcome.deleteMany({});
});

describe('outcome schema', () => {
  it('stores a valid record with timestamps and a default empty note', async () => {
    const doc = await Outcome.create(base);
    expect(doc.notes).toBe('');
    expect(doc.createdAt).toBeInstanceOf(Date);
    expect(doc.updatedAt).toBeInstanceOf(Date);
  });

  it('trims whitespace from free-text clinical fields', async () => {
    const doc = await Outcome.create({
      ...base,
      patientName: '  Test Patient Spaced  ',
      diagnosis: '  Synthetic Condition T  ',
      treatment: '  Synthetic Protocol T  ',
      notes: '  spaced note  ',
    });
    expect(doc.patientName).toBe('Test Patient Spaced');
    expect(doc.diagnosis).toBe('Synthetic Condition T');
    expect(doc.treatment).toBe('Synthetic Protocol T');
    expect(doc.notes).toBe('spaced note');
  });

  it.each(['clinicId', 'patientName', 'diagnosis', 'treatment', 'outcome', 'createdBy'])(
    'requires %s',
    async (field) => {
      const payload = { ...base };
      delete payload[field];
      await expect(Outcome.create(payload)).rejects.toThrow(mongoose.Error.ValidationError);
    }
  );

  it.each(['improved', 'stable', 'declined'])('accepts the %s outcome value', async (value) => {
    const doc = await Outcome.create({ ...base, outcome: value });
    expect(doc.outcome).toBe(value);
  });

  it('rejects an outcome value outside the enum', async () => {
    await expect(Outcome.create({ ...base, outcome: 'cured' })).rejects.toThrow(
      mongoose.Error.ValidationError
    );
  });

  it.each([-1, 151])('rejects an age of %s', async (age) => {
    await expect(Outcome.create({ ...base, age })).rejects.toThrow(
      mongoose.Error.ValidationError
    );
  });

  it.each([0, 150])('accepts an age of %s at the boundary', async (age) => {
    const doc = await Outcome.create({ ...base, age });
    expect(doc.age).toBe(age);
  });

  it('declares a compound index that supports the clinic-scoped newest-first listing', () => {
    const indexes = getOutcomeSchema().indexes();
    const compound = indexes.find(([spec]) => spec.clinicId === 1 && spec.createdAt === -1);
    expect(compound).toBeDefined();
  });
});
