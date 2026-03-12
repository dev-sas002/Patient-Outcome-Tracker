const { configureEnv, dropAll } = require('./helpers/testEnv');

const NAMESPACE = 'listindex';
configureEnv(NAMESPACE);

const mongoose = require('mongoose');
const { getClinicConnection, getClinicOutcomeModel, closeAll } = require('../src/tenancy/connectionPool');
const { outcomeFixture } = require('./helpers/fixtures');

const CLINIC = 'test-clinic-alpha';
let Outcome;

function stagesOf(plan) {
  const stages = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.stage) stages.push(node.stage);
    ['inputStage', 'queryPlan'].forEach((key) => walk(node[key]));
    (node.inputStages || []).forEach(walk);
  };
  walk(plan.queryPlanner.winningPlan);
  return stages;
}

beforeAll(async () => {
  Outcome = getClinicOutcomeModel(await getClinicConnection(CLINIC, `${NAMESPACE}_alpha`));
  await Outcome.init();
  await Outcome.insertMany([0, 1, 2, 3].map((i) => outcomeFixture(CLINIC, i)));
});

afterAll(async () => {
  await closeAll();
  await mongoose.connect(process.env.MONGODB_REGISTRY_URI);
  await dropAll(NAMESPACE);
  await mongoose.disconnect();
});

describe('the record listing is served from an index', () => {
  it.each([
    ['unfiltered', {}],
    ['filtered by outcome', { outcome: 'declined' }],
  ])('%s listing needs no in-memory sort', async (_label, filter) => {
    const plan = await Outcome.find(filter).sort({ recordedAt: -1, _id: -1 }).limit(10).explain();
    const stages = stagesOf(Array.isArray(plan) ? plan[0] : plan);

    expect(stages).toContain('IXSCAN');
    expect(stages).not.toContain('SORT');
  });
});
