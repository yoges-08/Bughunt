/**
 * Student Routes - Protected by Authentication & Sanitization Layer
 * 
 * CORE REQUIREMENT 2 & 3:
 * - RUN: Sandboxed execution with strictly generic pass/fail response.
 * - SUBMIT: Server independently re-compiles and re-verifies against all test cases.
 * - SANITIZATION: Never returns raw compiler/runtime output or line numbers to students.
 * - SINGLE SUBMISSION LIMIT: Only one submission allowed per problem assignment.
 * - TIMER ENFORCEMENT: Server validates that submission was sent before problem expiry.
 */

import express from 'express';
import { db } from '../db.js';
import { authenticateToken, requireRole } from '../auth.js';
import { executeCode } from '../compiler.js';
import { evaluateSubmission } from '../evaluator.js';
import { sanitizeForStudent } from '../sanitization.js';
import { socketManager } from '../socket.js';

const router = express.Router();

// Apply auth + student role check
router.use(authenticateToken);
router.use(requireRole('student'));

// In-flight submission mutex to prevent concurrent duplicate submission race conditions (Priority #2)
const inFlightSubmissions = new Set();

/**
 * Standardize language aliases to canonical forms ('python', 'c', 'cpp')
 */
function normalizeLanguage(lang) {
  if (!lang || typeof lang !== 'string') return '';
  const clean = lang.toLowerCase().trim();
  if (clean === 'py' || clean === 'python') return 'python';
  if (clean === 'c') return 'c';
  if (clean === 'cpp' || clean === 'c++') return 'cpp';
  return clean;
}

// --- Get Assigned Problem & Restore State on Reconnect ---
router.get('/current-problem', (req, res) => {
  const studentId = req.user.id;
  const assignment = db.getStudentAssignment(studentId);

  if (!assignment) {
    return res.json({
      assigned: false,
      problem: null
    });
  }

  res.json({
    assigned: true,
    problem: {
      contestId: assignment.contestId || null,
      contestStartAt: assignment.contestStartAt || (assignment.assignedAt ? new Date(assignment.assignedAt).getTime() : null),
      problemId: assignment.problemId,
      title: assignment.title,
      language: assignment.language,
      filename: assignment.filename,
      description: assignment.description,
      starterCode: assignment.starterCode,
      currentCode: assignment.currentCode,
      expectedOutput: assignment.expectedOutput || assignment.sampleTestCase?.expectedOutput || '',
      status: assignment.status,
      assignedAt: assignment.assignedAt,
      expiresAt: assignment.expiresAt,
      durationMinutes: assignment.durationMinutes || 15,
      hasSubmitted: Boolean(assignment.hasSubmitted),
      sampleTestCase: assignment.sampleTestCase,
      serverTime: Date.now()
    }
  });
});

// --- Auto-save Draft Code ---
router.post('/save-code', (req, res) => {
  const studentId = req.user.id;
  const { code } = req.body;

  if (typeof code === 'string') {
    db.saveStudentDraftCode(studentId, code);
  }
  res.json({ saved: true });
});

// --- RUN (Student Sandbox Test Run) ---
/**
 * CORE REQUIREMENT 2 & 3:
 * Executes code in private sandbox. Sanitizes output before sending response.
 * Evaluates against authoritative server expected output to detect failing programs.
 * (Priority #6: Prevents client manipulation of expected output)
 */
router.post('/run', async (req, res) => {
  const studentId = req.user.id;
  const { code, language, stdin } = req.body;

  if (!code || !language) {
    return res.status(400).json({ error: 'Code and language are required' });
  }

  // If code is empty or only whitespace, return failure
  if (!code.trim()) {
    return res.json({
      success: false,
      status: 'PROGRAM_ERROR',
      message: '❌ Program Error'
    });
  }

  try {
    const assignment = db.getStudentAssignment(studentId);
    let targetExpectedOutput = null;
    let effectiveStdin = stdin || '';
    let effectiveLanguage = normalizeLanguage(language) || 'python';

    if (assignment) {
      if (assignment.language) {
        effectiveLanguage = normalizeLanguage(assignment.language);
      }
      // Check if student has already submitted for the current assignment
      const existingSubmissions = db.getStudentSubmissions(studentId);
      const alreadySubmitted = existingSubmissions.some(s => 
        s.problemId === assignment.problemId && 
        new Date(s.createdAt) >= new Date(assignment.assignedAt)
      );

      if (alreadySubmitted) {
        return res.status(400).json({
          error: 'Only one submission is allowed per problem. You have already submitted your solution.',
          alreadySubmitted: true
        });
      }

      // Check if problem time limit has expired
      if (assignment.expiresAt) {
        const now = Date.now();
        const expiry = new Date(assignment.expiresAt).getTime();
        const LAN_GRACE_PERIOD_MS = 3000;
        if (now > expiry + LAN_GRACE_PERIOD_MS) {
          return res.status(400).json({
            error: 'Contest time has expired for this problem. Execution is disabled.',
            timeExpired: true
          });
        }
      }

      targetExpectedOutput = assignment.expectedOutput || assignment.sampleTestCase?.expectedOutput || null;
      if (!stdin && assignment.sampleTestCase?.input) {
        effectiveStdin = assignment.sampleTestCase.input;
      }
    }

    // Execute code using bundled compiler sandbox with 3s timeout
    const rawResult = await executeCode({
      code,
      language: effectiveLanguage,
      stdin: effectiveStdin,
      timeoutMs: 3000
    });

    // If authoritative expected output is present, verify that the program's output matches
    if (targetExpectedOutput !== null && rawResult.compileSuccess !== false && !rawResult.timedOut && rawResult.runtimeSuccess !== false && (rawResult.exitCode === 0 || rawResult.exitCode === undefined)) {
      const normalize = (str) => {
        if (typeof str !== 'string') return '';
        return str
          .replace(/\r\n/g, '\n')
          .split('\n')
          .map(l => l.trimEnd())
          .join('\n')
          .trim();
      };
      const normalizedActual = normalize(rawResult.stdout);
      const normalizedExpected = normalize(targetExpectedOutput);
      rawResult.testPassed = (normalizedActual === normalizedExpected);
    }

    // Strip all stderr, stdout, line numbers, compiler warnings
    const sanitized = sanitizeForStudent(rawResult);

    if (rawResult.isEnvironmentError) {
      console.error(`⚠️ [Compiler Environment Error on /run] Language: ${language}, Student: ${req.user.username} - ${rawResult.rawError}`);
    }

    // Return ONLY the sanitized generic pass/fail message
    res.json(sanitized);
  } catch (err) {
    const isEnv = err.code === 'ENOENT';
    const sanitized = sanitizeForStudent({
      compileSuccess: false,
      isEnvironmentError: isEnv,
      rawError: err.message
    });
    res.json(sanitized);
  }
});

// --- SUBMIT (Final Submission with Server Re-verification) ---
/**
 * CORE REQUIREMENT 2 & 3:
 * Server independently re-compiles, executes all test cases, and scores the submission.
 * Enforces single submission limit, language matching, and time limit.
 */
router.post('/submit', async (req, res) => {
  const studentId = req.user.id;
  const { problemId, code, language } = req.body;

  if (!problemId || !code || !language) {
    return res.status(400).json({ error: 'problemId, code, and language are required' });
  }

  // 1. Verify student has an active assignment matching this problemId
  const assignment = db.getStudentAssignment(studentId);
  if (!assignment || assignment.problemId !== problemId) {
    return res.status(400).json({ error: 'This problem is not currently assigned to you.' });
  }

  // 2. Enforce language matching (Priority #1)
  const normSubmittedLang = normalizeLanguage(language);
  const normAssignedLang = normalizeLanguage(assignment.language);
  if (normSubmittedLang !== normAssignedLang) {
    return res.status(400).json({
      error: `Language mismatch: This problem must be submitted in ${assignment.language.toUpperCase()}.`
    });
  }

  // 3. Single-submission race condition lock (Priority #2)
  const lockKey = `${studentId}:${problemId}`;
  if (inFlightSubmissions.has(lockKey)) {
    return res.status(400).json({
      error: 'A submission for this problem is already currently in evaluation. Please wait.',
      alreadySubmitted: true
    });
  }

  // 4. Check if student has already submitted this problem for the current assignment
  const existingSubmissions = db.getStudentSubmissions(studentId);
  const alreadySubmitted = existingSubmissions.some(s => 
    s.problemId === problemId && 
    new Date(s.createdAt) >= new Date(assignment.assignedAt)
  );

  if (alreadySubmitted) {
    return res.status(400).json({
      error: 'Only one submission is allowed per problem. You have already submitted your solution.',
      alreadySubmitted: true
    });
  }

  // 5. Check if problem time limit has expired
  if (assignment && assignment.expiresAt) {
    const now = Date.now();
    const expiry = new Date(assignment.expiresAt).getTime();
    const LAN_GRACE_PERIOD_MS = 3000;
    if (now > expiry + LAN_GRACE_PERIOD_MS) {
      return res.status(400).json({
        error: 'Contest time has expired for this problem. Submissions are now closed.',
        timeExpired: true
      });
    }
  }

  // Acquire submission lock
  inFlightSubmissions.add(lockKey);

  try {
    // Re-verify submission on the server using authoritative language
    const { studentResult, adminResult, submission } = await evaluateSubmission({
      studentId,
      problemId,
      code,
      language: normAssignedLang
    });

    // Notify connected Admins in real-time about the new submission
    socketManager.broadcastToAdmins({
      type: 'NEW_SUBMISSION',
      payload: {
        submissionId: submission.id,
        studentId,
        username: req.user.username,
        studentName: req.user.name,
        problemId,
        pass: submission.pass,
        status: submission.status,
        executionTimeMs: submission.executionTimeMs,
        createdAt: submission.createdAt
      }
    });

    // Return ONLY the sanitized response to the student
    res.json(studentResult);
  } catch (err) {
    res.status(500).json({
      success: false,
      status: 'EXECUTION_FAILED',
      message: '❌ Program Execution Failed'
    });
  } finally {
    // Release submission lock
    inFlightSubmissions.delete(lockKey);
  }
});

// --- Get Past Submissions for Current Student ---
router.get('/submissions', (req, res) => {
  const studentId = req.user.id;
  const submissions = db.getStudentSubmissions(studentId);
  res.json(submissions);
});

export default router;
