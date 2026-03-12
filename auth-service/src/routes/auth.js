'use strict';

const express = require('express');
const { body } = require('express-validator');
const { validate } = require('../middleware/validate');
const { asyncHandler } = require('../http/asyncHandler');
const { InvalidTokenError } = require('../http/errors');

/**
 * HTTP surface only. Each handler reads the request, calls one service method
 * and picks a status code; errors travel to the central handler in `app.js`.
 */
function createAuthRouter({ authService }) {
  const router = express.Router();

  const loginValidation = [
    body('username').trim().notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ];

  router.post(
    '/login',
    loginValidation,
    validate,
    asyncHandler(async (req, res) => {
      const data = await authService.login(req.body.username, req.body.password);
      res.json({ success: true, message: 'Login successful', data });
    })
  );

  router.get(
    '/clinics',
    asyncHandler(async (req, res) => {
      const clinics = await authService.listClinics();
      res.json({ success: true, data: { clinics } });
    })
  );

  router.get(
    '/verify',
    asyncHandler(async (req, res) => {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new InvalidTokenError('No token provided');
      }
      const data = await authService.verify(authHeader.slice('Bearer '.length).trim());
      res.json({ success: true, data });
    })
  );

  return router;
}

module.exports = { createAuthRouter };
