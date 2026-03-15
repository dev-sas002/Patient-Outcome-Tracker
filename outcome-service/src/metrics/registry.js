'use strict';

const fs = require('fs');
const { BUILT_IN_DEFINITIONS } = require('./definitions');
const { BadRequestError } = require('../http/errors');

const DIRECTIONS = Object.freeze(['higher-is-better', 'lower-is-better']);

/**
 * The extensibility seam.
 *
 * Which outcome measures exist is configuration, not schema. A record stores
 * `measures` as an open map of metric id -> number; this registry is the only
 * thing that decides which ids are legal, what range each one accepts and which
 * direction counts as improvement. Adding a measure therefore touches one list
 * (or one JSON file) and nothing else - no Mongoose field, no migration across
 * N clinic databases, no frontend change beyond rendering what the registry
 * reports through `GET /api/outcomes/metrics`.
 */

function assertDefinition(definition, source) {
  const { id, label, min, max, direction } = definition || {};
  if (!id || typeof id !== 'string' || !/^[a-z0-9_]+$/.test(id)) {
    throw new Error(`${source}: metric id must be lowercase snake_case, got ${JSON.stringify(id)}`);
  }
  if (!label || typeof label !== 'string') {
    throw new Error(`${source}: metric "${id}" needs a label`);
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
    throw new Error(`${source}: metric "${id}" needs a numeric min below its max`);
  }
  if (!DIRECTIONS.includes(direction)) {
    throw new Error(`${source}: metric "${id}" direction must be one of ${DIRECTIONS.join(', ')}`);
  }
}

function readDefinitionsFile(path) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`Could not read metric definitions from ${path}: ${error.message}`);
  }
  const list = Array.isArray(parsed) ? parsed : parsed && parsed.metrics;
  if (!Array.isArray(list)) {
    throw new Error(`${path} must contain an array of metric definitions, or { "metrics": [...] }`);
  }
  return list;
}

/**
 * @param {object}   [options]
 * @param {object[]} [options.definitions]      replaces the built-in list entirely
 * @param {object[]} [options.extraDefinitions] merged over the built-in list
 * @param {string}   [options.definitionsPath]  JSON file merged over the built-in list
 */
function createMetricRegistry(options = {}) {
  const { definitions, extraDefinitions = [], definitionsPath = null } = options;

  const merged = new Map();
  const base = definitions || BUILT_IN_DEFINITIONS;
  base.forEach((definition) => {
    assertDefinition(definition, 'built-in metrics');
    merged.set(definition.id, Object.freeze({ short: definition.label, ...definition, source: 'built-in' }));
  });

  const fromFile = definitionsPath ? readDefinitionsFile(definitionsPath) : [];
  [...fromFile, ...extraDefinitions].forEach((definition) => {
    assertDefinition(definition, definitionsPath || 'extra metrics');
    merged.set(definition.id, Object.freeze({ short: definition.label, ...definition, source: 'configured' }));
  });

  const byId = Object.freeze(Object.fromEntries(merged));
  const all = Object.freeze([...merged.values()]);

  function list() {
    return all;
  }

  function get(id) {
    return byId[id] || null;
  }

  function has(id) {
    return Boolean(byId[id]);
  }

  /**
   * Validate a submitted `measures` map against the registry.
   *
   * Returns a plain object safe to persist, or throws a BadRequestError naming
   * the offending metric id. It never echoes the submitted value back, because
   * a measure is clinical data about one patient.
   */
  function validateMeasures(measures) {
    if (measures === undefined || measures === null) return undefined;
    if (typeof measures !== 'object' || Array.isArray(measures)) {
      throw new BadRequestError('measures must be an object of metricId -> number', 'measures_shape');
    }

    const entries = Object.entries(measures);
    if (entries.length === 0) return undefined;

    const validated = {};
    for (const [id, rawValue] of entries) {
      const definition = byId[id];
      if (!definition) {
        throw new BadRequestError(`Unknown outcome measure "${id}"`, 'measure_unknown');
      }
      const value = typeof rawValue === 'string' ? Number(rawValue) : rawValue;
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new BadRequestError(`Measure "${id}" must be a finite number`, 'measure_not_numeric');
      }
      if (value < definition.min || value > definition.max) {
        throw new BadRequestError(
          `Measure "${id}" must be between ${definition.min} and ${definition.max} ${definition.unit || ''}`.trim(),
          'measure_out_of_range'
        );
      }
      validated[id] = value;
    }
    return validated;
  }

  /** Did this measure move the right way? Direction-aware, so no caller guesses. */
  function isImprovement(id, from, to) {
    const definition = byId[id];
    if (!definition || !Number.isFinite(from) || !Number.isFinite(to)) return null;
    if (from === to) return false;
    return definition.direction === 'higher-is-better' ? to > from : to < from;
  }

  return { list, get, has, validateMeasures, isImprovement, DIRECTIONS };
}

module.exports = { createMetricRegistry, DIRECTIONS, BUILT_IN_DEFINITIONS };
