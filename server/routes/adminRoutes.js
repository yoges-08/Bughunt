/**
 * Admin Routes - Protected by Server-Side Role Check
 * 
 * SERVER-SIDE SECURITY RULE:
 * Every endpoint requires req.user.role === 'admin'.
 * Any attempt by a student session to access these APIs will be rejected with 403 Forbidden.
 */

import express from 'express';
import { db, normalizeLanguage } from '../db.js';
import { authenticateToken, requireRole } from '../auth.js';
import { socketManager } from '../socket.js';
import { checkAllCompilers } from '../compiler.js';

const router = express.Router();

// Kickoff mutex / debounce lock (BUG-ML-08)
let isKickoffInProgress = false;
let lastKickoffTimestamp = 0;

// Apply auth + admin role check to ALL routes in this file
router.use(authenticateToken);
router.use(requireRole('admin'));

// --- Overview / Contest Stats ---
router.get('/overview', async (req, res) => {
  const students = db.getAllStudents();
  const problems = db.getAllProblems();
  const submissions = db.getSubmissionsForAdmin();

  const onlineCount = students.filter(s => socketManager.isStudentOnline(s.id)).length;
  const passedSubmissions = submissions.filter(s => s.pass).length;

  let compilers = null;
  try {
    compilers = await checkAllCompilers();
  } catch {}

  res.json({
    totalStudents: students.length,
    onlineStudents: onlineCount,
    totalProblems: problems.length,
    totalSubmissions: submissions.length,
    passedSubmissions,
    failedSubmissions: submissions.length - passedSubmissions,
    compilers
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

// Create new student or team
router.post('/students', (req, res) => {
  const { username, password, name, isTeam, teamName, teammates, preferredLanguage } = req.body;

  if (!password) {
    return res.status(400).json({ error: 'Password is required' });
  }

  const effectiveName = (name || teamName || '').trim();
  if (!effectiveName) {
    return res.status(400).json({ error: isTeam ? 'Team name is required' : 'Student name is required' });
  }

  // Auto-generate username from name or teamName if not supplied
  let finalUsername = (username || '').trim();
  if (!finalUsername) {
    const base = effectiveName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '') || (isTeam ? 'team' : 'student');
    finalUsername = base.substring(0, 24);
    if (finalUsername.length < 3) {
      finalUsername = `${finalUsername}_${isTeam ? 'team' : 'std'}`;
    }
    let candidate = finalUsername;
    let counter = 1;
    while (db.data.users.some(u => u.username.toLowerCase() === candidate.toLowerCase())) {
      candidate = `${finalUsername}_${counter}`;
      counter++;
    }
    finalUsername = candidate;
  }

  try {
    const newStudent = db.createStudent(finalUsername, password, effectiveName, {
      isTeam: Boolean(isTeam),
      teamName: teamName || (isTeam ? effectiveName : null),
      teammates: teammates || null,
      preferredLanguage: preferredLanguage || 'python'
    });
    // Broadcast updated student list
    socketManager.broadcastToAdmins({
      type: 'STUDENTS_UPDATED'
    });
    res.status(201).json(newStudent);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete all student accounts
router.delete('/students', (req, res) => {
  try {
    const students = db.getAllStudents();
    for (const s of students) {
      socketManager.disconnectStudent(s.id, 'Contest reset by admin');
    }
    const result = db.clearAllStudents();
    socketManager.broadcastToAdmins({ type: 'STUDENTS_UPDATED' });
    res.json({ success: true, count: result.count, message: `Removed all ${result.count} student accounts.` });
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
    const defaultLang = (generate.preferredLanguage || 'python').trim();

    for (let i = 0; i < count; i++) {
      const num = startNum + i;
      studentList.push({
        username: `${prefix}${num}`,
        password: `${pwdPrefix}${num}`,
        name: `Student ${num} (Team ${num})`,
        preferredLanguage: defaultLang
      });
    }
  } else {
    return res.status(400).json({ error: 'Provide either a list of students or generator options' });
  }

  const created = [];
  const errors = [];

  for (const s of studentList) {
    try {
      const newS = db.createStudent(s.username, s.password, s.name, {
        isTeam: Boolean(s.isTeam),
        teamName: s.teamName,
        teammates: s.teammates,
        preferredLanguage: s.preferredLanguage || 'python'
      });
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
      isTeam: Boolean(student.isTeam),
      teamName: student.teamName || null,
      teammates: student.teammates || null,
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
  const { title, language, filename, description, starterCode, expectedOutput, testCases, timeLimitMs, durationMinutes } = req.body;

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
      expectedOutput: expectedOutput || '',
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
  const { title, language, filename, description, starterCode, expectedOutput, testCases, timeLimitMs, durationMinutes } = req.body;

  try {
    const updated = db.updateProblem(id, {
      title, language, filename, description, starterCode, expectedOutput, testCases, timeLimitMs, durationMinutes
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
  const { problemId, studentId, assignAll, targetLanguage, resetCode } = req.body;
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
  const expectedOut = problem.expectedOutput || (problem.testCases && problem.testCases[0]?.expectedOutput) || '';

  const problemPayload = {
    problemId: problem.id,
    title: problem.title,
    language: problem.language,
    filename: problem.filename,
    description: problem.description,
    starterCode: problem.starterCode,
    expectedOutput: expectedOut,
    durationMinutes,
    assignedAt: now.toISOString(),
    expiresAt,
    hasSubmitted: false,
    sampleTestCase: problem.testCases?.find(t => !t.isHidden) || { input: '', expectedOutput: expectedOut },
    serverTime: now.getTime()
  };

  if (assignAll) {
    // Assign and push to all students (or filtered by targetLanguage)
    let students = db.getAllStudents();
    if (targetLanguage && targetLanguage !== 'ALL') {
      const normTarget = targetLanguage.toLowerCase() === 'c++' ? 'cpp' : (targetLanguage.toLowerCase() === 'py' ? 'python' : targetLanguage.toLowerCase());
      students = students.filter(s => {
        let sLang = (s.preferredLanguage || 'python').toLowerCase();
        if (sLang === 'py') sLang = 'python';
        if (sLang === 'c++') sLang = 'cpp';
        return sLang === normTarget;
      });
    }

    const errors = [];
    const results = [];

    students.forEach(s => {
      try {
        const assignment = db.assignProblemToStudent(s.id, problemId, shouldResetCode);
        const studentPayload = {
          ...problemPayload,
          currentCode: assignment.currentCode || problem.starterCode
        };
        const online = socketManager.pushProblemToStudent(s.id, studentPayload);
        results.push({ studentId: s.id, username: s.username, online });
      } catch (err) {
        errors.push({ studentId: s.id, username: s.username, error: err.message });
      }
    });

    socketManager.broadcastToAdmins({ type: 'STUDENTS_UPDATED' });

    return res.json({
      message: `Assigned problem '${problem.title}' (⏱️ ${durationMinutes} mins) to ${results.length}/${students.length} students`,
      results,
      errors
    });
  }

  if (!studentId) {
    return res.status(400).json({ error: 'studentId or assignAll must be specified' });
  }

  // Assign to single student in database (with configurable resetCode)
  const assignment = db.assignProblemToStudent(studentId, problemId, shouldResetCode);

  const studentPayload = {
    ...problemPayload,
    currentCode: assignment.currentCode || problem.starterCode
  };

  // Push over LAN via WebSocket
  const isOnline = socketManager.pushProblemToStudent(studentId, studentPayload);

  // Notify admins of updated status
  socketManager.broadcastToAdmins({ type: 'STUDENTS_UPDATED' });

  res.json({
    message: `Assigned problem '${problem.title}' (⏱️ ${durationMinutes} mins) to student`,
    studentId,
    deliveredImmediately: isOnline
  });
});

// --- Multi-Language Simultaneous Contest Kickoff (BUG-ML-01 to BUG-ML-09) ---
router.post('/assign-multi-language', (req, res) => {
  const { problemMap, resetCode, force } = req.body;
  const shouldResetCode = resetCode !== false;

  // 1. Kickoff Mutex & Debounce Protection (BUG-ML-08)
  const nowMs = Date.now();
  if (isKickoffInProgress) {
    return res.status(429).json({
      success: false,
      error: 'KICKOFF_IN_PROGRESS',
      message: 'A contest kickoff is currently in progress. Please wait for it to complete.'
    });
  }

  if (!force && (nowMs - lastKickoffTimestamp < 1500)) {
    return res.status(429).json({
      success: false,
      error: 'KICKOFF_DEBOUNCED',
      message: 'Duplicate kickoff prevented. A contest was launched moments ago.'
    });
  }

  if (!problemMap || typeof problemMap !== 'object' || Object.keys(problemMap).length === 0) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_PROBLEM_MAP',
      message: 'problemMap is required (e.g. { python: "id1", c: "id2", cpp: "id3" })'
    });
  }

  isKickoffInProgress = true;

  try {
    // ==========================================
    // PHASE 1: VALIDATE (BUG-ML-02 & BUG-ML-03)
    // ==========================================
    const loadedProblems = {};
    const validationErrors = [];

    for (const [rawLangKey, pId] of Object.entries(problemMap)) {
      if (!pId) continue;

      const normLangKey = normalizeLanguage(rawLangKey);
      if (!['python', 'c', 'cpp'].includes(normLangKey)) {
        validationErrors.push(`Unsupported target language key '${rawLangKey}'`);
        continue;
      }

      const prob = db.getProblemById(pId);
      if (!prob) {
        validationErrors.push(`Problem ID '${pId}' specified for ${normLangKey.toUpperCase()} was not found.`);
        continue;
      }

      // BUG-ML-02: Canonical server-side language validation
      const normProbLang = normalizeLanguage(prob.language);
      if (normProbLang !== normLangKey) {
        validationErrors.push(
          `Language mismatch: Problem '${prob.title}' is a ${normProbLang.toUpperCase()} problem, but was assigned to the ${normLangKey.toUpperCase()} group.`
        );
        continue;
      }

      loadedProblems[normLangKey] = prob;
    }

    if (validationErrors.length > 0) {
      isKickoffInProgress = false;
      return res.status(400).json({
        success: false,
        error: 'INVALID_PROBLEM_LANGUAGE',
        message: validationErrors.join(' | '),
        details: validationErrors
      });
    }

    if (Object.keys(loadedProblems).length === 0) {
      isKickoffInProgress = false;
      return res.status(400).json({
        success: false,
        error: 'NO_PROBLEMS_SPECIFIED',
        message: 'No valid problems were selected for assignment.'
      });
    }

    // ==========================================
    // PHASE 2: PREPARE (BUG-ML-01 & BUG-ML-09)
    // ==========================================
    const students = db.getAllStudents();
    const contestStartAtMs = Date.now();
    const contestId = `contest_${contestStartAtMs}_${Math.random().toString(36).substring(2, 7)}`;
    const assignedAtIso = new Date(contestStartAtMs).toISOString();

    const batchAssignments = [];
    const unassignedList = [];
    const languageCounts = { python: 0, c: 0, cpp: 0 };

    for (const s of students) {
      const studentLang = normalizeLanguage(s.preferredLanguage || 'python');
      const matchedProb = loadedProblems[studentLang];

      if (!matchedProb) {
        unassignedList.push({
          studentId: s.id,
          username: s.username,
          name: s.name,
          preferredLanguage: studentLang,
          reason: `No problem was mapped for language '${studentLang}'`
        });
        continue;
      }

      batchAssignments.push({
        studentId: s.id,
        problemId: matchedProb.id,
        student: s,
        problem: matchedProb,
        studentLang
      });

      if (languageCounts[studentLang] !== undefined) {
        languageCounts[studentLang]++;
      }
    }

    // ==========================================
    // PHASE 3: COMMIT (BUG-ML-03: Atomic Batch)
    // ==========================================
    const batchResult = db.assignContestBatch({
      contestId,
      contestStartAt: contestStartAtMs,
      assignments: batchAssignments.map(b => ({ studentId: b.studentId, problemId: b.problemId })),
      resetCode: shouldResetCode
    });

    // ==========================================
    // PHASE 4: NOTIFY (BUG-ML-04: Fast WebSocket Delivery)
    // ==========================================
    let liveDeliveredCount = 0;
    let offlineCount = 0;
    const results = [];

    for (const b of batchAssignments) {
      const { student, problem, studentLang } = b;
      const durationMinutes = Math.max(1, problem.durationMinutes || 15);
      const expiresAt = new Date(contestStartAtMs + durationMinutes * 60 * 1000).toISOString();
      const expectedOut = problem.expectedOutput || (problem.testCases && problem.testCases[0]?.expectedOutput) || '';

      const studentAssignment = batchResult.assignments.find(a => a.studentId === student.id);

      const studentPayload = {
        contestId,
        problemId: problem.id,
        title: problem.title,
        language: problem.language,
        filename: problem.filename,
        description: problem.description,
        starterCode: problem.starterCode,
        currentCode: studentAssignment?.currentCode || problem.starterCode,
        expectedOutput: expectedOut,
        durationMinutes,
        assignedAt: assignedAtIso,
        contestStartAt: contestStartAtMs,
        expiresAt,
        hasSubmitted: false,
        sampleTestCase: problem.testCases?.find(t => !t.isHidden) || { input: '', expectedOutput: expectedOut },
        serverTime: Date.now()
      };

      const online = socketManager.pushProblemToStudent(student.id, studentPayload);
      if (online) {
        liveDeliveredCount++;
      } else {
        offlineCount++;
      }

      results.push({
        studentId: student.id,
        username: student.username,
        name: student.name,
        language: studentLang,
        problemTitle: problem.title,
        online,
        deliveredLive: online
      });
    }

    // Broadcast update to all connected admins
    socketManager.broadcastToAdmins({ type: 'STUDENTS_UPDATED' });
    lastKickoffTimestamp = Date.now();

    // ==========================================
    // PHASE 5: REPORT (BUG-ML-05: Accurate Structured Report)
    // ==========================================
    res.json({
      success: true,
      contestId,
      contestStartAt: contestStartAtMs,
      assignedAt: assignedAtIso,
      totalStudents: students.length,
      assignedCount: batchAssignments.length,
      liveDelivered: liveDeliveredCount,
      offlineCount,
      failedCount: 0,
      languageCounts,
      unassigned: unassignedList,
      results,
      message: `🚀 Multi-language contest launched! Assigned ${batchAssignments.length}/${students.length} students (${liveDeliveredCount} live on LAN, ${offlineCount} offline recovery).`
    });

  } catch (err) {
    console.error('Multi-language kickoff error:', err);
    res.status(500).json({
      success: false,
      error: 'KICKOFF_FAILED',
      message: 'Kickoff failed: ' + err.message
    });
  } finally {
    isKickoffInProgress = false;
  }
});

// --- Submissions View (with Full Raw Compiler Diagnostics) ---
router.get('/submissions', (req, res) => {
  const submissions = db.getSubmissionsForAdmin();
  res.json(submissions);
});

// Clear all contest submissions
router.delete('/submissions', (req, res) => {
  try {
    const result = db.clearAllSubmissions();
    socketManager.broadcastToAdmins({ type: 'STUDENTS_UPDATED' });
    res.json({ success: true, count: result.count, message: `Cleared ${result.count} submissions.` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
