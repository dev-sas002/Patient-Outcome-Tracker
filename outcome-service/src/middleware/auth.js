'use strict';

const jwt = require('jsonwebtoken');
const { config } = require('../config');

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required. Please provide a valid token.',
    });
  }

  const token = authHeader.slice('Bearer '.length).trim();
  try {
    const decoded = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });

    // Every downstream query is scoped by clinicId. A token without one would
    // make the clinic lookup and the record filter unscoped, so reject it
    // outright rather than fall through to an unfiltered query.
    if (!decoded.clinicId || !decoded.userId || !decoded.username) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token. Please log in again.',
      });
    }

    req.user = {
      userId: decoded.userId,
      username: decoded.username,
      clinicId: decoded.clinicId,
      role: decoded.role,
    };
    next();
  } catch (error) {
    const message =
      error.name === 'TokenExpiredError'
        ? 'Token has expired. Please log in again.'
        : 'Invalid token. Please log in again.';
    return res.status(401).json({ success: false, message });
  }
}

module.exports = { authenticate };
