// All fixture data below is obviously synthetic: no real clinic, person or
// credential appears in the test suite.
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

const TEST_PASSWORD = 'test-password-not-real';

const USERS = [
  {
    username: 'alpha.doctor',
    password: TEST_PASSWORD,
    fullName: 'Test Doctor Alpha',
    clinicId: CLINIC_ALPHA.clinicId,
    role: 'doctor',
  },
  {
    username: 'beta.nurse',
    password: TEST_PASSWORD,
    fullName: 'Test Nurse Beta',
    clinicId: CLINIC_BETA.clinicId,
    role: 'nurse',
  },
  {
    username: 'closed.admin',
    password: TEST_PASSWORD,
    fullName: 'Test Admin Closed',
    clinicId: CLINIC_CLOSED.clinicId,
    role: 'admin',
  },
];

module.exports = { CLINIC_ALPHA, CLINIC_BETA, CLINIC_CLOSED, TEST_PASSWORD, USERS };
