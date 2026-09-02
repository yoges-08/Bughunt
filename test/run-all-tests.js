/**
 * Master Test Runner for Bug Hunt
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const testFiles = [
  'sanitization.test.js',
  'auth.test.js',
  'compiler.test.js',
  'evaluator.test.js',
  'assignment.test.js'
];

async function runTestFile(file) {
  return new Promise((resolve, reject) => {
    console.log(`\n====================================================`);
    console.log(`🧪 RUNNING TEST SUITE: ${file}`);
    console.log(`====================================================`);

    const child = spawn(process.execPath, [path.join(__dirname, file)], {
      stdio: 'inherit',
      env: process.env
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Test file ${file} failed with exit code ${code}`));
      }
    });
  });
}

async function main() {
  console.log('🚀 Starting Bug Hunt Full Test Suite...\n');
  const startTime = Date.now();

  for (const file of testFiles) {
    await runTestFile(file);
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n🎉 ALL TEST SUITES PASSED SUCCESSFULLY! (${duration}s)\n`);
}

main().catch((err) => {
  console.error(`\n❌ TEST SUITE FAILURE:`, err.message);
  process.exit(1);
});
