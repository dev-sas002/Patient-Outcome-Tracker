'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const { config, missingEnv } = require('./config');
const Clinic = require('./models/Clinic');
const { getTenantOutcomeSchema } = require('./schemas/outcome');

/**
 * Demo data.
 *
 * Everything generated here is synthetic and deliberately looks it: patient
 * names are "Demo Patient <tree>", and no value is derived from a real record.
 * The generator is seeded, so the same dashboard comes up on every machine and
 * a screenshot stays reproducible.
 *
 * The shape matters more than the volume: records are spread across the last
 * twelve months, with measures attached, so the trend chart and the cohort
 * breakdown have something real to draw instead of a single spike at "today".
 */

const SURNAMES = [
  'Alder', 'Birch', 'Cedar', 'Dogwood', 'Elm', 'Fir', 'Ginkgo', 'Hawthorn',
  'Ilex', 'Juniper', 'Katsura', 'Linden', 'Maple', 'Nyssa', 'Oak', 'Poplar',
  'Quince', 'Rowan', 'Spruce', 'Tupelo', 'Umbra', 'Viburnum', 'Willow', 'Yew',
];

/** Each condition carries the measure a clinic would actually track for it. */
const CONDITIONS = [
  {
    diagnosis: 'Type 2 Diabetes',
    treatment: 'Metformin plus structured dietary review',
    metricId: 'hba1c',
    start: [7.4, 9.1],
    improvedDelta: [-1.6, -0.6],
    declinedDelta: [0.3, 1.1],
    weights: { improved: 0.55, stable: 0.3, declined: 0.15 },
  },
  {
    diagnosis: 'Hypertension',
    treatment: 'ACE inhibitor with lifestyle review',
    metricId: 'systolic_bp',
    start: [148, 172],
    improvedDelta: [-26, -10],
    declinedDelta: [4, 14],
    weights: { improved: 0.5, stable: 0.38, declined: 0.12 },
  },
  {
    diagnosis: 'Chronic Lower Back Pain',
    treatment: 'Physiotherapy programme with graded activity',
    metricId: 'pain_nrs',
    start: [6, 9],
    improvedDelta: [-4, -2],
    declinedDelta: [1, 2],
    weights: { improved: 0.46, stable: 0.34, declined: 0.2 },
  },
  {
    diagnosis: 'Generalised Anxiety Disorder',
    treatment: 'CBT course with review at six weeks',
    metricId: 'gad7',
    start: [12, 19],
    improvedDelta: [-9, -4],
    declinedDelta: [1, 4],
    weights: { improved: 0.58, stable: 0.28, declined: 0.14 },
  },
  {
    diagnosis: 'Major Depressive Disorder',
    treatment: 'Talking therapy with medication review',
    metricId: 'phq9',
    start: [14, 22],
    improvedDelta: [-10, -4],
    declinedDelta: [1, 5],
    weights: { improved: 0.5, stable: 0.3, declined: 0.2 },
  },
  {
    diagnosis: 'COPD',
    treatment: 'Inhaled bronchodilator with pulmonary rehabilitation',
    metricId: 'walk_6min',
    start: [210, 330],
    improvedDelta: [30, 90],
    declinedDelta: [-70, -20],
    weights: { improved: 0.34, stable: 0.36, declined: 0.3 },
  },
  {
    diagnosis: 'Asthma',
    treatment: 'Inhaler technique review and stepped preventer therapy',
    metricId: 'fev1_pct',
    start: [58, 74],
    improvedDelta: [6, 18],
    declinedDelta: [-12, -3],
    weights: { improved: 0.52, stable: 0.34, declined: 0.14 },
  },
  {
    diagnosis: 'Osteoarthritis (knee)',
    treatment: 'Strengthening programme with analgesia review',
    metricId: 'pain_nrs',
    start: [5, 8],
    improvedDelta: [-3, -1],
    declinedDelta: [1, 2],
    weights: { improved: 0.38, stable: 0.44, declined: 0.18 },
  },
];

const CLINIC_PLANS = {
  'clinic-sunrise': { records: 74, authors: ['dr.smith', 'nurse.jones'], seed: 20260101 },
  'clinic-bayview': { records: 61, authors: ['dr.chen', 'admin.lee'], seed: 20260202 },
};

/** Small deterministic PRNG - the same seed gives the same demo clinic. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted(random, weights) {
  const roll = random();
  let cumulative = 0;
  for (const [value, weight] of Object.entries(weights)) {
    cumulative += weight;
    if (roll < cumulative) return value;
  }
  return 'stable';
}

function between(random, [lo, hi], decimals = 0) {
  const value = lo + random() * (hi - lo);
  return Number(value.toFixed(decimals));
}

function buildRecords(clinicId, now) {
  const plan = CLINIC_PLANS[clinicId] || { records: 40, authors: ['clinic.user'], seed: 1 };
  const random = mulberry32(plan.seed);
  const records = [];

  for (let i = 0; i < plan.records; i += 1) {
    const condition = CONDITIONS[Math.floor(random() * CONDITIONS.length)];
    const outcome = pickWeighted(random, condition.weights);

    // Spread across the last 11 months, weighted slightly toward recent months
    // so the chart shows a clinic that is getting busier rather than a flat bar.
    const monthsAgo = Math.floor(Math.pow(random(), 1.35) * 11);
    const recordedAt = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1 + Math.floor(random() * 27), 9)
    );

    const decimals = condition.metricId === 'hba1c' ? 1 : 0;
    const start = between(random, condition.start, decimals);
    const delta =
      outcome === 'improved'
        ? between(random, condition.improvedDelta, decimals)
        : outcome === 'declined'
          ? between(random, condition.declinedDelta, decimals)
          : between(random, [-0.4, 0.4], decimals);

    records.push({
      clinicId,
      patientName: `Demo Patient ${SURNAMES[i % SURNAMES.length]}${i >= SURNAMES.length ? ` ${Math.floor(i / SURNAMES.length) + 1}` : ''}`,
      age: 22 + Math.floor(random() * 58),
      diagnosis: condition.diagnosis,
      treatment: condition.treatment,
      outcome,
      recordedAt,
      measures: { [condition.metricId]: Number((start + delta).toFixed(decimals)) },
      notes: `Synthetic demo record. Reviewed at ${monthsAgo === 0 ? 'this month' : `${monthsAgo} month(s) ago`}.`,
      createdBy: plan.authors[i % plan.authors.length],
    });
  }

  return records.sort((a, b) => a.recordedAt - b.recordedAt);
}

async function seed() {
  const missing = missingEnv();
  if (missing.length > 0) {
    console.error(`Outcome seed: missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }

  const connections = [];
  try {
    await mongoose.connect(config.registryUri);
    console.log('Connected to registry database');

    const clinics = await Clinic.find({});
    if (clinics.length === 0) {
      console.error('No clinics found in registry. Run the auth-service seed first.');
      process.exit(1);
    }

    const now = new Date();
    for (const clinic of clinics) {
      const conn = mongoose.createConnection(`${config.baseUri}/${clinic.dbName}`);
      connections.push(conn);
      await conn.asPromise();

      // Compiled through the tenant-bound schema, exactly like the running
      // service does, so the seed cannot write outside the clinic it is on.
      const Outcome = conn.model('Outcome', getTenantOutcomeSchema(clinic.clinicId));
      await Outcome.syncIndexes();
      await Outcome.deleteMany({});

      const records = buildRecords(clinic.clinicId, now);
      await Outcome.insertMany(records);
      console.log(`  ${clinic.name} (${clinic.dbName}): seeded ${records.length} outcomes`);
    }

    console.log('\n--- Outcome seed complete (all records are synthetic) ---');
  } catch (error) {
    console.error('Outcome seed error:', error.name, error.message);
    process.exitCode = 1;
  } finally {
    for (const conn of connections) await conn.close().catch(() => {});
    await mongoose.disconnect().catch(() => {});
  }
}

if (require.main === module) seed();

module.exports = { buildRecords, CONDITIONS, CLINIC_PLANS };
