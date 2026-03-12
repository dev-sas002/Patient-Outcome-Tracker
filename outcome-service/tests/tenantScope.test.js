const { configureEnv, dropAll } = require('./helpers/testEnv');

const NAMESPACE = 'tenantscope';
configureEnv(NAMESPACE);

const mongoose = require('mongoose');
const { getClinicConnection, getClinicOutcomeModel, closeAll } = require('../src/tenancy/connectionPool');
const { TenantScopeError } = require('../src/tenancy/tenantScope');
const { outcomeFixture } = require('./helpers/fixtures');

const ALPHA = 'test-clinic-alpha';
const BETA = 'test-clinic-beta';

let Alpha;
let Beta;

beforeAll(async () => {
  Alpha = getClinicOutcomeModel(await getClinicConnection(ALPHA, `${NAMESPACE}_alpha`));
  Beta = getClinicOutcomeModel(await getClinicConnection(BETA, `${NAMESPACE}_beta`));
});

afterAll(async () => {
  await closeAll();
  await mongoose.connect(process.env.MONGODB_REGISTRY_URI);
  await dropAll(NAMESPACE);
  await mongoose.disconnect();
});

beforeEach(async () => {
  await Alpha.deleteMany({});
  await Beta.deleteMany({});
  await Alpha.insertMany([outcomeFixture(ALPHA, 0), outcomeFixture(ALPHA, 1)]);
  await Beta.insertMany([outcomeFixture(BETA, 0)]);
});

describe('a model is bound to exactly one clinic', () => {
  it('reports the clinic it is bound to', () => {
    expect(Alpha.boundClinicId()).toBe(ALPHA);
    expect(Beta.boundClinicId()).toBe(BETA);
  });

  it('cannot be compiled without a clinic', () => {
    const { getTenantOutcomeSchema } = require('../src/schemas/outcome');
    expect(() => getTenantOutcomeSchema()).toThrow(TenantScopeError);
    expect(() => getTenantOutcomeSchema('')).toThrow(TenantScopeError);
  });
});

describe('a query that forgets to scope itself is scoped anyway', () => {
  it('injects the clinic into an empty find filter', async () => {
    // This is the whole point: the caller wrote no filter at all, and still
    // cannot see the other clinic's record.
    const docs = await Alpha.find({});
    expect(docs).toHaveLength(2);
    expect(docs.every((d) => d.clinicId === ALPHA)).toBe(true);
  });

  it('injects the clinic into countDocuments and distinct', async () => {
    await expect(Alpha.countDocuments({})).resolves.toBe(2);
    await expect(Beta.countDocuments({})).resolves.toBe(1);
    await expect(Alpha.distinct('clinicId')).resolves.toEqual([ALPHA]);
  });

  it('injects a $match on the clinic as stage zero of an aggregation', async () => {
    const rows = await Alpha.aggregate([{ $group: { _id: '$clinicId', n: { $sum: 1 } } }]);
    expect(rows).toEqual([{ _id: ALPHA, n: 2 }]);
  });

  it('scopes a deleteMany so it cannot empty another clinic', async () => {
    await Alpha.deleteMany({});
    await expect(Alpha.countDocuments({})).resolves.toBe(0);
    await expect(Beta.countDocuments({})).resolves.toBe(1);
  });
});

describe('a query that names another clinic throws instead of returning nothing', () => {
  it('rejects a find filtered to a different clinic', async () => {
    await expect(Alpha.find({ clinicId: BETA })).rejects.toThrow(TenantScopeError);
  });

  it('rejects a findOne filtered to a different clinic', async () => {
    await expect(Alpha.findOne({ clinicId: BETA })).rejects.toThrow(TenantScopeError);
  });

  it('rejects an update that tries to move a record to another clinic', async () => {
    await expect(
      Alpha.updateMany({}, { $set: { clinicId: BETA } })
    ).rejects.toThrow(TenantScopeError);
  });

  it('rejects an aggregation whose first $match names another clinic', async () => {
    await expect(Alpha.aggregate([{ $match: { clinicId: BETA } }])).rejects.toThrow(
      TenantScopeError
    );
  });

  it('rejects a save that carries another clinic', async () => {
    const doc = new Alpha(outcomeFixture(BETA, 2));
    await expect(doc.save()).rejects.toThrow(TenantScopeError);
  });

  it('rejects an insertMany where any document carries another clinic', async () => {
    await expect(
      Alpha.insertMany([outcomeFixture(ALPHA, 3), outcomeFixture(BETA, 4)])
    ).rejects.toThrow(TenantScopeError);
    await expect(Alpha.countDocuments({})).resolves.toBe(2);
  });

  it('leaves a missing clinic to schema validation rather than swallowing it', async () => {
    const payload = outcomeFixture(ALPHA, 5);
    delete payload.clinicId;
    await expect(Alpha.create(payload)).rejects.toThrow(mongoose.Error.ValidationError);
  });
});

describe('APIs that cannot be scoped are disabled', () => {
  it.each(['estimatedDocumentCount', 'bulkWrite'])('blocks %s', (method) => {
    expect(() => Alpha[method]()).toThrow(TenantScopeError);
  });
});
