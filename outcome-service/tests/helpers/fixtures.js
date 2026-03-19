const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./testEnv');

// All fixture data below is obviously synthetic. Nothing here resembles a real
// person, a real clinic or a real medical record.
const CLINIC_ALPHA = {
  clinicId: 'test-clinic-alpha',
  name: 'Test Clinic Alpha',
  address: '1 Example Way, Testville',
  isActive: true,
};

const CLINIC_BETA = {
  clinicId: 'test-clinic-beta',
  name: 'Test Clinic Beta',
  address: '2 Example Way, Testville',
  isActive: true,
};

const CLINIC_CLOSED = {
  clinicId: 'test-clinic-closed',
  name: 'Test Clinic Closed',
  address: '3 Example Way, Testville',
  isActive: false,
};

function outcomeFixture(clinicId, index, overrides = {}) {
  return {
    clinicId,
    patientName: `Test Patient ${String.fromCharCode(65 + index)}`,
    age: 30 + index,
    diagnosis: `Synthetic Condition ${index}`,
    treatment: `Synthetic Protocol ${index}`,
    outcome: ['improved', 'stable', 'declined'][index % 3],
    notes: `Synthetic note ${index}`,
    createdBy: 'test.user',
    ...overrides,
  };
}

function signToken(claims = {}, options = {}) {
  return jwt.sign(
    {
      userId: '000000000000000000000001',
      username: 'test.user',
      clinicId: CLINIC_ALPHA.clinicId,
      role: 'doctor',
      ...claims,
    },
    options.secret || JWT_SECRET,
    { expiresIn: options.expiresIn || '1h' }
  );
}

function bearer(token) {
  return `Bearer ${token}`;
}

module.exports = {
  CLINIC_ALPHA,
  CLINIC_BETA,
  CLINIC_CLOSED,
  outcomeFixture,
  signToken,
  bearer,
};
