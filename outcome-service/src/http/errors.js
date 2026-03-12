'use strict';

/**
 * Errors that carry an HTTP status. Anything thrown that is not one of these is
 * treated as a server fault and answered with a generic 500, because the
 * message of an arbitrary error (a Mongoose validation or cast error, say)
 * embeds the submitted document values, which in this service are patient data.
 */
class HttpError extends Error {
  constructor(status, message, code = undefined) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.code = code;
    this.expose = true;
  }
}

/** The caller's token names a clinic they may not read or write. */
class ClinicAccessError extends HttpError {
  constructor(message, code) {
    super(403, message, code);
  }
}

/** The request body or query string is not usable. */
class BadRequestError extends HttpError {
  constructor(message, code) {
    super(400, message, code);
  }
}

module.exports = { HttpError, ClinicAccessError, BadRequestError };
