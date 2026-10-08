/**
 * Qualiva ESMMS - High-Performance Parameter & Request Validation Middleware
 *
 * Lightweight, zero-dependency validation running in nanoseconds (O(1) regex).
 * Rejects malformed IDs before database queries, preventing Prisma exceptions
 * and eliminating HTTP 500 error cascades from malicious or fuzzed inputs.
 */

// Matches valid standard UUID (v4), 24-character MongoDB ObjectID, or 32-character hex ID
const VALID_ID_REGEX = /^[0-9a-fA-F]{24}$|^[0-9a-fA-F]{32}$|^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * Validates that specified route parameter(s) conform to valid UUID / ObjectId format.
 * If invalid, cleanly terminates with HTTP 400 Bad Request without hitting Prisma/DB.
 *
 * @param {string|string[]} paramNames Parameter name or array of parameter names (e.g. 'id', 'lessonId')
 */
export function validateId(paramNames = ['id']) {
  const names = Array.isArray(paramNames) ? paramNames : [paramNames];

  return (req, res, next) => {
    for (let i = 0; i < names.length; i++) {
      const paramVal = req.params[names[i]];
      if (paramVal && !VALID_ID_REGEX.test(paramVal)) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_ID_FORMAT',
          message: `The provided identifier '${names[i]}' is invalid.`,
        });
      }
    }
    next();
  };
}
