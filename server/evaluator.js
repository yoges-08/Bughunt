/**
 * Independent Server-Side Submission Verification & Evaluator
 * 
 * CORE REQUIREMENT 2 & 3:
 * Re-compiles and re-runs student submissions against all official problem test cases.
 * Never trusts client self-reports.
 * Produces raw diagnostics for Admin, and strictly sanitized messages for Students.
 */

import { executeCode } from './compiler.js';
import { db } from './db.js';
import { sanitizeForStudent, formatForAdmin, GENERIC_MESSAGES } from './sanitization.js';

/**
 * Normalize output string by trimming trailing whitespace/newlines on each line
 */
function normalizeOutput(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n')
    .trim();
}

/**
 * Independently evaluate a student submission against all test cases for the problem.
 * 
 * @param {Object} params
 * @param {string} params.studentId
 * @param {string} params.problemId
 * @param {string} params.code
 * @param {string} params.language
 * @returns {Promise<{ studentResult: Object, adminResult: Object, submissionId: string }>}
 */
export async function evaluateSubmission({ studentId, problemId, code, language }) {
  const problem = db.getProblemById(problemId);
  if (!problem) {
    throw new Error(`Problem '${problemId}' not found`);
  }

  const testCases = problem.testCases || [];
  let compileSuccess = true;
  let runtimeSuccess = true;
  let timedOut = false;
  let allPassed = true;
  let totalDurationMs = 0;
  let rawCompileError = '';
  let rawRuntimeError = '';
  const testResults = [];

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    const execResult = await executeCode({
      code,
      language,
      stdin: tc.input || '',
      timeoutMs: problem.timeLimitMs || 3000
    });

    totalDurationMs += execResult.durationMs || 0;

    // Check if compilation failed
    if (execResult.compileSuccess === false) {
      compileSuccess = false;
      allPassed = false;
      rawCompileError = execResult.rawError || execResult.stderr;
      testResults.push({
        testCaseIndex: i + 1,
        isHidden: tc.isHidden,
        passed: false,
        compileFailed: true,
        timedOut: false,
        exitCode: execResult.exitCode,
        error: rawCompileError
      });
      break; // No need to continue if code does not compile
    }

    // Check if runtime failed or timed out
    if (execResult.timedOut) {
      timedOut = true;
      allPassed = false;
      testResults.push({
        testCaseIndex: i + 1,
        isHidden: tc.isHidden,
        passed: false,
        timedOut: true,
        exitCode: -1,
        error: 'Time Limit Exceeded'
      });
      break;
    }

    if (execResult.runtimeSuccess === false || execResult.exitCode !== 0) {
      runtimeSuccess = false;
      allPassed = false;
      rawRuntimeError = execResult.rawError || execResult.stderr;
      testResults.push({
        testCaseIndex: i + 1,
        isHidden: tc.isHidden,
        passed: false,
        runtimeFailed: true,
        exitCode: execResult.exitCode,
        stderr: execResult.stderr,
        actualOutput: execResult.stdout
      });
      break;
    }

    // Check output correctness
    const normalizedActual = normalizeOutput(execResult.stdout);
    const normalizedExpected = normalizeOutput(tc.expectedOutput);
    const passed = normalizedActual === normalizedExpected;

    if (!passed) {
      allPassed = false;
    }

    testResults.push({
      testCaseIndex: i + 1,
      isHidden: tc.isHidden,
      passed,
      actualOutput: execResult.stdout,
      expectedOutput: tc.expectedOutput,
      durationMs: execResult.durationMs
    });
  }

  // Determine overall status
  const rawSummary = {
    compileSuccess,
    runtimeSuccess,
    timedOut,
    testPassed: allPassed,
    exitCode: (!compileSuccess || !runtimeSuccess) ? 1 : 0,
    durationMs: totalDurationMs,
    rawError: rawCompileError || rawRuntimeError,
    stderr: rawCompileError || rawRuntimeError,
    testResults
  };

  const studentResult = sanitizeForStudent(rawSummary);
  const adminResult = formatForAdmin(rawSummary);

  // Record submission in persistent DB
  const submission = db.recordSubmission({
    studentId,
    problemId,
    code,
    language,
    status: studentResult.status,
    pass: studentResult.success,
    rawOutput: JSON.stringify(adminResult),
    genericMessage: studentResult.message,
    executionTimeMs: totalDurationMs
  });

  return {
    submissionId: submission.id,
    studentResult,
    adminResult,
    submission
  };
}
