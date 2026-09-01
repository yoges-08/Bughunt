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
      problemId: assignment.problemId,
      title: assignment.title,
      language: assignment.language,
      filename: assignment.filename,
      description: assignment.description,
      starterCode: assignment.starterCode,
      currentCode: assignment.currentCode,
      status: assignment.status,
      assignedAt: assignment.assignedAt,
      expiresAt: assignment.expiresAt,
      durationMinutes: assignment.durationMinutes || 15,
      hasSubmitted: Boolean(assignment.hasSubmitted),
      sampleTestCase: assignment.sampleTestCase
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
 */
router.post('/run', async (req, res) => {
  const { code, language, stdin } = req.body;

  if (!code || !language) {
    return res.status(400).json({ error: 'Code and language are required' });
  }

  try {
    // Execute code using bundled compiler sandbox with 3s timeout
    const rawResult = await executeCode({
      code,
      language,
      stdin: stdin || '',
      timeoutMs: 3000
    });

    // Strip all stderr, stdout, line numbers, compiler warnings
    const sanitized = sanitizeForStudent(rawResult);

    // Return ONLY the sanitized generic pass/fail message
    res.json(sanitized);
  } catch (err) {
    // If an unexpected error occurs, still return generic sanitized message
    res.json({
      success: false,
      status: 'PROGRAM_ERROR',
      message: '❌ Program Error'
    });
  }
});

// --- SUBMIT (Final Submission with Server Re-verification) ---
/**
 * CORE REQUIREMENT 2 & 3:
 * Server independently re-compiles, executes all test cases, and scores the submission.
 * Enforces single submission limit and time limit.
 */
router.post('/submit', async (req, res) => {
  const studentId = req.user.id;
  const { problemId, code, language } = req.body;

  if (!problemId || !code || !language) {
    return res.status(400).json({ error: 'problemId, code, and language are required' });
  }

  // 1. Check if student has already submitted this problem for the current assignment (Single Submission Limit)
  const assignment = db.getStudentAssignment(studentId);
  const existingSubmissions = db.getStudentSubmissions(studentId);
  const alreadySubmitted = existingSubmissions.some(s => 
    s.problemId === problemId && 
    assignment && 
    new Date(s.createdAt) >= new Date(assignment.assignedAt)
  );

  if (alreadySubmitted) {
    return res.status(400).json({
      error: 'Only one submission is allowed per problem. You have already submitted your solution.',
      alreadySubmitted: true
    });
  }

  // 2. Check if problem time limit has expired
  if (assignment && assignment.expiresAt) {
    const now = Date.now();
    const expiry = new Date(assignment.expiresAt).getTime();
    // Allow a 15-second network latency grace period
    if (now > expiry + 15000) {
      return res.status(400).json({
        error: 'Contest time has expired for this problem. Submissions are now closed.',
        timeExpired: true
      });
    }
  }

  try {
    // Re-verify submission on the server
    const { studentResult, adminResult, submission } = await evaluateSubmission({
      studentId,
      problemId,
      code,
      language
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
  }
});

// --- Get Past Submissions for Current Student ---
router.get('/submissions', (req, res) => {
  const studentId = req.user.id;
  const submissions = db.getStudentSubmissions(studentId);
  res.json(submissions);
});

export default router;
