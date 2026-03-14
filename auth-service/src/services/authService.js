'use strict';

const jwt = require('jsonwebtoken');
const Clinic = require('../models/Clinic');
const UserRegistry = require('../models/UserRegistry');
const { getClinicConnection, getClinicUserModel } = require('../tenancy/connectionPool');
const {
  InvalidCredentialsError,
  InvalidTokenError,
  ClinicInactiveError,
} = require('../http/errors');

/**
 * Authentication logic, expressed without Express.
 *
 * Nothing here reads `req`, writes `res`, or picks a status code - it throws
 * typed errors and returns plain objects. That is what lets the login flow be
 * reasoned about (and tested) as "which of these three lookups failed" rather
 * than as a 120-line route handler.
 *
 * The shape of the flow is dictated by the per-clinic database design: a
 * username alone does not say which database holds the password hash, so the
 * registry is consulted first purely as a routing table.
 */
function createAuthService(dependencies = {}) {
  const {
    config,
    clinicModel = Clinic,
    registryModel = UserRegistry,
    connect = getClinicConnection,
    userModelFor = getClinicUserModel,
  } = dependencies;

  async function requireActiveClinic(clinicId) {
    const clinic = await clinicModel.findOne({ clinicId });
    if (!clinic || !clinic.isActive) throw new ClinicInactiveError();
    return clinic;
  }

  async function clinicUserModel(clinic) {
    return userModelFor(await connect(clinic.clinicId, clinic.dbName));
  }

  function issueToken(user, clinic) {
    return jwt.sign(
      {
        userId: user._id,
        username: user.username,
        clinicId: clinic.clinicId,
        role: user.role,
      },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn }
    );
  }

  /**
   * The user as a client is allowed to see them. Built by hand rather than by
   * deleting fields from the document, so a field added to the schema later is
   * not exposed by accident - and `password` can never be one of them.
   */
  function publicUser(user, clinic, { includeClinicId = false } = {}) {
    return {
      id: user._id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      ...(includeClinicId ? { clinicId: clinic.clinicId } : {}),
      clinicName: clinic.name,
    };
  }

  async function login(username, password) {
    const normalised = String(username).toLowerCase();

    // The registry is a routing table only: it maps a username to the clinic
    // whose database holds the password hash. It stores no credential.
    const route = await registryModel.findOne({ username: normalised });
    // A missing route and a wrong password are the same error on purpose, so
    // the endpoint cannot be used to enumerate usernames.
    if (!route) throw new InvalidCredentialsError();

    const clinic = await requireActiveClinic(route.clinicId);
    const User = await clinicUserModel(clinic);

    const user = await User.findOne({ username: normalised });
    if (!user) throw new InvalidCredentialsError();
    if (!(await user.comparePassword(password))) throw new InvalidCredentialsError();

    return { token: issueToken(user, clinic), user: publicUser(user, clinic) };
  }

  async function listClinics() {
    // Database names are deliberately not selected: the login screen needs a
    // label, not the physical layout of the tenancy.
    return clinicModel.find({}).select('name clinicId').sort({ name: 1 }).lean();
  }

  async function verify(token) {
    let decoded;
    try {
      decoded = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    } catch (error) {
      // Only token problems are a 401. A registry or clinic-database failure is
      // a server fault and must not be reported to the caller as bad credentials.
      if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.NotBeforeError) {
        throw new InvalidTokenError();
      }
      throw error;
    }

    // An unscoped token would turn the lookups below into "first clinic wins"
    // and "first user wins" queries, so require the claims this service issues.
    if (!decoded.clinicId || !decoded.userId) throw new InvalidTokenError();

    const clinic = await clinicModel.findOne({ clinicId: decoded.clinicId });
    if (!clinic) throw new InvalidTokenError('Clinic not found');
    // Login blocks deactivated clinics, but tokens issued before a deactivation
    // stay valid until they expire, so this is re-checked on every request.
    if (!clinic.isActive) throw new ClinicInactiveError();

    const User = await clinicUserModel(clinic);
    const user = await User.findById(decoded.userId);
    if (!user) throw new InvalidTokenError('User not found');

    return { user: publicUser(user, clinic, { includeClinicId: true }) };
  }

  return { login, listClinics, verify };
}

module.exports = { createAuthService };
