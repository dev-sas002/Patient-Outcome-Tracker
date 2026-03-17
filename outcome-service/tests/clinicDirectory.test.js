const { configureEnv } = require('./helpers/testEnv');

const NAMESPACE = 'clinicdir';
configureEnv(NAMESPACE);

const { createClinicDirectory } = require('../src/tenancy/clinicDirectory');
const { ClinicAccessError } = require('../src/http/errors');

function fakeModel(docs) {
  const calls = [];
  return {
    calls,
    findOne(filter) {
      calls.push(filter);
      const doc = docs.find((d) => d.clinicId === filter.clinicId) || null;
      const chain = { select: () => chain, lean: async () => doc };
      return chain;
    },
  };
}

const ACTIVE = { clinicId: 'a', name: 'Clinic A', dbName: 'db_a', isActive: true };
const CLOSED = { clinicId: 'z', name: 'Clinic Z', dbName: 'db_z', isActive: false };

describe('clinic resolution', () => {
  it('returns an active clinic', async () => {
    const dir = createClinicDirectory({ model: fakeModel([ACTIVE]) });
    await expect(dir.requireActiveClinic('a')).resolves.toMatchObject({ dbName: 'db_a' });
  });

  it('refuses a deactivated clinic', async () => {
    const dir = createClinicDirectory({ model: fakeModel([CLOSED]) });
    await expect(dir.requireActiveClinic('z')).rejects.toThrow(ClinicAccessError);
    await expect(dir.requireActiveClinic('z')).rejects.toThrow(/inactive/i);
  });

  it('refuses an unknown clinic without confirming that the id is unknown', async () => {
    const dir = createClinicDirectory({ model: fakeModel([]) });
    await expect(dir.requireActiveClinic('nope')).rejects.toThrow(
      /Access to this clinic is not permitted/
    );
  });
});

describe('caching', () => {
  it('serves repeat lookups from cache instead of the registry', async () => {
    const model = fakeModel([ACTIVE]);
    const dir = createClinicDirectory({ model, ttlMs: 30_000 });

    await dir.requireActiveClinic('a');
    await dir.requireActiveClinic('a');
    await dir.requireActiveClinic('a');

    expect(model.calls).toHaveLength(1);
    expect(dir.stats()).toMatchObject({ hits: 2, misses: 1 });
  });

  it('caches the negative answer, so a forged clinic id is not a free registry hammer', async () => {
    const model = fakeModel([]);
    const dir = createClinicDirectory({ model, ttlMs: 30_000 });

    await expect(dir.requireActiveClinic('forged')).rejects.toThrow(ClinicAccessError);
    await expect(dir.requireActiveClinic('forged')).rejects.toThrow(ClinicAccessError);
    expect(model.calls).toHaveLength(1);
  });

  it('expires an entry once its TTL passes', async () => {
    const model = fakeModel([ACTIVE]);
    let clock = 1000;
    const dir = createClinicDirectory({ model, ttlMs: 500, now: () => clock });

    await dir.requireActiveClinic('a');
    clock += 100;
    await dir.requireActiveClinic('a');
    expect(model.calls).toHaveLength(1);

    clock += 1000;
    await dir.requireActiveClinic('a');
    expect(model.calls).toHaveLength(2);
  });

  it('can be disabled entirely so a deactivation takes effect immediately', async () => {
    const model = fakeModel([ACTIVE]);
    const dir = createClinicDirectory({ model, ttlMs: 0 });

    await dir.requireActiveClinic('a');
    await dir.requireActiveClinic('a');
    expect(model.calls).toHaveLength(2);
  });

  it('evicts the oldest entry past the size limit', async () => {
    const clinics = ['a', 'b', 'c'].map((id) => ({ ...ACTIVE, clinicId: id, dbName: `db_${id}` }));
    const model = fakeModel(clinics);
    const dir = createClinicDirectory({ model, ttlMs: 30_000, maxEntries: 2 });

    await dir.requireActiveClinic('a');
    await dir.requireActiveClinic('b');
    await dir.requireActiveClinic('c');
    expect(dir.stats().size).toBe(2);

    await dir.requireActiveClinic('a');
    expect(model.calls).toHaveLength(4);
  });

  it('can be invalidated for one clinic', async () => {
    const model = fakeModel([ACTIVE]);
    const dir = createClinicDirectory({ model, ttlMs: 30_000 });

    await dir.requireActiveClinic('a');
    dir.invalidate('a');
    await dir.requireActiveClinic('a');
    expect(model.calls).toHaveLength(2);
  });
});
