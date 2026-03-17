const { configureEnv } = require('./helpers/testEnv');

configureEnv('aiprovider');

const {
  createSummaryProvider,
  createComputedProvider,
  createAnthropicProvider,
  parseSummary,
} = require('../src/ai/provider');
const { buildBriefing, assertAggregateOnly } = require('../src/ai/briefing');

const silentLogger = { log: () => {}, error: () => {} };

const STATS = { improved: 30, stable: 14, declined: 6, total: 50 };
const TREND = {
  windowMonths: 12,
  months: [
    { month: '2026-01', total: 20, improved: 12, stable: 6, declined: 2 },
    { month: '2026-02', total: 30, improved: 18, stable: 8, declined: 4 },
  ],
  measures: [
    {
      metricId: 'phq9',
      label: 'PHQ-9 depression score',
      unit: 'points',
      direction: 'lower-is-better',
      points: [
        { month: '2026-01', mean: 17, n: 9 },
        { month: '2026-02', mean: 11, n: 12 },
      ],
      change: { from: 17, to: 11, delta: -6, improving: true },
    },
  ],
};
const COHORTS = {
  minGroupSize: 5,
  suppressedGroups: 2,
  cohorts: [
    { diagnosis: 'Hypertension', total: 30, improved: 20, stable: 8, declined: 2, improvedRate: 0.667 },
    { diagnosis: 'COPD', total: 12, improved: 3, stable: 4, declined: 5, improvedRate: 0.25 },
  ],
};

const briefing = buildBriefing({ clinicName: 'Test Clinic', stats: STATS, trend: TREND, cohorts: COHORTS });

describe('the briefing handed to a model', () => {
  it('carries aggregates and no patient record', () => {
    const serialised = JSON.stringify(briefing);
    expect(serialised).not.toMatch(/patientName/);
    expect(serialised).not.toMatch(/notes/);
    expect(briefing.totals).toMatchObject({ records: 50, improved: 30 });
    expect(briefing.diagnosisCohorts).toHaveLength(2);
  });

  it('reports how many groups were suppressed, so the reader knows what is missing', () => {
    expect(briefing.suppression).toEqual({ minGroupSize: 5, suppressedGroups: 2 });
  });

  it('refuses to be built around a patient field', () => {
    // A guard, not a comment: widening the briefing later fails here rather
    // than quietly shipping PHI to a third-party API.
    expect(() => assertAggregateOnly({ rows: [{ patientName: 'x' }] })).toThrow(/patientName/);
    expect(() => assertAggregateOnly({ nested: { deep: { notes: 'x' } } })).toThrow(/notes/);
  });
});

describe('with no API key configured', () => {
  it('selects the computed provider', () => {
    expect(createSummaryProvider({ enabled: false }).name).toBe('computed');
    expect(createSummaryProvider(null).name).toBe('computed');
  });

  it('still returns a usable summary', async () => {
    const summary = await createComputedProvider().summarise(briefing);
    expect(summary.provider).toBe('computed');
    expect(summary.headline).toEqual(expect.any(String));
    expect(summary.points.length).toBeGreaterThan(1);
    expect(summary.points.join(' ')).toMatch(/50 recorded outcomes/);
  });

  it('describes an empty clinic without inventing a trend', async () => {
    const empty = buildBriefing({
      clinicName: 'Empty',
      stats: { improved: 0, stable: 0, declined: 0, total: 0 },
      trend: { windowMonths: 12, months: [], measures: [] },
      cohorts: { minGroupSize: 5, suppressedGroups: 0, cohorts: [] },
    });
    const summary = await createComputedProvider().summarise(empty);
    expect(summary.headline).toMatch(/no outcome records/i);
  });

  it('reads a measure in the direction the registry says is better', async () => {
    const summary = await createComputedProvider().summarise(briefing);
    expect(summary.points.join(' ')).toMatch(/PHQ-9 .* moved in the expected direction/);
  });
});

describe('with a key configured', () => {
  function providerWith(createMessage) {
    return createAnthropicProvider(
      { apiKey: 'test-key-not-real', model: 'claude-opus-5', maxTokens: 1000, effort: 'low', timeoutMs: 1000 },
      {
        logger: silentLogger,
        // No suite ever reaches the network or spends money: the client is
        // injected, and the real SDK is never constructed.
        createClient: () => ({ beta: { messages: { create: createMessage } } }),
      }
    );
  }

  it('sends only the briefing, never a record', async () => {
    let captured = null;
    const provider = providerWith(async (payload) => {
      captured = payload;
      return {
        stop_reason: 'end_turn',
        model: 'claude-opus-5',
        content: [{ type: 'text', text: '{"headline":"Improving","points":["30 of 50 improved"]}' }],
      };
    });

    const summary = await provider.summarise(briefing);
    expect(summary).toMatchObject({ provider: 'anthropic', headline: 'Improving' });

    const sent = JSON.stringify(captured.messages);
    expect(sent).not.toMatch(/patientName/);
    expect(sent).toMatch(/diagnosisCohorts/);
    expect(captured.system).toMatch(/decision support, not diagnosis/i);
    expect(captured.system).toMatch(/must not/i);
  });

  it('falls back to the computed summary when the call fails', async () => {
    const provider = providerWith(async () => {
      throw Object.assign(new Error('rate limited'), { name: 'RateLimitError' });
    });

    const summary = await provider.summarise(briefing);
    expect(summary.provider).toBe('computed');
    expect(summary.degradedFrom).toBe('anthropic');
    expect(summary.degradedReason).toBe('RateLimitError');
    expect(summary.points.length).toBeGreaterThan(1);
  });

  it('falls back when the model declines the request', async () => {
    const provider = providerWith(async () => ({ stop_reason: 'refusal', content: [] }));
    const summary = await provider.summarise(briefing);
    expect(summary.provider).toBe('computed');
  });

  it('falls back when the reply is not the requested shape', async () => {
    const provider = providerWith(async () => ({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Sorry, here is some prose instead.' }],
    }));
    const summary = await provider.summarise(briefing);
    expect(summary.provider).toBe('computed');
  });
});

describe('parsing a model reply', () => {
  it('accepts bare JSON', () => {
    expect(parseSummary('{"headline":"H","points":["a","b"]}')).toEqual({
      headline: 'H',
      points: ['a', 'b'],
    });
  });

  it('survives a code fence', () => {
    expect(parseSummary('```json\n{"headline":"H","points":["a"]}\n```').headline).toBe('H');
  });

  it.each([
    ['prose', 'not json at all'],
    ['no points', '{"headline":"H","points":[]}'],
    ['no headline', '{"points":["a"]}'],
  ])('rejects %s', (_label, text) => {
    expect(() => parseSummary(text)).toThrow();
  });
});
