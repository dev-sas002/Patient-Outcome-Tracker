'use strict';

const { summariseBriefing } = require('./narrative');

/**
 * Outcome-summary providers.
 *
 * The seam is one method - `summarise(briefing)` - so swapping model vendors,
 * or dropping the model entirely, is a constructor choice rather than a change
 * anywhere in the routes or the service layer.
 *
 * Two implementations ship:
 *
 *   computed  - no network, no key, always available. Reads the briefing and
 *               writes the same summary a spreadsheet would.
 *   anthropic - Claude, used only when ANTHROPIC_API_KEY is set. It is given
 *               the briefing as JSON and nothing else; see `ai/briefing.js` for
 *               why that matters.
 *
 * Every anthropic failure - no key, a timeout, a rate limit, a policy refusal -
 * degrades to the computed provider rather than to an error. The response says
 * which provider actually answered, so a clinician is never left guessing.
 */

const SYSTEM_PROMPT = [
  'You are summarising aggregate clinical-outcome statistics for one clinic, for a clinician who already knows their patients.',
  '',
  'This is decision support, not diagnosis. You must not:',
  '- diagnose, or suggest a diagnosis, for any patient;',
  '- recommend, start, stop or change a treatment or medication;',
  '- describe or infer anything about an individual patient.',
  '',
  'You are given counts and averages only. You have not seen a patient record and must not imply that you have.',
  '',
  'Write for a busy clinician: what the numbers show, what changed over the window, and which groups are worth a closer look.',
  'Every observation must be traceable to a number in the briefing - quote the figure. If the data is too thin to support a statement, say so instead of hedging into vagueness.',
  'Do not speculate about causes. Correlation in a clinic-level count is not a mechanism.',
].join('\n');

const RESPONSE_SHAPE = [
  'Reply as JSON only, with no surrounding prose or code fences:',
  '{"headline": "<= 80 characters", "points": ["3 to 5 short observations, each citing a figure"]}',
].join('\n');

/** The always-available provider. No key, no network, no failure mode. */
function createComputedProvider() {
  return {
    name: 'computed',
    available: true,
    async summarise(briefing) {
      return { ...summariseBriefing(briefing), provider: 'computed' };
    },
  };
}

function parseSummary(text) {
  // The model is asked for bare JSON, but a stray fence is cheap to survive.
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const parsed = JSON.parse(cleaned);
  const points = Array.isArray(parsed.points) ? parsed.points.filter((p) => typeof p === 'string') : [];
  if (typeof parsed.headline !== 'string' || points.length === 0) {
    throw new Error('summary JSON did not contain a headline and points');
  }
  return { headline: parsed.headline.slice(0, 120), points: points.slice(0, 6) };
}

/**
 * @param {object} aiConfig  `config.ai`
 * @param {object} [deps]
 * @param {Function} [deps.createClient] injected in tests so no suite ever
 *                                       reaches the network or spends money.
 */
function createAnthropicProvider(aiConfig, deps = {}) {
  const { createClient, logger = console } = deps;
  const fallback = createComputedProvider();

  let client = null;
  function getClient() {
    if (client) return client;
    if (createClient) {
      client = createClient(aiConfig);
      return client;
    }
    // Required lazily so the service starts, and the tests run, on a machine
    // where the optional SDK is not installed.
    const Anthropic = require('@anthropic-ai/sdk');
    client = new Anthropic({ apiKey: aiConfig.apiKey, timeout: aiConfig.timeoutMs });
    return client;
  }

  return {
    name: 'anthropic',
    available: true,
    async summarise(briefing) {
      try {
        const response = await getClient().beta.messages.create({
          model: aiConfig.model,
          max_tokens: aiConfig.maxTokens,
          // Server-side fallback: if the request is declined on policy grounds,
          // the API re-runs it on a fallback model inside the same call rather
          // than returning nothing.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          output_config: { effort: aiConfig.effort },
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: 'user',
              content: `${RESPONSE_SHAPE}\n\nBriefing:\n${JSON.stringify(briefing, null, 2)}`,
            },
          ],
        });

        if (response.stop_reason === 'refusal') {
          throw new Error('model declined the request');
        }

        const text = response.content
          .filter((block) => block.type === 'text')
          .map((block) => block.text)
          .join('')
          .trim();

        return { ...parseSummary(text), provider: 'anthropic', model: response.model };
      } catch (error) {
        // Never surface the provider error to the caller: it can carry request
        // context, and a clinician needs the numbers either way.
        logger.error('Outcome summary provider failed:', error.name, error.message);
        const computed = await fallback.summarise(briefing);
        return { ...computed, degradedFrom: 'anthropic', degradedReason: error.name };
      }
    },
  };
}

/** Picks a provider from configuration. No key configured means no AI path. */
function createSummaryProvider(aiConfig, deps = {}) {
  if (!aiConfig || !aiConfig.enabled) return createComputedProvider();
  return createAnthropicProvider(aiConfig, deps);
}

module.exports = {
  createSummaryProvider,
  createComputedProvider,
  createAnthropicProvider,
  parseSummary,
  SYSTEM_PROMPT,
};
