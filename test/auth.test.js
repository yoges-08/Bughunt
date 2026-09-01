/**
 * Role-Based Authentication & Server-Side Security Tests
 */

import { generateToken, verifyToken, authenticateToken, requireRole } from '../server/auth.js';
import { db, hashPassword, verifyPassword } from '../server/db.js';

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

console.log('\n--- Running Role-Based Security & Password Tests ---');

// Test 1: User lookup & role verification
const adminUser = db.findUserByUsername('admin');
assert(adminUser !== undefined, 'Admin user exists in database');
assert(adminUser.role === 'admin', 'Admin user has role "admin"');

const studentUser = db.findUserByUsername('student1');
assert(studentUser !== undefined, 'Student user exists in database');
assert(studentUser.role === 'student', 'Student user has role "student"');

// Test 2: Cryptographic password hashing & verification
assert(adminUser.password.startsWith('scrypt$'), 'Admin password is encrypted with scrypt hash');
assert(verifyPassword('admin123', adminUser.password) === true, 'Valid admin password passes scrypt verification');
assert(verifyPassword('wrongpassword', adminUser.password) === false, 'Invalid password rejected by scrypt verification');
assert(verifyPassword('pass1', studentUser.password) === true, 'Valid student password passes scrypt verification');

// Test 3: Token generation & payload integrity
const adminToken = generateToken(adminUser);
const studentToken = generateToken(studentUser);

const decodedAdmin = verifyToken(adminToken);
assert(decodedAdmin.role === 'admin', 'Decoded admin token contains role "admin"');
assert(decodedAdmin.id === adminUser.id, 'Decoded admin token matches admin ID');

const decodedStudent = verifyToken(studentToken);
assert(decodedStudent.role === 'student', 'Decoded student token contains role "student"');
assert(decodedStudent.id === studentUser.id, 'Decoded student token matches student ID');

// Test 4: authenticateToken middleware strictly requires Authorization: Bearer
let authHeaderSuccess = false;
const reqWithHeader = { headers: { authorization: `Bearer ${studentToken}` } };
const resMock = { status: () => ({ json: () => {} }) };
authenticateToken(reqWithHeader, resMock, () => {
  authHeaderSuccess = true;
});
assert(authHeaderSuccess === true, 'Bearer token in Authorization header successfully authenticates');

let authQueryBlocked = false;
let authQueryStatusCode = 0;
const reqWithQuery = { headers: {}, query: { token: studentToken } };
const resQueryMock = {
  status: function(code) {
    authQueryStatusCode = code;
    return {
      json: function() {
        authQueryBlocked = true;
      }
    };
  }
};
authenticateToken(reqWithQuery, resQueryMock, () => {});
assert(authQueryBlocked === true && authQueryStatusCode === 401, 'URL query string token is strictly rejected');

// Test 5: requireRole middleware blocking student from admin role
const requireAdminMiddleware = requireRole('admin');

let studentBlocked = false;
let studentStatusCode = 0;
const reqStudent = { user: { id: studentUser.id, role: 'student', username: 'student1' } };
const resStudent = {
  status: function(code) {
    studentStatusCode = code;
    return {
      json: function() {
        studentBlocked = true;
      }
    };
  }
};
let nextCalledForStudent = false;

requireAdminMiddleware(reqStudent, resStudent, () => {
  nextCalledForStudent = true;
});

assert(studentBlocked === true, 'Server blocked student from invoking admin action');
assert(studentStatusCode === 403, 'Server returned 403 Forbidden to student');
assert(nextCalledForStudent === false, 'Student request was NOT allowed to proceed to handler');

// Test 6: requireRole middleware allowing admin
let adminAllowed = false;
const reqAdmin = { user: { id: adminUser.id, role: 'admin', username: 'admin' } };
const resAdmin = { status: () => ({ json: () => {} }) };

requireAdminMiddleware(reqAdmin, resAdmin, () => {
  adminAllowed = true;
});

assert(adminAllowed === true, 'Admin was permitted to proceed to admin handler');

console.log(`\nAuth & Security Tests Result: ${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
