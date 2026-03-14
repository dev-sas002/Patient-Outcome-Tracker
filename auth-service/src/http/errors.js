'use strict';

/**
 * Errors that carry an HTTP status. Anything thrown that is not one of these is
 * treated as a server fault and answered with a generic 500, because an
 * arbitrary error's message is not safe to return - a Mongoose validation or
 * cast error embeds the submitted document values.
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

/**
 * Wrong username, wrong password, unknown user - all one error with one
 * message, so the response cannot be used to enumerate valid usernames.
 */
class InvalidCredentialsError extends HttpError {
  constructor() {
    super(401, 'Invalid username or password', 'invalid_credentials');
  }
}

/** The token itself is unusable: malformed, expired, forged or unscoped. */
class InvalidTokenError extends HttpError {
  constructor(message = 'Invalid or expired token') {
    super(401, message, 'invalid_token');
  }
}

/** The clinic exists but is deactivated. */
class ClinicInactiveError extends HttpError {
  constructor() {
    super(403, 'Clinic account is inactive. Contact support.', 'clinic_inactive');
  }
}

module.exports = { HttpError, InvalidCredentialsError, InvalidTokenError, ClinicInactiveError };
