/**
 * Compiler & Execution Sandbox Tests
 */

import { executeCode } from '../server/compiler.js';

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
  console.log('\n--- Running Compiler Sandbox Tests ---');

  // Test 1: Python clean run with stdin
  const pyCode = `
import sys
data = sys.stdin.read().strip()
print(f"ECHO: {data}")
`;
  const res1 = await executeCode({
    code: pyCode,
    language: 'python',
    stdin: 'Testing 123',
    timeoutMs: 3000
  });

  assert(res1.compileSuccess === true, 'Python syntax passed');
  assert(res1.runtimeSuccess === true, 'Python execution succeeded');
  assert(res1.stdout.trim() === 'ECHO: Testing 123', 'Python stdout matches stdin echo');
  assert(res1.timedOut === false, 'Python did not time out');

  // Test 2: Python syntax error
  const pyBadSyntax = `
def broken(
  print("oops")
`;
  const res2 = await executeCode({
    code: pyBadSyntax,
    language: 'python',
    timeoutMs: 3000
  });
  assert(res2.compileSuccess === false, 'Python syntax error caught at compilation step');

  // Test 3: Python runtime crash
  const pyCrash = `
x = 10 / 0
`;
  const res3 = await executeCode({
    code: pyCrash,
    language: 'python',
    timeoutMs: 3000
  });
  assert(res3.runtimeSuccess === false, 'Python division by zero caught as runtime failure');
  assert(res3.exitCode !== 0, 'Exit code is non-zero');

  // Test 4: Execution timeout hard-kill
  const pyInfiniteLoop = `
import time
while True:
    time.sleep(0.1)
`;
  const res4 = await executeCode({
    code: pyInfiniteLoop,
    language: 'python',
    timeoutMs: 1000 // 1 second timeout test
  });
  assert(res4.timedOut === true, 'Infinite loop timed out within 1s');
  assert(res4.runtimeSuccess === false, 'Timed out process marked as not successful');

  console.log(`\nCompiler Tests Result: ${passed} passed, ${failed} failed.\n`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
