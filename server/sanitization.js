/**
 * Sanitization Layer for Bug Hunt Coding Contest
 * 
 * CORE REQUIREMENT 3:
 * Sanitizes all compiler / runtime errors before they can reach any student.
 * Maps raw error signals, compiler messages, stack traces, and exit codes
 * into strictly one of the 4 defined generic messages:
 * 
 * - ✅ Program Executed Successfully (status: "SUCCESS")
 * - ❌ Program Error (status: "PROGRAM_ERROR")
 * - ❌ Program Execution Failed (status: "EXECUTION_FAILED")
 * - ⏱ Program Execution Timed Out (status: "TIMEOUT")
 * 
 * SECURITY GUARANTEE:
 * No raw stderr, stdout, line numbers, compiler warnings, or stack traces
 * are ever included in student-facing response objects.
 */

export const GENERIC_MESSAGES = {
  SUCCESS: '✅ Program Executed Successfully',
  PROGRAM_ERROR: '❌ Program Error',
  EXECUTION_FAILED: '❌ Program Execution Failed',
  TIMEOUT: '⏱ Program Execution Timed Out'
};

/**
 * Classify a raw compiler/runtime execution result into a generic status code.
 * 
 * @param {Object} rawResult
 * @param {boolean} rawResult.compileSuccess
 * @param {boolean} rawResult.runtimeSuccess
 * @param {boolean} rawResult.timedOut
 * @param {number} rawResult.exitCode
 * @param {boolean} [rawResult.testPassed] - For evaluations against test cases
 * @returns {string} One of: 'SUCCESS', 'PROGRAM_ERROR', 'EXECUTION_FAILED', 'TIMEOUT'
 */
export function classifyExecutionResult(rawResult) {
  if (!rawResult) {
    return 'PROGRAM_ERROR';
  }

  // Check for execution timeout first
  if (rawResult.timedOut) {
    return 'TIMEOUT';
  }

  // Check for compilation / syntax / build failure
  if (rawResult.compileSuccess === false) {
    return 'PROGRAM_ERROR';
  }

  // Check for runtime crash / non-zero exit code / exception
  if (rawResult.runtimeSuccess === false || (rawResult.exitCode !== 0 && rawResult.exitCode !== undefined)) {
    return 'EXECUTION_FAILED';
  }

  // For submissions: check test case correctness
  if (rawResult.testPassed === false) {
    return 'EXECUTION_FAILED';
  }

  // If compilation succeeded, runtime succeeded, no timeout, and exit code is 0
  return 'SUCCESS';
}

/**
 * Produce a strictly sanitized result payload safe for sending to student client.
 * Completely strips all stdout, stderr, rawError, and tracebacks.
 * 
 * @param {Object} rawResult
 * @returns {{ success: boolean, status: string, message: string }}
 */
export function sanitizeForStudent(rawResult) {
  const status = classifyExecutionResult(rawResult);
  const success = status === 'SUCCESS';
  const message = GENERIC_MESSAGES[status];

  // Return ONLY these 3 properties. Do NOT attach raw logs or outputs.
  return {
    success,
    status,
    message
  };
}

/**
 * Format submission result for Admin review (contains full raw output and diffs).
 * 
 * @param {Object} rawResult
 * @returns {Object} Admin detailed payload
 */
export function formatForAdmin(rawResult) {
  const status = classifyExecutionResult(rawResult);
  return {
    success: status === 'SUCCESS',
    status,
    genericMessage: GENERIC_MESSAGES[status],
    timedOut: Boolean(rawResult.timedOut),
    compileSuccess: Boolean(rawResult.compileSuccess),
    runtimeSuccess: Boolean(rawResult.runtimeSuccess),
    exitCode: rawResult.exitCode,
    durationMs: rawResult.durationMs || 0,
    stdout: rawResult.stdout || '',
    stderr: rawResult.stderr || '',
    rawError: rawResult.rawError || '',
    testResults: rawResult.testResults || []
  };
}
