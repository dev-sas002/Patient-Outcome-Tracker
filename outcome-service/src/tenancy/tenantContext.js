'use strict';

const { requireActiveClinic } = require('./clinicDirectory');
const { getClinicConnection, getClinicOutcomeModel } = require('./connectionPool');

/**
 * A tenant context is the only handle the rest of the service has on data. It
 * pairs a clinic identity with models that are already bound to that clinic, so
 * a caller cannot hold a model without also holding the tenant it belongs to.
 */
async function resolveTenantContext(clinicId) {
  if (!clinicId || typeof clinicId !== 'string') {
    throw new TypeError('resolveTenantContext requires a clinicId');
  }
  const clinic = await requireActiveClinic(clinicId);
  const connection = await getClinicConnection(clinic.clinicId, clinic.dbName);

  return Object.freeze({
    clinicId: clinic.clinicId,
    clinicName: clinic.name,
    models: Object.freeze({ Outcome: getClinicOutcomeModel(connection) }),
  });
}

module.exports = { resolveTenantContext };
