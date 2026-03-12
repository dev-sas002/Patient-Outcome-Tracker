'use strict';

/**
 * Structural multi-tenancy.
 *
 * Guarding each route that touches patient data works only for as long as every
 * future route remembers to do it. This plugin moves the guarantee down to the
 * model: a model built with it cannot express a query, aggregation or write
 * that reaches outside the clinic it was bound to.
 *
 *   - read/update/delete queries get `clinicId` injected into the filter, so a
 *     forgotten scope is not an unscoped query, it is a correctly scoped one;
 *   - a filter or update that names a *different* clinic throws instead of
 *     silently returning nothing, because that is a bug, not an empty result;
 *   - aggregations get a `$match` on `clinicId` prepended as stage zero;
 *   - writes must carry the bound clinic (a missing value is left to the
 *     schema's own `required` validation);
 *   - the two model APIs that bypass query middleware entirely are blocked.
 *
 * The plugin needs a clinic id, and the only code that supplies one is the
 * connection pool, which gets it from the authenticated request. There is no
 * way to compile a tenant model without saying which tenant it is for.
 */

class TenantScopeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TenantScopeError';
  }
}

// Every query method that accepts a filter. `estimatedDocumentCount` is absent
// on purpose: it counts a whole collection and takes no filter, so it cannot be
// scoped - it is blocked below instead.
const SCOPED_QUERY_HOOKS = [
  'countDocuments',
  'deleteMany',
  'deleteOne',
  'distinct',
  'find',
  'findOne',
  'findOneAndDelete',
  'findOneAndReplace',
  'findOneAndUpdate',
  'replaceOne',
  'updateMany',
  'updateOne',
];

// Model APIs that skip query middleware and therefore cannot be scoped.
const BLOCKED_STATICS = ['estimatedDocumentCount', 'bulkWrite'];

function assertSameTenant(value, clinicId, what) {
  if (value === undefined || value === null) return;
  if (value !== clinicId) {
    throw new TenantScopeError(
      `${what} is bound to clinic "${clinicId}" and cannot address another clinic`
    );
  }
}

function tenantScope(schema, options = {}) {
  const { clinicId, field = 'clinicId' } = options;
  if (!clinicId || typeof clinicId !== 'string') {
    throw new TenantScopeError('tenantScope requires a clinicId');
  }

  schema.pre(SCOPED_QUERY_HOOKS, function scopeQueryFilter() {
    const filter = this.getFilter();
    assertSameTenant(filter[field], clinicId, 'This query');

    const update = typeof this.getUpdate === 'function' ? this.getUpdate() : null;
    if (update && !Array.isArray(update)) {
      assertSameTenant(update[field], clinicId, 'This update');
      assertSameTenant(update.$set && update.$set[field], clinicId, 'This update');
    }

    this.setQuery({ ...filter, [field]: clinicId });
  });

  schema.pre('aggregate', function scopeAggregation() {
    const pipeline = this.pipeline();
    const first = pipeline[0];
    if (first && first.$match) {
      assertSameTenant(first.$match[field], clinicId, 'This aggregation');
    }
    pipeline.unshift({ $match: { [field]: clinicId } });
  });

  schema.pre('save', function scopeSave() {
    // A missing value is deliberately left alone: the schema marks the field
    // required, so an unscoped document is rejected by validation with the
    // error a developer expects.
    assertSameTenant(this[field], clinicId, 'This document');
  });

  schema.pre('insertMany', function scopeInsertMany(next, docs) {
    const list = Array.isArray(docs) ? docs : [docs];
    try {
      for (const doc of list) {
        assertSameTenant(doc && doc[field], clinicId, 'This document');
      }
    } catch (error) {
      return next(error);
    }
    return next();
  });

  for (const name of BLOCKED_STATICS) {
    schema.statics[name] = function blocked() {
      throw new TenantScopeError(
        `${name}() bypasses tenant scoping and is disabled on clinic-bound models`
      );
    };
  }

  schema.statics.boundClinicId = function boundClinicId() {
    return clinicId;
  };
}

module.exports = { tenantScope, TenantScopeError, SCOPED_QUERY_HOOKS, BLOCKED_STATICS };
