/**
 * End-to-End Integration & LAN Contest Flow Test
 * 
 * Simulates complete contest lifecycle:
 * 1. Server startup & LAN IP discovery
 * 2. Role-based login (Admin & Student)
 * 3. Server-side security check (Student forbidden from Admin APIs)
 * 4. Real-time WebSocket connection for Student
 * 5. Admin pushes problem file over LAN -> Student receives it instantly
 * 6. Student runs buggy code -> Output is strictly sanitized (no raw errors/stack traces)
 * 7. Student submits fixed solution -> Server independently re-verifies against hidden test cases
 * 8. Admin dashboard receives submission update with full internal diagnostics
 */

import { WebSocket } from 'ws';
import { startServer, server as runningServer } from '../server/server.js';

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

async function runE2ETest() {
  console.log('\n====================================================');
  console.log('🌐 RUNNING END-TO-END LAN CONTEST INTEGRATION TEST');
  console.log('====================================================\n');

  const TEST_PORT = 4555;
  await startServer(TEST_PORT);
  const baseUrl = `http://localhost:${TEST_PORT}`;

  try {
    // 1. Check System Info & LAN addresses
    const sysRes = await fetch(`${baseUrl}/api/system/info`);
    const sysInfo = await sysRes.json();
    assert(sysInfo.status === 'online', 'Server responds to system info endpoint');
    assert(Array.isArray(sysInfo.lanAddresses), 'Server detected local LAN network interfaces');

    // 2. Login as Admin
    const adminLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });
    const adminAuth = await adminLoginRes.json();
    assert(adminAuth.user.role === 'admin', 'Admin login successful with role "admin"');
    const adminToken = adminAuth.token;

    // 3. Login as Student
    const studentLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'student1', password: 'pass1' })
    });
    const studentAuth = await studentLoginRes.json();
    assert(studentAuth.user.role === 'student', 'Student login successful with role "student"');
    const studentToken = studentAuth.token;
    const studentId = studentAuth.user.id;

    // 4. Security Check: Student tries to access Admin endpoint
    const forbiddenRes = await fetch(`${baseUrl}/api/admin/overview`, {
      headers: { 'Authorization': `Bearer ${studentToken}` }
    });
    assert(forbiddenRes.status === 403, 'Server-side security: Student blocked with 403 Forbidden from admin overview');

    // 5. Connect Student WebSocket
    const wsUrl = `ws://localhost:${TEST_PORT}/ws?token=${studentToken}`;
    const ws = new WebSocket(wsUrl);

    let receivedProblem = null;
    await new Promise((resolve, reject) => {
      ws.on('open', () => {
        assert(true, 'Student WebSocket connected and authenticated successfully over LAN');
        resolve();
      });
      ws.on('error', reject);
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'PROBLEM_ASSIGNED') {
          receivedProblem = msg.payload;
        }
      } catch {}
    });

    // 6. Admin pushes Problem to Student 1
    const pushRes = await fetch(`${baseUrl}/api/admin/assign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        problemId: 'prob_py_palindrome',
        studentId: studentId
      })
    });
    const pushData = await pushRes.json();
    assert(pushRes.ok, 'Admin assign request succeeded');
    assert(pushData.deliveredImmediately === true, 'Problem delivered immediately to online student socket');

    // Wait 500ms for WebSocket push packet to arrive at student
    await new Promise(r => setTimeout(r, 500));
    assert(receivedProblem !== null, 'Student client received PROBLEM_ASSIGNED event over WebSocket');
    assert(receivedProblem.filename === 'palindrome_checker.py', 'Received problem matches assigned filename');
    assert(receivedProblem.starterCode.length > 20, 'Received problem contains starter code ready in editor');

    // 7. Student runs original buggy code locally
    const runBuggyRes = await fetch(`${baseUrl}/api/student/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studentToken}`
      },
      body: JSON.stringify({
        code: receivedProblem.starterCode,
        language: 'python',
        stdin: 'Race car\n'
      })
    });
    const buggyResult = await runBuggyRes.json();
    assert(buggyResult.success === false, 'Student RUN with buggy code returns failure');
    assert(buggyResult.status === 'EXECUTION_FAILED' || buggyResult.status === 'PROGRAM_ERROR', 'Status is generic error code');
    assert(buggyResult.stdout === undefined, 'No raw stdout leaked in student RUN response');
    assert(buggyResult.stderr === undefined, 'No raw stderr leaked in student RUN response');
    assert(buggyResult.message.startsWith('❌'), 'Student message is properly sanitized pass/fail message');

    // 8. Student submits fixed code
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
    const submitRes = await fetch(`${baseUrl}/api/student/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studentToken}`
      },
      body: JSON.stringify({
        problemId: 'prob_py_palindrome',
        code: fixedCode,
        language: 'python'
      })
    });
    const submitData = await submitRes.json();
    assert(submitData.success === true, 'Server-side re-verification passes for corrected code');
    assert(submitData.status === 'SUCCESS', 'Submission status is SUCCESS');
    assert(submitData.message === '✅ Program Executed Successfully', 'Student sees "✅ Program Executed Successfully"');

    // 9. Admin fetches submissions list and inspects full diagnostics
    const adminSubsRes = await fetch(`${baseUrl}/api/admin/submissions`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const adminSubs = await adminSubsRes.json();
    assert(adminSubs.length > 0, 'Admin can view all recorded submissions');
    const latestSub = adminSubs[0];
    assert(latestSub.pass === true, 'Submission is marked as PASS in Admin dashboard');
    assert(latestSub.studentUsername === 'student1', 'Admin view identifies student');
    assert(typeof latestSub.rawOutput === 'string', 'Admin view includes full internal raw diagnostic output');

    // Cleanup
    ws.close();
    runningServer.close();

    console.log(`\nEnd-to-End Test Result: ${passed} passed, ${failed} failed.\n`);
    if (failed > 0) process.exit(1);

  } catch (err) {
    console.error('E2E Test Error:', err);
    runningServer.close();
    process.exit(1);
  }
}

runE2ETest();
