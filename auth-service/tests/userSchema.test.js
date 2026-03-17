const { configureEnv, dropAll } = require('./helpers/testEnv');

const NAMESPACE = 'authschema';
configureEnv(NAMESPACE);

const mongoose = require('mongoose');
const { getClinicConnection, getClinicUserModel, closeAll } = require('../src/tenancy/connectionPool');
const { TEST_PASSWORD } = require('./helpers/fixtures');

const CLINIC_ID = 'test-clinic-schema';
let User;

const base = {
  username: 'Schema.User',
  password: TEST_PASSWORD,
  fullName: 'Test User Schema',
  clinicId: CLINIC_ID,
};

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_REGISTRY_URI);
  const conn = await getClinicConnection(CLINIC_ID, `${NAMESPACE}_db`);
  User = getClinicUserModel(conn);
});

afterAll(async () => {
  await closeAll();
  await dropAll(NAMESPACE);
  await mongoose.disconnect();
});

beforeEach(async () => {
  await User.deleteMany({});
});

describe('user schema', () => {
  it('lower-cases and trims the username on save', async () => {
    const user = await User.create({ ...base, username: '  Schema.User  ' });
    expect(user.username).toBe('schema.user');
  });

  it('hashes the password before storing it', async () => {
    const user = await User.create(base);
    expect(user.password).not.toBe(TEST_PASSWORD);
    expect(user.password).toMatch(/^\$2[aby]\$/);
  });

  it('does not re-hash an unchanged password on a second save', async () => {
    const user = await User.create(base);
    const firstHash = user.password;
    user.fullName = 'Test User Renamed';
    await user.save();
    expect(user.password).toBe(firstHash);
    await expect(user.comparePassword(TEST_PASSWORD)).resolves.toBe(true);
  });

  it('re-hashes when the password actually changes', async () => {
    const user = await User.create(base);
    const firstHash = user.password;
    user.password = 'another-test-password';
    await user.save();
    expect(user.password).not.toBe(firstHash);
    await expect(user.comparePassword('another-test-password')).resolves.toBe(true);
    await expect(user.comparePassword(TEST_PASSWORD)).resolves.toBe(false);
  });

  it('strips the password hash from the serialized document', async () => {
    const user = await User.create(base);
    expect(JSON.parse(JSON.stringify(user))).not.toHaveProperty('password');
  });

  it.each(['username', 'password', 'fullName', 'clinicId'])('requires %s', async (field) => {
    const payload = { ...base };
    delete payload[field];
    await expect(User.create(payload)).rejects.toThrow(mongoose.Error.ValidationError);
  });

  it('rejects a password shorter than the minimum length', async () => {
    await expect(User.create({ ...base, password: 'short' })).rejects.toThrow(
      mongoose.Error.ValidationError
    );
  });

  it.each(['doctor', 'nurse', 'admin'])('accepts the %s role', async (role) => {
    const user = await User.create({ ...base, role });
    expect(user.role).toBe(role);
  });

  it('defaults the role to doctor', async () => {
    const user = await User.create(base);
    expect(user.role).toBe('doctor');
  });

  it('rejects a role outside the enum', async () => {
    await expect(User.create({ ...base, role: 'superuser' })).rejects.toThrow(
      mongoose.Error.ValidationError
    );
  });
});
