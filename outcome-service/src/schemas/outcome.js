'use strict';

const mongoose = require('mongoose');
const { tenantScope } = require('../tenancy/tenantScope');

const OUTCOME_VALUES = Object.freeze(['improved', 'stable', 'declined']);

/**
 * The outcome record as stored inside a single clinic's database.
 *
 * `measures` is deliberately an open map of metric id -> number rather than a
 * column per measure. Which measures a clinic captures is configuration (see
 * `src/metrics`), so adding PHQ-9 or a six-minute walk distance is a registry
 * entry, not a schema migration fanned out across every clinic database.
 */
function getOutcomeSchema() {
  const outcomeSchema = new mongoose.Schema(
    {
      // No single-field index: every query is clinic-scoped, so the compound
      // indexes below already cover lookups by clinic as their prefix.
      clinicId: {
        type: String,
        required: true,
      },
      patientName: {
        type: String,
        required: true,
        trim: true,
      },
      age: {
        type: Number,
        min: 0,
        max: 150,
      },
      diagnosis: {
        type: String,
        required: true,
        trim: true,
      },
      treatment: {
        type: String,
        required: true,
        trim: true,
      },
      outcome: {
        type: String,
        required: true,
        enum: OUTCOME_VALUES,
      },
      // When the outcome was observed, which is not the same thing as when
      // somebody typed it in. Trends are bucketed by this.
      recordedAt: {
        type: Date,
        required: true,
        default: Date.now,
      },
      // metric id -> value, validated against the metric registry before write.
      measures: {
        type: Map,
        of: Number,
        default: undefined,
      },
      notes: {
        type: String,
        trim: true,
        default: '',
      },
      createdBy: {
        type: String,
        required: true,
      },
    },
    { timestamps: true }
  );

  // Listing is "this clinic, newest observation first"; the filtered listing
  // adds an equality match on `outcome` before the sort, so it needs its own
  // compound index to avoid an in-memory sort.
  outcomeSchema.index({ clinicId: 1, recordedAt: -1 });
  outcomeSchema.index({ clinicId: 1, outcome: 1, recordedAt: -1 });
  outcomeSchema.index({ clinicId: 1, createdAt: -1 });

  return outcomeSchema;
}

/**
 * The only schema a model should ever be compiled from at runtime: the base
 * schema plus the tenant-scope plugin bound to one clinic.
 */
function getTenantOutcomeSchema(clinicId) {
  const schema = getOutcomeSchema();
  schema.plugin(tenantScope, { clinicId });
  return schema;
}

module.exports = { getOutcomeSchema, getTenantOutcomeSchema, OUTCOME_VALUES };
