'use strict';

/**
 * Built-in outcome measure definitions.
 *
 * A "measure" is a numeric instrument a clinic records alongside the coarse
 * improved/stable/declined judgement - a PHQ-9 score, a six-minute walk
 * distance, a pain rating. Each one lives here as data, never as a schema
 * field, so adding one is an entry in this list (or in the JSON file named by
 * `METRIC_DEFINITIONS_PATH`) rather than a migration fanned out across every
 * clinic database.
 *
 * `direction` says which way is good. Nothing else in the service is allowed to
 * assume "up is better", because for half of these it is not. `short` is the
 * abbreviation a dense table uses; clients read it from the registry rather
 * than truncating the label themselves.
 */
const BUILT_IN_DEFINITIONS = [
  {
    id: 'phq9',
    short: 'PHQ-9',
    label: 'PHQ-9 depression score',
    unit: 'points',
    min: 0,
    max: 27,
    direction: 'lower-is-better',
    description: 'Nine-item depression severity questionnaire. 0-4 minimal, 20-27 severe.',
  },
  {
    id: 'gad7',
    short: 'GAD-7',
    label: 'GAD-7 anxiety score',
    unit: 'points',
    min: 0,
    max: 21,
    direction: 'lower-is-better',
    description: 'Seven-item generalised anxiety severity questionnaire.',
  },
  {
    id: 'pain_nrs',
    short: 'Pain',
    label: 'Pain rating',
    unit: '0-10 scale',
    min: 0,
    max: 10,
    direction: 'lower-is-better',
    description: 'Numeric rating scale for self-reported pain.',
  },
  {
    id: 'hba1c',
    short: 'HbA1c',
    label: 'HbA1c',
    unit: '%',
    min: 3,
    max: 20,
    direction: 'lower-is-better',
    description: 'Glycated haemoglobin, a three-month average of blood glucose.',
  },
  {
    id: 'systolic_bp',
    short: 'Systolic',
    label: 'Systolic blood pressure',
    unit: 'mmHg',
    min: 50,
    max: 260,
    direction: 'lower-is-better',
    description: 'Upper figure of a seated blood pressure reading.',
  },
  {
    id: 'walk_6min',
    short: '6MWD',
    label: 'Six-minute walk distance',
    unit: 'metres',
    min: 0,
    max: 1000,
    direction: 'higher-is-better',
    description: 'Distance covered on a flat course in six minutes.',
  },
  {
    id: 'fev1_pct',
    short: 'FEV1',
    label: 'FEV1 (percent predicted)',
    unit: '% predicted',
    min: 0,
    max: 200,
    direction: 'higher-is-better',
    description: 'Forced expiratory volume in one second, against the predicted value.',
  },
];

module.exports = { BUILT_IN_DEFINITIONS };
