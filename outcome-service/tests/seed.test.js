const { buildRecords, CLINIC_PLANS } = require('../src/seed');

describe('demo seed data', () => {
  // Early on the 7th, before the 09:00 the seeder stamps records with.
  const now = new Date(Date.UTC(2026, 10, 7, 6));

  it.each(Object.keys(CLINIC_PLANS))('never dates a %s record in the future', (clinicId) => {
    const records = buildRecords(clinicId, now);

    expect(records.length).toBeGreaterThan(0);
    records.forEach((record) => {
      expect(record.recordedAt.getTime()).toBeLessThanOrEqual(now.getTime());
    });
  });

  it('uses only synthetic patient names', () => {
    Object.keys(CLINIC_PLANS).forEach((clinicId) => {
      buildRecords(clinicId, now).forEach((record) => {
        expect(record.patientName).toMatch(/^Demo Patient /);
      });
    });
  });
});
