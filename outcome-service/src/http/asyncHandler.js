'use strict';

/**
 * Express 4 does not catch a rejected promise from an async handler, so every
 * `await` that throws inside a route silently hangs the request. Wrapping the
 * handler is the difference between one central error policy and a try/catch
 * copied into every route - and a copied try/catch is how PHI ends up in a log
 * line, because one copy forgets to strip the error.
 */
function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

module.exports = { asyncHandler };
