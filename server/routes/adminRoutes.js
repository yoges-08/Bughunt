/**
 * Admin Routes - Protected by Server-Side Role Check
 * 
 * SERVER-SIDE SECURITY RULE:
 * Every endpoint requires req.user.role === 'admin'.
 * Any attempt by a student session to access these APIs will be rejected with 403 Forbidden.
 */

import express from 'express';
import { db } from '../db.js';
import { authenticateToken, requireRole } from '../auth.js';
import { socketManager } from '../socket.js';

const router = express.Router();

// Apply auth + admin role check to ALL routes in this file
router.use(authenticateToken);
router.use(requireRole('admin'));

// --- Overview / Contest Stats ---
router.get('/overview', (req, res) => {
  const students = db.getAllStudents();
  const problems = db.getAllProblems();
  const submissions = db.getSubmissionsForAdmin();

  const onlineCount = students.filter(s => socketManager.isStudentOnline(s.id)).length;
  const passedSubmissions = submissions.filter(s => s.pass).length;

  res.json({
    totalStudents: students.length,
    onlineStudents: onlineCount,
    totalProblems: problems.length,
    totalSubmissions: submissions.length,
    passedSubmissions,
    failedSubmissions: submissions.length - passedSubmissions
  });
});

// --- Student Monitoring ---
router.get('/students', (req, res) => {
  const students = db.getAllStudents();
  const studentsWithStatus = students.map(student => {
    const isOnline = socketManager.isStudentOnline(student.id);
    const assignment = db.getStudentAssignment(student.id);
    const submissions = db.getStudentSubmissions(student.id);
    const hasPassed = submissions.some(s => s.pass);

    return {
      ...student,
      isOnline,
      assignment: assignment ? {
        problemId: assignment.problemId,
        title: assignment.title,
        language: assignment.language,
        filename: assignment.filename,
        status: assignment.status,
        assignedAt: assignment.assignedAt
      } : null,
      submissionsCount: submissions.length,
      hasPassed
    };
  });

  res.json(studentsWithStatus);
});

// Create new student
router.post('/students', (req, res) => {
  const { username, password, name } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const newStudent = db.createStudent(username, password, name);
    // Broadcast updated student list
    socketManager.broadcastToAdmins({
      type: 'STUDENTS_UPDATED'
    });
    res.status(201).json(newStudent);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- Problem Management ---
router.get('/problems', (req, res) => {
  const problems = db.getAllProblems();
  res.json(problems);
});

// Create problem
router.post('/problems', (req, res) => {
  const { title, language, filename, description, starterCode, testCases, timeLimitMs } = req.body;

  if (!title || !language || !filename || !starterCode) {
    return res.status(400).json({ error: 'Title, language, filename, and starterCode are required' });
  }

  try {
    const newProblem = db.createProblem({
      title,
      language,
      filename,
      description: description || '',
      starterCode,
      testCases: testCases || [],
      timeLimitMs: Number(timeLimitMs) || 3000
    });
    res.status(201).json(newProblem);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- LAN File Push / Problem Assignment ---
/**
 * CORE REQUIREMENT 1:
 * Admin sends problem file to student or group of students over LAN.
 */
router.post('/assign', (req, res) => {
  const { problemId, studentId, assignAll } = req.body;

  if (!problemId) {
    return res.status(400).json({ error: 'problemId is required' });
  }

  const problem = db.getProblemById(problemId);
  if (!problem) {
    return res.status(404).json({ error: 'Problem not found' });
  }

  const problemPayload = {
    problemId: problem.id,
    title: problem.title,
    language: problem.language,
    filename: problem.filename,
    description: problem.description,
    starterCode: problem.starterCode,
    sampleTestCase: problem.testCases.find(t => !t.isHidden) || null
  };

  if (assignAll) {
    // Push to all students
    const results = socketManager.pushProblemToAll(problemPayload);
    socketManager.broadcastToAdmins({ type: 'STUDENTS_UPDATED' });
    return res.json({
      message: `Assigned problem '${problem.title}' to all students`,
      results
    });
  }

  if (!studentId) {
    return res.status(400).json({ error: 'studentId or assignAll must be specified' });
  }

  // Assign to single student in database
  db.assignProblemToStudent(studentId, problemId);

  // Push over LAN via WebSocket
  const isOnline = socketManager.pushProblemToStudent(studentId, problemPayload);

  // Notify admins of updated status
  socketManager.broadcastToAdmins({ type: 'STUDENTS_UPDATED' });

  res.json({
    message: `Assigned problem '${problem.title}' to student`,
    studentId,
    deliveredImmediately: isOnline
  });
});

// --- Submissions View (with Full Raw Compiler Diagnostics) ---
router.get('/submissions', (req, res) => {
  const submissions = db.getSubmissionsForAdmin();
  res.json(submissions);
});

export default router;
