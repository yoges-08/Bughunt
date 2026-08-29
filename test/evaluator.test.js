/**
 * Evaluator & Independent Server-Side Verification Tests
 */

import { evaluateSubmission } from '../server/evaluator.js';
import { db } from '../server/db.js';

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

async function runTests() {
  console.log('\n--- Running Independent Evaluator Tests ---');

  const student = db.findUserByUsername('student1');
  const problem = db.getProblemById('prob_py_palindrome');

  // Test 1: Submitting original buggy code should fail evaluation
  const buggySubmission = await evaluateSubmission({
    studentId: student.id,
    problemId: problem.id,
    code: problem.starterCode,
    language: 'python'
  });

  assert(buggySubmission.studentResult.success === false, 'Buggy code fails evaluation');
  assert(buggySubmission.studentResult.status === 'EXECUTION_FAILED' || buggySubmission.studentResult.status === 'PROGRAM_ERROR', 'Student gets generic failure status');
  assert(buggySubmission.studentResult.message.includes('❌'), 'Student message has failure icon');
  assert(buggySubmission.studentResult.stdout === undefined, 'Student response does NOT contain stdout');
  assert(buggySubmission.studentResult.testResults === undefined, 'Student response does NOT contain test case breakdown');

  // Verify Admin payload DOES have full details
  assert(buggySubmission.adminResult.testResults.length > 0, 'Admin receives detailed test case results');

  // Test 2: Submitting corrected code should pass evaluation
  const fixedCode = `
def is_palindrome(s):
    cleaned = "".join(ch.lower() for ch in s if ch.isalnum())
    return cleaned == cleaned[::-1]

if __name__ == "__main__":
    import sys
    lines = sys.stdin.read().strip().splitlines()
    for line in lines:
        if line.strip():
            print("YES" if is_palindrome(line) else "NO")
`;

  const fixedSubmission = await evaluateSubmission({
    studentId: student.id,
    problemId: problem.id,
    code: fixedCode,
    language: 'python'
  });

  assert(fixedSubmission.studentResult.success === true, 'Fixed code passes all test cases');
  assert(fixedSubmission.studentResult.status === 'SUCCESS', 'Status is SUCCESS');
  assert(fixedSubmission.studentResult.message === '✅ Program Executed Successfully', 'Message is "✅ Program Executed Successfully"');

  // Verify DB record
  const studentSubs = db.getStudentSubmissions(student.id);
  assert(studentSubs.length >= 2, 'Submissions recorded in DB');
  assert(studentSubs[0].pass === true, 'Latest submission in DB marked as pass');

  console.log(`\nEvaluator Tests Result: ${passed} passed, ${failed} failed.\n`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
