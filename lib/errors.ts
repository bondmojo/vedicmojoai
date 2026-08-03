/**
 * lib/errors.ts — Custom error classes for the VedicMojoAI pipeline.
 *
 * Each error type maps to a specific failure mode in the analysis pipeline,
 * enabling precise error handling and user-facing messaging.
 */

// ─── Supporting Types ───────────────────────────────────────────────

/** A critical error detected during Wave 4A error checking. */
export interface CriticalError {
  /** Name of the validation check that failed. */
  check: string
  /** Human-readable description of the issue. */
  description: string
  /** Location within the chart data (e.g., "natal_nakshatras[2]"). */
  location: string
  /** Severity is always 'critical' for pipeline-halting errors. */
  severity: 'critical'
  /** Which pipeline waves are affected by this error. */
  affectsWaves: number[]
  /** Suggested correction for the practitioner. */
  correctionSuggestion: string
}

// ─── Error Classes ──────────────────────────────────────────────────

/**
 * Thrown when the computed Vimshottari dasha tree fails integrity checks.
 * This indicates an arithmetic or data inconsistency in the dasha computation.
 */
export class DashaIntegrityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DashaIntegrityError'
  }
}

/**
 * Thrown when chart input data fails validation against ChartInputV1 schema.
 * Contains field-level errors for precise feedback to the practitioner.
 */
export class ChartValidationError extends Error {
  /** Map of field paths to their validation error messages. */
  public fieldErrors: Record<string, string[]>

  constructor(message: string, fieldErrors: Record<string, string[]> = {}) {
    super(message)
    this.name = 'ChartValidationError'
    this.fieldErrors = fieldErrors
  }
}

/**
 * Thrown when Wave 4A detects critical errors that prevent the pipeline
 * from producing reliable results. The pipeline halts for practitioner review.
 */
export class PipelineHaltError extends Error {
  /** List of critical errors that triggered the halt. */
  public criticalErrors: CriticalError[]

  constructor(message: string, criticalErrors: CriticalError[] = []) {
    super(message)
    this.name = 'PipelineHaltError'
    this.criticalErrors = criticalErrors
  }
}

/**
 * Thrown when an LLM API call fails (rate limit, timeout, invalid response, etc.).
 * Captures the provider and model for retry/fallback logic.
 */
export class LLMCallError extends Error {
  /** LLM provider that failed (e.g., 'anthropic', 'openai', 'google'). */
  public provider: string
  /** Model identifier that was called. */
  public model: string

  constructor(message: string, provider: string, model: string) {
    super(message)
    this.name = 'LLMCallError'
    this.provider = provider
    this.model = model
  }
}

/** Thrown by signup when the email is already registered to an existing User. */
export class EmailAlreadyRegisteredError extends Error {
  constructor(message = 'An account with this email already exists.') {
    super(message)
    this.name = 'EmailAlreadyRegisteredError'
  }
}

/** Thrown by reset-password when the token is missing, expired, used, or malformed. */
export class InvalidResetTokenError extends Error {
  constructor(message = 'This password reset link is invalid or has expired.') {
    super(message)
    this.name = 'InvalidResetTokenError'
  }
}
