'use strict';

const express = require('express');
const { body } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { asyncHandler } = require('../http/asyncHandler');
const { OUTCOME_VALUES } = require('../schemas/outcome');

/**
 * HTTP surface only.
 *
 * Each handler resolves the caller's clinic from the verified token, calls one
 * service method and picks a status code. There is no query building, no
 * connection handling and no try/catch here: errors go to the central handler
 * in `app.js`, which is the only place that decides what a client is told.
 */
function createOutcomeRouter({ outcomeService }) {
  const router = express.Router();

  router.use(authenticate);

  const createValidation = [
    body('patientName')
      .trim()
      .notEmpty()
      .withMessage('Patient name is required')
      .isLength({ max: 200 })
      .withMessage('Patient name must be 200 characters or fewer'),
    body('age').optional().isInt({ min: 0, max: 150 }).withMessage('Age must be between 0 and 150'),
    body('diagnosis')
      .trim()
      .notEmpty()
      .withMessage('Diagnosis is required')
      .isLength({ max: 500 })
      .withMessage('Diagnosis must be 500 characters or fewer'),
    body('treatment')
      .trim()
      .notEmpty()
      .withMessage('Treatment is required')
      .isLength({ max: 1000 })
      .withMessage('Treatment must be 1000 characters or fewer'),
    body('outcome')
      .isIn(OUTCOME_VALUES)
      .withMessage('Outcome must be improved, stable, or declined'),
    body('recordedAt')
      .optional()
      .isISO8601()
      .withMessage('recordedAt must be an ISO 8601 date'),
    body('notes')
      .optional()
      .trim()
      .isLength({ max: 5000 })
      .withMessage('Notes must be 5000 characters or fewer'),
  ];

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const data = await outcomeService.listOutcomes(req.user.clinicId, req.query);
      res.json({ success: true, data });
    })
  );

  router.post(
    '/',
    createValidation,
    validate,
    asyncHandler(async (req, res) => {
      const created = await outcomeService.createOutcome(req.user.clinicId, req.body, req.user);
      res.status(201).json({ success: true, message: 'Outcome created successfully', data: created });
    })
  );

  router.get(
    '/stats',
    asyncHandler(async (req, res) => {
      const data = await outcomeService.getStats(req.user.clinicId);
      res.json({ success: true, data });
    })
  );

  router.get(
    '/trends',
    asyncHandler(async (req, res) => {
      const data = await outcomeService.getTrends(req.user.clinicId, req.query);
      res.json({ success: true, data });
    })
  );

  router.get(
    '/cohorts',
    asyncHandler(async (req, res) => {
      const data = await outcomeService.getCohorts(req.user.clinicId);
      res.json({ success: true, data });
    })
  );

  router.get(
    '/insights',
    asyncHandler(async (req, res) => {
      const data = await outcomeService.getInsights(req.user.clinicId, req.query);
      res.json({ success: true, data });
    })
  );

  router.get('/metrics', (req, res) => {
    res.json({ success: true, data: { metrics: outcomeService.listMetrics() } });
  });

  return router;
}

module.exports = { createOutcomeRouter };
