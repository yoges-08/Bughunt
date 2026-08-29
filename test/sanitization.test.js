/**
 * Unit Tests for Sanitization Layer (Core Requirement 3)
 */

import { classifyExecutionResult, sanitizeForStudent, GENERIC_MESSAGES } from '../server/sanitization.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

console.log('\n--- Running Sanitization Layer Tests ---');

// Test 1: Successful run
const successRaw = {
  compileSuccess: true,
  runtimeSuccess: true,
  timedOut: false,
  exitCode: 0,
  stdout: 'Hello World\n',
  stderr: '',
  durationMs: 120
};
const successStudent = sanitizeForStudent(successRaw);
assert(successStudent.success === true, 'Success flag is true for clean run');
assert(successStudent.status === 'SUCCESS', 'Status is SUCCESS');
assert(successStudent.message === GENERIC_MESSAGES.SUCCESS, 'Message is "✅ Program Executed Successfully"');
assert(successStudent.stdout === undefined, 'Student payload does NOT leak stdout');
assert(successStudent.stderr === undefined, 'Student payload does NOT leak stderr');

// Test 2: Compilation / Syntax Error
const compileErrorRaw = {
  compileSuccess: false,
  runtimeSuccess: false,
  timedOut: false,
  exitCode: 1,
  stdout: '',
  stderr: 'main.c:5:10: error: expected ";" before "return"',
  rawError: 'gcc compilation failed with code 1',
  durationMs: 0
};
const compileErrorStudent = sanitizeForStudent(compileErrorRaw);
assert(compileErrorStudent.success === false, 'Success flag is false for compile error');
assert(compileErrorStudent.status === 'PROGRAM_ERROR', 'Status is PROGRAM_ERROR');
assert(compileErrorStudent.message === GENERIC_MESSAGES.PROGRAM_ERROR, 'Message is "❌ Program Error"');
assert(compileErrorStudent.stderr === undefined, 'Student payload does NOT leak compiler line numbers');
assert(compileErrorStudent.rawError === undefined, 'Student payload does NOT leak raw compiler error');

// Test 3: Runtime Error / Crash / Exception
const runtimeErrorRaw = {
  compileSuccess: true,
  runtimeSuccess: false,
  timedOut: false,
  exitCode: 139, // Segfault
  stdout: '',
  stderr: 'Segmentation fault (core dumped)',
  durationMs: 45
};
const runtimeErrorStudent = sanitizeForStudent(runtimeErrorRaw);
assert(runtimeErrorStudent.success === false, 'Success flag is false for runtime crash');
assert(runtimeErrorStudent.status === 'EXECUTION_FAILED', 'Status is EXECUTION_FAILED');
assert(runtimeErrorStudent.message === GENERIC_MESSAGES.EXECUTION_FAILED, 'Message is "❌ Program Execution Failed"');
assert(runtimeErrorStudent.stderr === undefined, 'Student payload does NOT leak segmentation fault text');

// Test 4: Execution Timeout
const timeoutRaw = {
  compileSuccess: true,
  runtimeSuccess: false,
  timedOut: true,
  exitCode: -1,
  stdout: '',
  stderr: 'Execution timed out',
  durationMs: 3005
};
const timeoutStudent = sanitizeForStudent(timeoutRaw);
assert(timeoutStudent.success === false, 'Success flag is false for timeout');
assert(timeoutStudent.status === 'TIMEOUT', 'Status is TIMEOUT');
assert(timeoutStudent.message === GENERIC_MESSAGES.TIMEOUT, 'Message is "⏱ Program Execution Timed Out"');

// Test 5: Strict Payload Keys check
const keys = Object.keys(successStudent);
assert(
  keys.length === 3 && keys.includes('success') && keys.includes('status') && keys.includes('message'),
  'Student response contains strictly [success, status, message] keys only'
);

console.log(`\nSanitization Tests Result: ${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
