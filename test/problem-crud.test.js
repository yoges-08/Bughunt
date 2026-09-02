/**
 * Problem Bank CRUD & Guardrail Tests
 */

import assert from 'assert';
import { db } from '../server/db.js';
import { formatTimer, formatDuration } from '../src/utils/time.js';

let passed = 0;
let failed = 0;

function it(desc, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${desc}`);
    console.error(`     Error: ${err.message}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n--- Running Problem Bank CRUD & Guardrail Tests ---');

  // --- Feature 1: formatTimer tests ---
  it('formatTimer formats mm.ss correctly with dot separator', () => {
    assert.strictEqual(formatTimer(null), '--.--');
    assert.strictEqual(formatTimer(undefined), '--.--');
    assert.strictEqual(formatTimer(0), '00.00');
    assert.strictEqual(formatTimer(59), '00.59');
    assert.strictEqual(formatTimer(60), '01.00');
    assert.strictEqual(formatTimer(959), '15.59');
    assert.strictEqual(formatTimer(958), '15.58');
  });

  // --- formatDuration tests ---
  it('formatDuration formats seconds, minutes, and hours accurately', () => {
    assert.strictEqual(formatDuration(null), '--');
    assert.strictEqual(formatDuration(undefined), '--');
    assert.strictEqual(formatDuration(0), '0s');
    assert.strictEqual(formatDuration(45), '45s');
    assert.strictEqual(formatDuration(60), '1m 00s');
    assert.strictEqual(formatDuration(75), '1m 15s');
    assert.strictEqual(formatDuration(252), '4m 12s');
    assert.strictEqual(formatDuration(3665), '1h 1m 5s');
  });

  // Create a problem for testing
  const initialProb = db.createProblem({
    title: 'Test Problem for CRUD',
    language: 'python',
    filename: 'crud_test.py',
    description: 'Initial description',
    starterCode: '# starter code\ndef solve(): pass',
    testCases: [{ input: '1', expectedOutput: '2', isHidden: false }],
    durationMinutes: 20,
    timeLimitMs: 2500
  });

  // --- Feature 3: updateProblem unit tests ---
  it('updateProblem updates title, description, and timer', () => {
    const updated = db.updateProblem(initialProb.id, {
      title: 'Updated Problem Title',
      description: 'Updated description',
      durationMinutes: 30
    });
    assert.strictEqual(updated.title, 'Updated Problem Title');
    assert.strictEqual(updated.description, 'Updated description');
    assert.strictEqual(updated.durationMinutes, 30);
    assert.strictEqual(updated.language, 'python'); // unchanged
    assert(updated.updatedAt, 'updatedAt timestamp must be set');
  });

  it('updateProblem validates language whitelist', () => {
    assert.throws(() => {
      db.updateProblem(initialProb.id, { language: 'ruby' });
    }, /Language must be one of: python, c, cpp/);
  });

  it('updateProblem rejects path traversal in filename', () => {
    assert.throws(() => {
      db.updateProblem(initialProb.id, { filename: '../secret.py' });
    }, /Invalid filename/);
  });

  it('updateProblem rejects empty testCases array', () => {
    assert.throws(() => {
      db.updateProblem(initialProb.id, { testCases: [] });
    }, /Problem must contain at least one test case/);
  });

  it('updateProblem throws for non-existent problem id', () => {
    assert.throws(() => {
      db.updateProblem('non_existent_id_12345', { title: 'Test' });
    }, /Problem non_existent_id_12345 not found/);
  });

  // --- Snapshot Preservation: In-flight assignment not altered by edit ---
  it('Editing a problem does NOT retroactively mutate in-flight assignment currentCode', () => {
    const student = db.createStudent(`crud_student_${Date.now()}`, 'password123', 'CRUD Student');
    const asg = db.assignProblemToStudent(student.id, initialProb.id);
    const originalDraft = asg.currentCode;

    // Admin updates the problem starterCode in Problem Bank
    db.updateProblem(initialProb.id, {
      starterCode: '# BRAND NEW STARTER CODE v2\ndef solve(): return 999\n'
    });

    // In-flight assignment must retain its snapshotted code
    const studentAsg = db.getStudentAssignment(student.id);
    assert.strictEqual(studentAsg.currentCode, originalDraft, 'In-flight student code must NOT be modified by bank edit');
  });

  // --- Feature 2: deleteProblem unit tests & reference guardrail ---
  it('deleteProblem throws for non-existent id', () => {
    assert.throws(() => {
      db.deleteProblem('non_existent_id_99999');
    }, /Problem non_existent_id_99999 not found/);
  });

  it('Reference guardrail logic: detects active references in assignments/submissions', () => {
    const dummyProblem = db.createProblem({
      title: 'Referenced Problem',
      language: 'python',
      filename: 'ref.py',
      starterCode: 'print(1)',
      testCases: [{ input: '1', expectedOutput: '1' }]
    });

    const student = db.createStudent(`ref_student_${Date.now()}`, 'password123', 'Ref Student');
    db.assignProblemToStudent(student.id, dummyProblem.id);

    const assignedCount = db.data.assignments.filter(a => a.problemId === dummyProblem.id).length;
    assert.strictEqual(assignedCount, 1, 'Assigned count is 1');

    // Simulate route logic: without force, delete is rejected
    const force = undefined;
    const isBlocked = (assignedCount > 0) && force !== 'true';
    assert.strictEqual(isBlocked, true, 'Guardrail blocks deletion when referenced without force');

    // With force = true, delete proceeds and historical records remain
    const deleted = db.deleteProblem(dummyProblem.id);
    assert.strictEqual(deleted.id, dummyProblem.id);
    assert.strictEqual(db.getProblemById(dummyProblem.id), undefined);

    // Assignment remains intact for auditing
    const remainingAsg = db.data.assignments.find(a => a.problemId === dummyProblem.id);
    assert(remainingAsg, 'Historical assignment record preserved after forced deletion');
  });

  it('deleteProblem successfully deletes unreferenced problem', () => {
    const unrefProb = db.createProblem({
      title: 'Unreferenced Problem',
      language: 'python',
      filename: 'unref.py',
      starterCode: 'print(10)',
      testCases: [{ input: '1', expectedOutput: '1' }]
    });

    const deleted = db.deleteProblem(unrefProb.id);
    assert.strictEqual(deleted.id, unrefProb.id);
    assert.strictEqual(db.getProblemById(unrefProb.id), undefined);
  });

  // --- Student Deletion Tests ---
  it('deleteStudent removes student, assignments, and submissions from DB', () => {
    const student = db.createStudent(`del_student_${Date.now()}`, 'password123', 'Delete Student Test');
    const dummyProb = db.createProblem({
      title: 'Prob for Del Student',
      language: 'python',
      filename: 'del_prob.py',
      starterCode: 'pass',
      testCases: [{ input: '1', expectedOutput: '1' }]
    });

    db.assignProblemToStudent(student.id, dummyProb.id);
    db.recordSubmission({
      studentId: student.id,
      problemId: dummyProb.id,
      code: 'pass',
      language: 'python',
      status: 'SUCCESS',
      pass: true,
      rawOutput: '',
      genericMessage: 'Passed',
      executionTimeMs: 10
    });

    assert(db.findUserById(student.id), 'Student exists before deletion');
    assert(db.data.assignments.some(a => a.studentId === student.id), 'Assignment exists before deletion');
    assert(db.data.submissions.some(s => s.studentId === student.id), 'Submission exists before deletion');

    const removed = db.deleteStudent(student.id);
    assert.strictEqual(removed.id, student.id);
    assert.strictEqual(db.findUserById(student.id), undefined, 'Student must not exist after deletion');
    assert(!db.data.assignments.some(a => a.studentId === student.id), 'Assignment must be cleaned up');
    assert(!db.data.submissions.some(s => s.studentId === student.id), 'Submissions must be cleaned up');
  });

  it('deleteStudent throws for non-existent student id', () => {
    assert.throws(() => {
      db.deleteStudent('non_existent_student_id_888');
    }, /Student non_existent_student_id_888 not found/);
  });

  console.log(`\nProblem Bank CRUD Tests Result: ${passed} passed, ${failed} failed.\n`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
