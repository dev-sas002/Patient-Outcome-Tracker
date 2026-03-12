const { configureEnv } = require('./helpers/testEnv');

configureEnv('metrics');

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createMetricRegistry } = require('../src/metrics/registry');
const { BadRequestError } = require('../src/http/errors');

describe('the built-in registry', () => {
  const metrics = createMetricRegistry();

  it('exposes definitions rather than hardcoded fields', () => {
    expect(metrics.list().length).toBeGreaterThan(3);
    expect(metrics.get('phq9')).toMatchObject({ direction: 'lower-is-better', max: 27 });
    expect(metrics.get('not-a-metric')).toBeNull();
  });

  it('knows which direction counts as improvement for each measure', () => {
    // The point of storing direction: half of these get better going down.
    expect(metrics.isImprovement('phq9', 18, 6)).toBe(true);
    expect(metrics.isImprovement('phq9', 6, 18)).toBe(false);
    expect(metrics.isImprovement('walk_6min', 210, 320)).toBe(true);
    expect(metrics.isImprovement('walk_6min', 320, 210)).toBe(false);
    expect(metrics.isImprovement('unknown', 1, 2)).toBeNull();
  });
});

describe('measure validation', () => {
  const metrics = createMetricRegistry();

  it('accepts a known measure inside its range', () => {
    expect(metrics.validateMeasures({ phq9: 12 })).toEqual({ phq9: 12 });
  });

  it('coerces a numeric string, because a form posts strings', () => {
    expect(metrics.validateMeasures({ pain_nrs: '7' })).toEqual({ pain_nrs: 7 });
  });

  it('treats an absent or empty map as no measures', () => {
    expect(metrics.validateMeasures(undefined)).toBeUndefined();
    expect(metrics.validateMeasures(null)).toBeUndefined();
    expect(metrics.validateMeasures({})).toBeUndefined();
  });

  it.each([
    ['an unknown metric id', { made_up: 3 }, /Unknown outcome measure/],
    ['a non-numeric value', { phq9: 'severe' }, /finite number/],
    ['a value above the range', { phq9: 40 }, /between 0 and 27/],
    ['a value below the range', { phq9: -2 }, /between 0 and 27/],
    ['a non-object payload', ['phq9'], /must be an object/],
  ])('rejects %s', (_label, payload, pattern) => {
    expect(() => metrics.validateMeasures(payload)).toThrow(BadRequestError);
    expect(() => metrics.validateMeasures(payload)).toThrow(pattern);
  });

  it('never echoes the submitted value back in the error, because it is clinical data', () => {
    try {
      metrics.validateMeasures({ phq9: 26.5 });
      metrics.validateMeasures({ phq9: 99 });
    } catch (error) {
      expect(error.message).not.toMatch(/99/);
    }
    expect.assertions(1);
  });
});

describe('adding a measure is configuration, not a schema change', () => {
  it('accepts an extra definition passed in', () => {
    const metrics = createMetricRegistry({
      extraDefinitions: [
        {
          id: 'grip_strength',
          label: 'Grip strength',
          unit: 'kg',
          min: 0,
          max: 120,
          direction: 'higher-is-better',
        },
      ],
    });
    expect(metrics.has('grip_strength')).toBe(true);
    expect(metrics.validateMeasures({ grip_strength: 34 })).toEqual({ grip_strength: 34 });
    expect(metrics.get('grip_strength').source).toBe('configured');
  });

  it('loads definitions from a JSON file named by configuration', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'metrics-')), 'metrics.json');
    fs.writeFileSync(
      file,
      JSON.stringify({
        metrics: [
          {
            id: 'sleep_hours',
            label: 'Sleep duration',
            unit: 'hours',
            min: 0,
            max: 24,
            direction: 'higher-is-better',
          },
        ],
      })
    );

    const metrics = createMetricRegistry({ definitionsPath: file });
    expect(metrics.has('sleep_hours')).toBe(true);
    // The built-ins are still there; a file adds, it does not replace.
    expect(metrics.has('phq9')).toBe(true);
  });

  it.each([
    ['a missing id', { label: 'x', min: 0, max: 1, direction: 'higher-is-better' }],
    ['a bad id', { id: 'Not Snake', label: 'x', min: 0, max: 1, direction: 'higher-is-better' }],
    ['an inverted range', { id: 'x', label: 'x', min: 5, max: 1, direction: 'higher-is-better' }],
    ['an unknown direction', { id: 'x', label: 'x', min: 0, max: 1, direction: 'sideways' }],
  ])('refuses to start with %s', (_label, definition) => {
    expect(() => createMetricRegistry({ extraDefinitions: [definition] })).toThrow();
  });

  it('fails loudly when the configured file is unreadable', () => {
    expect(() => createMetricRegistry({ definitionsPath: '/no/such/metrics.json' })).toThrow(
      /Could not read metric definitions/
    );
  });
});
