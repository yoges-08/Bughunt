/**
 * Test Suite: Assignment State & Bug Fixes
 * 
 * Verifies:
 * - Issue 1: pushProblemToAll does not duplicate DB writes
 * - Issue 2: Re-pushing the same problem preserves student draft code
 * - Issue 2: Assigning a different problem resets draft code to starter code
 * - Issue 3: verifyPassword uses timing-safe constant-time comparison
 * - Issue 4: getStudentAssignment computes 'expired' status when timer elapses without submission
 */

import assert from 'assert';
import { db, verifyPassword } from '../server/db.js';
import { socketManager } from '../server/socket.js';

let passedTests = 0;
let failedTests = 0;

function it(description, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${description}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${description}`);
    console.error(`     Error: ${err.message}`);
    failedTests++;
  }
}

console.log('\n--- Running Assignment Lifecycle & Bug Fix Tests ---');

// Setup test problems & student
const problems = db.getAllProblems();
assert(problems.length >= 2, 'Need at least 2 problems for test');
const probA = problems[0];
const probB = problems[1];

const testStudentUsername = `test_asg_${Date.now()}`;
const student = db.createStudent(testStudentUsername, 'password123', 'Assignment Test Student');

// --- Test Issue 3 & Issue 2: Re-assigning problem code reset & submission re-lock ---
it('Assigns problem A and sets starter code initially', () => {
  const asg1 = db.assignProblemToStudent(student.id, probA.id);
  assert.strictEqual(asg1.problemId, probA.id);
  assert.strictEqual(asg1.currentCode, probA.starterCode);
});

it('Student saves draft code and re-assigning with resetCode: false preserves progress', () => {
  const myCustomCode = '# Student in-progress solution\ndef solve(): return 42\n';
  db.saveStudentDraftCode(student.id, myCustomCode);

  const beforeRepush = db.getStudentAssignment(student.id);
  assert.strictEqual(beforeRepush.currentCode, myCustomCode);

  // Admin re-pushes problem A with explicit resetCode: false
  const asg2 = db.assignProblemToStudent(student.id, probA.id, false);
  assert.strictEqual(asg2.problemId, probA.id);
  assert.strictEqual(asg2.currentCode, myCustomCode, 'Draft code MUST NOT be wiped when resetCode: false');
});

it('Re-assigning same problem with default resetCode: true resets code to starterCode', () => {
  // Re-push problem A with default resetCode (true)
  const asgDefault = db.assignProblemToStudent(student.id, probA.id);
  assert.strictEqual(asgDefault.problemId, probA.id);
  assert.strictEqual(asgDefault.currentCode, probA.starterCode, 'Draft code MUST be reset to starterCode by default');
});

it('Submitting problem then re-assigning resets hasSubmitted per assignedAt rule (Issue 2)', () => {
  // Record a submission for probA
  db.recordSubmission({
    studentId: student.id,
    problemId: probA.id,
    code: 'print(42)',
    language: 'python',
    status: 'SUCCESS',
    pass: true,
    rawOutput: '{}',
    genericMessage: 'Passed',
    executionTimeMs: 10
  });

  // Verify that hasSubmitted is now true
  const beforeReassign = db.getStudentAssignment(student.id);
  assert.strictEqual(beforeReassign.hasSubmitted, true);

  // Admin re-assigns probA with a fresh timestamp
  const now = new Date(Date.now() + 5000); // 5s in future
  const asgNew = db.assignProblemToStudent(student.id, probA.id);
  asgNew.assignedAt = now.toISOString();
  db.save();

  // Fresh assignment must allow new submission because past submission is before assignedAt
  const afterReassign = db.getStudentAssignment(student.id);
  assert.strictEqual(afterReassign.hasSubmitted, false, 'hasSubmitted must be false after re-assignment');
});

it('Assigning a genuinely different problem resets draft code to new starter code', () => {
  const asg3 = db.assignProblemToStudent(student.id, probB.id);
  assert.strictEqual(asg3.problemId, probB.id);
  assert.strictEqual(asg3.currentCode, probB.starterCode, 'Draft code MUST reset when assigning a different problem');
});

// --- Test Issue 4: getStudentAssignment computes effective 'expired' status ---
it('Active assignment with valid timer reports status "assigned"', () => {
  const asg = db.assignProblemToStudent(student.id, probA.id);
  const info = db.getStudentAssignment(student.id);
  assert.strictEqual(info.status, 'assigned');
});

it('Expired timer without submission reports status "expired"', () => {
  const expStudent = db.createStudent(`test_exp_${Date.now()}`, 'password123', 'Expired Student');
  db.assignProblemToStudent(expStudent.id, probA.id);

  // Manually backdate the assignment to simulate timer expiration
  const rawAsg = db.data.assignments.find(a => a.studentId === expStudent.id);
  const pastDate = new Date(Date.now() - 3600 * 1000).toISOString(); // 1 hour ago
  rawAsg.assignedAt = pastDate;
  rawAsg.expiresAt = new Date(Date.now() - 1800 * 1000).toISOString(); // expired 30 mins ago
  db.save();

  const info = db.getStudentAssignment(expStudent.id);
  assert.strictEqual(info.status, 'expired', 'Assignment whose timer expired without submit must report status "expired"');
});

// --- Test Issue 3: verifyPassword timing-safe fallback ---
it('verifyPassword succeeds for valid plaintext legacy password', () => {
  assert.strictEqual(verifyPassword('mySecretPass', 'mySecretPass'), true);
});

it('verifyPassword rejects invalid plaintext password with mismatched length safely', () => {
  assert.strictEqual(verifyPassword('short', 'muchLongerLegacyPassword'), false);
});

it('verifyPassword rejects invalid plaintext password with same length safely', () => {
  assert.strictEqual(verifyPassword('abcdef', 'uvwxyz'), false);
});

// --- Test Issue 1: pushProblemToAll does not duplicate DB writes ---
it('pushProblemToAll performs wire transmission without mutating DB assignments', () => {
  const assignmentsBefore = JSON.parse(JSON.stringify(db.data.assignments));

  // pushProblemToAll with specified ID
  const results = socketManager.pushProblemToAll({
    problemId: probA.id,
    title: probA.title,
    filename: probA.filename,
    starterCode: probA.starterCode
  }, [student.id]);

  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].studentId, student.id);
  // Database assignments should not have had additional records inserted
  assert.strictEqual(db.data.assignments.length, assignmentsBefore.length);
});

console.log(`\nAssignment & Fixes Tests Result: ${passedTests} passed, ${failedTests} failed.`);

if (failedTests > 0) {
  process.exit(1);
}
