const Clinic = require('../../src/models/Clinic');
const UserRegistry = require('../../src/models/UserRegistry');
const { getClinicConnection, getClinicUserModel } = require('../../src/tenancy/connectionPool');
const { USERS } = require('./fixtures');

/**
 * Seed the registry (clinics + username -> clinic routing) and each clinic's
 * own database with its own users, mirroring what src/seed.js does in dev.
 */
async function seedTenants(clinics) {
  await Clinic.deleteMany({});
  await UserRegistry.deleteMany({});
  await Clinic.insertMany(clinics);
  await UserRegistry.insertMany(
    USERS.map((u) => ({ username: u.username, clinicId: u.clinicId }))
  );

  for (const clinic of clinics) {
    const conn = await getClinicConnection(clinic.clinicId, clinic.dbName);
    const User = getClinicUserModel(conn);
    await User.deleteMany({});
    for (const user of USERS.filter((u) => u.clinicId === clinic.clinicId)) {
      await User.create(user);
    }
  }
}

module.exports = { seedTenants };
