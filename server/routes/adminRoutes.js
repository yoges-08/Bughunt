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

    let timeTakenSeconds = null;
    if (assignment && assignment.assignedAt) {
      const assignedTime = new Date(assignment.assignedAt).getTime();
      const relevantSubs = submissions.filter(s => new Date(s.createdAt).getTime() >= assignedTime);
      const finishSub = relevantSubs.find(s => s.pass) || relevantSubs[0];
      if (finishSub) {
        timeTakenSeconds = Math.max(0, Math.floor((new Date(finishSub.createdAt).getTime() - assignedTime) / 1000));
      }
    }

    return {
      ...student,
      isOnline,
      assignment: assignment ? {
        problemId: assignment.problemId,
        title: assignment.title,
        language: assignment.language,
        filename: assignment.filename,
        status: assignment.status,
        assignedAt: assignment.assignedAt,
        expiresAt: assignment.expiresAt,
        durationMinutes: assignment.durationMinutes,
        hasSubmitted: assignment.hasSubmitted,
        timeTakenSeconds
      } : null,
      submissionsCount: submissions.length,
      hasPassed,
      timeTakenSeconds
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

// Delete student account
router.delete('/students/:id', (req, res) => {
  const { id } = req.params;

  try {
    const student = db.findUserById(id);
    if (!student || student.role !== 'student') {
      return res.status(404).json({ error: 'Student not found' });
    }

    const removed = db.deleteStudent(id);

    // Disconnect active socket if student is currently connected
    socketManager.disconnectStudent(id, 'Account deleted by admin');

    // Broadcast update to all admins
    socketManager.broadcastToAdmins({
      type: 'STUDENTS_UPDATED'
    });

    res.json({ deleted: true, student: removed });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Bulk create students
router.post('/students/bulk', (req, res) => {
  const { students: rawStudents, generate } = req.body;

  let studentList = [];

  if (Array.isArray(rawStudents) && rawStudents.length > 0) {
    studentList = rawStudents;
  } else if (generate && generate.count) {
    const count = Math.min(100, Math.max(1, Number(generate.count) || 10));
    const prefix = (generate.prefix || 'student').trim();
    const startNum = Number(generate.startNumber) || 1;
    const pwdPrefix = generate.passwordPrefix || 'pass';

    for (let i = 0; i < count; i++) {
      const num = startNum + i;
      studentList.push({
        username: `${prefix}${num}`,
        password: `${pwdPrefix}${num}`,
        name: `Student ${num} (Team ${num})`
      });
    }
  } else {
    return res.status(400).json({ error: 'Provide either a list of students or generator options' });
  }

  const created = [];
  const errors = [];

  for (const s of studentList) {
    try {
      const newS = db.createStudent(s.username, s.password, s.name);
      created.push(newS);
    } catch (err) {
      errors.push({ username: s.username, error: err.message });
    }
  }

  if (created.length > 0) {
    socketManager.broadcastToAdmins({ type: 'STUDENTS_UPDATED' });
  }

  res.json({
    createdCount: created.length,
    created,
    errorsCount: errors.length,
    errors
  });
});

// Single student detailed inspection
router.get('/students/:id/details', (req, res) => {
  const studentId = req.params.id;
  const student = db.findUserById(studentId);
  if (!student || student.role !== 'student') {
    return res.status(404).json({ error: 'Student not found' });
  }

  const isOnline = socketManager.isStudentOnline(student.id);
  const assignment = db.getStudentAssignment(student.id);
  const submissions = db.getSubmissionsForAdmin().filter(s => s.studentId === student.id);

  let timeTakenSeconds = null;
  if (assignment && assignment.assignedAt) {
    const assignedTime = new Date(assignment.assignedAt).getTime();
    const relevantSubs = submissions.filter(s => new Date(s.createdAt).getTime() >= assignedTime);
    const finishSub = relevantSubs.find(s => s.pass) || relevantSubs[0];
    if (finishSub) {
      timeTakenSeconds = Math.max(0, Math.floor((new Date(finishSub.createdAt).getTime() - assignedTime) / 1000));
    }
  }

  // Enrich each submission with elapsed time since assignment
  const enrichedSubmissions = submissions.map(sub => {
    let elapsedSeconds = null;
    if (assignment && assignment.assignedAt) {
      elapsedSeconds = Math.max(0, Math.floor((new Date(sub.createdAt).getTime() - new Date(assignment.assignedAt).getTime()) / 1000));
    }
    return {
      ...sub,
      elapsedSeconds
    };
  });

  res.json({
    student: {
      id: student.id,
      username: student.username,
      name: student.name,
      createdAt: student.createdAt,
      isOnline
    },
    assignment: assignment ? {
      ...assignment,
      timeTakenSeconds
    } : null,
    timeTakenSeconds,
    submissions: enrichedSubmissions
  });
});

// --- Problem Management ---
router.get('/problems', (req, res) => {
  const problems = db.getAllProblems();
  res.json(problems);
});

// Create problem with configurable timer / durationMinutes
router.post('/problems', (req, res) => {
  const { title, language, filename, description, starterCode, testCases, timeLimitMs, durationMinutes } = req.body;

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
      timeLimitMs: Number(timeLimitMs) || 3000,
      durationMinutes: Math.max(1, Number(durationMinutes) || 15)
    });
    res.status(201).json(newProblem);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Feature 3: Update existing problem
router.put('/problems/:id', (req, res) => {
  const { id } = req.params;
  const { title, language, filename, description, starterCode, testCases, timeLimitMs, durationMinutes } = req.body;

  try {
    const updated = db.updateProblem(id, {
      title, language, filename, description, starterCode, testCases, timeLimitMs, durationMinutes
    });
    res.json(updated);
  } catch (err) {
    if (err.message.includes('not found')) {
      return res.status(404).json({ error: err.message });
    }
    res.status(400).json({ error: err.message });
  }
});

// Feature 2: Delete problem with assignment/submission reference guardrail
router.delete('/problems/:id', (req, res) => {
  const { id } = req.params;
  const { force } = req.query;

  const assignedCount = db.data.assignments.filter(a => a.problemId === id).length;
  const submissionCount = db.data.submissions.filter(s => s.problemId === id).length;

  if ((assignedCount > 0 || submissionCount > 0) && force !== 'true') {
    return res.status(409).json({
      error: `Cannot delete problem: it is currently referenced by ${assignedCount} assignment(s) and ${submissionCount} submission(s).`,
      assignedCount,
      submissionCount
    });
  }

  try {
    const removed = db.deleteProblem(id);
    res.json({ deleted: true, problem: removed });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// --- LAN File Push / Problem Assignment ---
/**
 * CORE REQUIREMENT 1:
 * Admin sends problem file to student or group of students over LAN with live timer.
 */
router.post('/assign', (req, res) => {
  const { problemId, studentId, assignAll, resetCode } = req.body;
  const shouldResetCode = resetCode !== false; // Issue 3: default to resetting code to starterCode unless explicitly false

  if (!problemId) {
    return res.status(400).json({ error: 'problemId is required' });
  }

  const problem = db.getProblemById(problemId);
  if (!problem) {
    return res.status(404).json({ error: 'Problem not found' });
  }

  const durationMinutes = problem.durationMinutes || 15;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + durationMinutes * 60 * 1000).toISOString();

  const problemPayload = {
    problemId: problem.id,
    title: problem.title,
    language: problem.language,
    filename: problem.filename,
    description: problem.description,
    starterCode: problem.starterCode,
    durationMinutes,
    assignedAt: now.toISOString(),
    expiresAt,
    hasSubmitted: false,
    sampleTestCase: problem.testCases.find(t => !t.isHidden) || null
  };

  if (assignAll) {
    // Assign and push to all students with error capture
    const students = db.getAllStudents();
    const errors = [];

    students.forEach(s => {
      try {
        db.assignProblemToStudent(s.id, problemId, shouldResetCode);
      } catch (err) {
        errors.push({ studentId: s.id, username: s.username, error: err.message });
      }
    });

    const successfulIds = students
      .filter(s => !errors.some(e => e.studentId === s.id))
      .map(s => s.id);

    const results = socketManager.pushProblemToAll(problemPayload, successfulIds);
    socketManager.broadcastToAdmins({ type: 'STUDENTS_UPDATED' });

    return res.json({
      message: `Assigned problem '${problem.title}' (⏱️ ${durationMinutes} mins) to ${successfulIds.length}/${students.length} students`,
      results,
      errors
    });
  }

  if (!studentId) {
    return res.status(400).json({ error: 'studentId or assignAll must be specified' });
  }

  // Assign to single student in database (with configurable resetCode)
  db.assignProblemToStudent(studentId, problemId, shouldResetCode);

  // Push over LAN via WebSocket
  const isOnline = socketManager.pushProblemToStudent(studentId, problemPayload);

  // Notify admins of updated status
  socketManager.broadcastToAdmins({ type: 'STUDENTS_UPDATED' });

  res.json({
    message: `Assigned problem '${problem.title}' (⏱️ ${durationMinutes} mins) to student`,
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
