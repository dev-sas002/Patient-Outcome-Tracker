'use strict';

/**
 * Express 4 does not catch a rejected promise from an async handler, so an
 * `await` that throws inside a route silently hangs the request. Wrapping the
 * handler is the difference between one central error policy and a try/catch
 * copied into every route.
 */
function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

module.exports = { asyncHandler };
