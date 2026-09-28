// The code a client branches on. The message is for a person and may be reworded at
// any time; the code is part of the contract and never changes once shipped. A status
// that several rules share (five different 409s reach the panel) gets a code per rule.
export const DEFAULT_CODES: Readonly<Record<number, string>> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  429: "TOO_MANY_REQUESTS",
  500: "INTERNAL_ERROR",
  503: "SERVICE_UNAVAILABLE",
};

export const codeFor = (statusCode: number): string =>
  DEFAULT_CODES[statusCode] ?? (statusCode >= 500 ? "INTERNAL_ERROR" : "BAD_REQUEST");

/** One field a request failed validation on. */
export interface FieldError {
  readonly path: string;
  readonly message: string;
}

export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly isOperational: boolean;
  readonly details?: readonly FieldError[];

  constructor(
    statusCode: number,
    message: string,
    options: { code?: string; isOperational?: boolean; details?: FieldError[] } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = options.code ?? codeFor(statusCode);
    this.isOperational = options.isOperational ?? true;
    this.details = options.details;
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  static badRequest(message: string, code?: string) {
    return new ApiError(400, message, { code });
  }

  static validation(message: string, details: FieldError[]) {
    return new ApiError(400, message, { code: "VALIDATION_ERROR", details });
  }

  static unauthorized(message = "Unauthorized", code?: string) {
    return new ApiError(401, message, { code });
  }

  static forbidden(message = "Forbidden", code?: string) {
    return new ApiError(403, message, { code });
  }

  static notFound(message = "Not found", code?: string) {
    return new ApiError(404, message, { code });
  }

  static conflict(message: string, code?: string) {
    return new ApiError(409, message, { code });
  }

  // The rate limiter answers its own 429s before a handler runs. This one is for a
  // per-day allowance a handler enforces itself, which no limiter can express.
  static tooManyRequests(message: string, code?: string) {
    return new ApiError(429, message, { code });
  }

  static internal(message = "Internal server error") {
    return new ApiError(500, message, { isOperational: false });
  }

  // Operational, unlike internal(): the request was well formed and the rule was
  // not broken, a dependency this handler needs is just unreachable right now.
  static unavailable(message: string, code?: string) {
    return new ApiError(503, message, { code });
  }
}
