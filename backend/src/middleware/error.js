import env from '../config/env.js';
import ApiError from '../utils/ApiError.js';

export function notFound(_req, _res, next) {
  next(ApiError.notFound('Route not found'));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let details = err.details;

  // Map common PostgreSQL errors to friendly responses
  if (err.code === '23505') {
    statusCode = 409;
    message = 'A record with these details already exists';
  } else if (err.code === '23503') {
    statusCode = 400;
    message = 'Referenced record does not exist';
  } else if (err.code === '22P02') {
    statusCode = 400;
    message = 'Invalid identifier format';
  }

  if (statusCode >= 500) {
    // eslint-disable-next-line no-console
    console.error('Unhandled error:', err);
  }

  res.status(statusCode).json({
    error: {
      message,
      ...(details ? { details } : {}),
      ...(env.isProd ? {} : { stack: err.stack }),
    },
  });
}
