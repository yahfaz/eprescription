import { ZodError } from 'zod';
import ApiError from '../utils/ApiError.js';

/**
 * Validates and coerces req[source] against a Zod schema. On success the parsed
 * value replaces the raw input so downstream handlers get clean, typed data.
 */
export function validate(schema, source = 'body') {
  return (req, _res, next) => {
    try {
      req[source] = schema.parse(req[source]);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const details = err.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        return next(ApiError.unprocessable('Validation failed', details));
      }
      next(err);
    }
  };
}
