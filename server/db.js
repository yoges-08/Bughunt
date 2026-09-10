/**
 * Embedded Persistent Database for Bug Hunt
 * 
 * Provides an ACID-like file-backed JSON store with in-memory caching and atomic writes.
 * Supports accounts (Admin/Student), Buggy Problems, Assignments, and Submissions.
 * Includes cryptographic password hashing (scrypt) and automated legacy migration.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isTestEnv = process.env.NODE_ENV === 'test' || process.env.TEST_DB === 'true';
const DB_FILE = isTestEnv
  ? path.resolve(__dirname, '..', 'data', 'test_contest_db.json')
  : path.resolve(__dirname, '..', 'data', 'contest_db.json');

/**
 * Hash a plain text password using cryptographic scrypt with a unique random salt
 */
export function hashPassword(plainPassword) {
  if (typeof plainPassword !== 'string' || !plainPassword) {
    throw new Error('Password must be a non-empty string');
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(plainPassword, salt, 64);
  return `scrypt$${salt}$${derivedKey.toString('hex')}`;
}

/**
 * Verify a plain text password against a stored scrypt hash (or fallback during migration)
 */
export function verifyPassword(plainPassword, storedHash) {
  if (!plainPassword || !storedHash || typeof storedHash !== 'string') {
    return false;
  }
  
  if (storedHash.startsWith('scrypt$')) {
    const parts = storedHash.split('$');
    if (parts.length !== 3) return false;
    const [, salt, expectedHex] = parts;
    const keyBuffer = Buffer.from(expectedHex, 'hex');
    const derivedKey = crypto.scryptSync(plainPassword, salt, 64);
    return crypto.timingSafeEqual(keyBuffer, derivedKey);
  }

  // Fallback for unmigrated legacy plaintext comparison with timing-safe comparison
  const a = Buffer.from(plainPassword);
  const b = Buffer.from(storedHash);
  if (a.length !== b.length) {
    crypto.timingSafeEqual(a, a);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

// Initial seed data with default admin, students, and sample bug-hunt problems
const INITIAL_DB = {
  users: [
    {
      id: 'usr_admin',
      username: 'admin',
      password: hashPassword('admin123'),
      role: 'admin',
      name: 'Contest Administrator',
      createdAt: new Date().toISOString()
    },
    {
      id: 'usr_student_1',
      username: 'student1',
      password: hashPassword('pass1'),
      role: 'student',
      name: 'Alice Johnson (Team A)',
      createdAt: new Date().toISOString()
    },
    {
      id: 'usr_student_2',
      username: 'student2',
      password: hashPassword('pass2'),
      role: 'student',
      name: 'Bob Smith (Team B)',
      createdAt: new Date().toISOString()
    },
    {
      id: 'usr_student_3',
      username: 'student3',
      password: hashPassword('pass3'),
      role: 'student',
      name: 'Charlie Davis (Team C)',
      createdAt: new Date().toISOString()
    },
    {
      id: 'usr_student_4',
      username: 'student4',
      password: hashPassword('pass4'),
      role: 'student',
      name: 'Dana Lee (Team D)',
      createdAt: new Date().toISOString()
    }
  ],
  problems: [
    {
      id: 'prob_py_palindrome',
      title: 'Fix Palindrome & Whitespace Bug',
      language: 'python',
      filename: 'palindrome_checker.py',
      description: 'The given function is supposed to check if strings are palindromes ignoring case and spaces. Fix the logic and index bounds error to produce the expected output.',
      starterCode: `# Bug Hunt Challenge: Palindrome Checker
# Fix the bugs so the output matches the expected output:
# Race car -> YES
# madam -> YES
# hello -> NO

import sys

def is_palindrome(s):
    # BUG 1: Case conversion missed
    cleaned = ""
    for ch in s:
        if ch.isalnum():
            cleaned += ch  # Bug: should normalize case

    # BUG 2: Off-by-one error in manual reversal
    left = 0
    right = len(cleaned) # BUG: should be len(cleaned) - 1

    while left < right:
        if cleaned[left] != cleaned[right]:
            return False
        left += 1
        right -= 1
    return True

if __name__ == "__main__":
    lines = sys.stdin.read().splitlines()
    for line in lines:
        if line.strip():
            print("YES" if is_palindrome(line) else "NO")
`,
      expectedOutput: "YES\nYES\nNO",
      testCases: [
        { input: "Race car\nmadam\nhello\n", expectedOutput: "YES\nYES\nNO", isHidden: false }
      ],
      timeLimitMs: 3000,
      durationMinutes: 15,
      createdAt: new Date().toISOString()
    },
    {
      id: 'prob_cpp_binary_search',
      title: 'Fix Binary Search Off-by-One',
      language: 'cpp',
      filename: 'binary_search.cpp',
      description: 'A classic binary search implementation with boundary index bugs and integer overflow issue. Fix it to produce the expected indices.',
      starterCode: `// Bug Hunt Challenge: Binary Search
// Fix the bugs so the program returns the 0-based index of target, or -1 if not found.

#include <iostream>
#include <vector>

int binarySearch(const std::vector<int>& arr, int target) {
    int left = 0;
    // BUG 1: Should be arr.size() - 1
    int right = arr.size(); 

    // BUG 2: Condition should be left <= right
    while (left < right) {
        int mid = (left + right) / 2;
        if (arr[mid] == target) {
            return mid;
        } else if (arr[mid] < target) {
            left = mid; // BUG 3: Should be mid + 1
        } else {
            right = mid; // BUG 4: Should be mid - 1
        }
    }
    return -1;
}

int main() {
    std::vector<int> arr = {1, 3, 5, 7, 9};
    std::vector<int> targets = {7, 1, 9, 4};
    for (int t : targets) {
        std::cout << binarySearch(arr, t) << std::endl;
    }
    return 0;
}
`,
      expectedOutput: "3\n0\n4\n-1",
      testCases: [
        { input: "", expectedOutput: "3\n0\n4\n-1", isHidden: false }
      ],
      timeLimitMs: 3000,
      durationMinutes: 20,
      createdAt: new Date().toISOString()
    },
    {
      id: 'prob_c_array_max',
      title: 'Fix Array Maximum and Memory Bounds',
      language: 'c',
      filename: 'array_max.c',
      description: 'Find the maximum element and its count in an integer array. Fix the initialization bug and out-of-bounds loop.',
      starterCode: `/* Bug Hunt Challenge: Array Maximum & Frequency
   Find the maximum element and its count.
   Expected Output: "5 2"
*/
#include <stdio.h>

void find_max_and_count(int arr[], int n, int *out_max, int *out_count) {
    // BUG 1: Initializing max to 0 fails for all-negative arrays
    int max_val = 0;
    int count = 0;

    // BUG 2: Loop condition i <= n causes buffer over-read
    for (int i = 0; i <= n; i++) {
        if (arr[i] > max_val) {
            max_val = arr[i];
            count = 1;
        } else if (arr[i] == max_val) {
            count++;
        }
    }

    *out_max = max_val;
    *out_count = count;
}

int main() {
    int arr[] = {1, 5, 3, 5, 2};
    int n = sizeof(arr) / sizeof(arr[0]);
    int max_val, count;
    find_max_and_count(arr, n, &max_val, &count);
    printf("%d %d\\n", max_val, count);
    return 0;
}
`,
      expectedOutput: "5 2",
      testCases: [
        { input: "", expectedOutput: "5 2", isHidden: false }
      ],
      timeLimitMs: 3000,
      durationMinutes: 15,
      createdAt: new Date().toISOString()
    }
  ],
  assignments: [],
  submissions: [],
  contestSettings: {
    contestName: "Bug Hunt 2026 - LAN Championship",
    status: "active"
  }
};

class ContestDatabase {
  constructor() {
    this.data = null;
    this._saveTimer = null;
    this._isSaving = false;
    this._hasPendingSave = false;
    this.init();
  }

  init() {
    const dir = path.dirname(DB_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (!fs.existsSync(DB_FILE)) {
      this.data = JSON.parse(JSON.stringify(INITIAL_DB));
      this.saveSync();
    } else {
      try {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        this.data = JSON.parse(raw);

        // Ensure default contest users exist if missing
        if (!this.data.users || this.data.users.length === 0) {
          this.data.users = JSON.parse(JSON.stringify(INITIAL_DB.users));
          this.saveSync();
        } else if (!this.data.users.some(u => u.username === 'student1')) {
          const initialStudents = INITIAL_DB.users.filter(u => u.role === 'student');
          for (const s of initialStudents) {
            if (!this.data.users.some(u => u.username === s.username)) {
              this.data.users.push(JSON.parse(JSON.stringify(s)));
            }
          }
          this.saveSync();
        }

        // Ensure default contest problems exist if missing
        if (!this.data.problems || this.data.problems.length === 0) {
          this.data.problems = JSON.parse(JSON.stringify(INITIAL_DB.problems));
          this.saveSync();
        } else if (!this.data.problems.some(p => p.id === 'prob_py_palindrome')) {
          const seed = INITIAL_DB.problems.find(p => p.id === 'prob_py_palindrome');
          if (seed) {
            this.data.problems.push(JSON.parse(JSON.stringify(seed)));
            this.saveSync();
          }
        }
        // Automated migration: Hash any legacy plaintext passwords
        this.migratePlaintextPasswords();
      } catch (err) {
        console.error('Error reading database file, re-initializing:', err);
        this.data = JSON.parse(JSON.stringify(INITIAL_DB));
        this.saveSync();
      }
    }
  }

  /**
   * Automatically detect and hash any unhashed passwords in the database in-place
   */
  migratePlaintextPasswords() {
    if (!this.data || !Array.isArray(this.data.users)) return;
    let migrated = false;

    for (const user of this.data.users) {
      if (user.password && !user.password.startsWith('scrypt$')) {
        console.log(`🔒 [Security Migration] Hashing password for user '${user.username}'...`);
        user.password = hashPassword(user.password);
        migrated = true;
      }
    }

    if (migrated) {
      this.saveSync();
      console.log('✅ [Security Migration] All legacy plaintext passwords successfully migrated to scrypt hashes.');
    }
  }

  /**
   * Debounced asynchronous save for high-frequency operations (e.g. draft code updates)
   */
  save() {
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(async () => {
      this._saveTimer = null;
      await this.saveImmediately();
    }, 300);
  }

  /**
   * Immediate atomic disk write for critical state mutations.
   * (Priority #4: Guaranteed persistence re-trigger if save is requested during an active write)
   */
  async saveImmediately() {
    if (this._isSaving) {
      this._hasPendingSave = true;
      return;
    }
    this._isSaving = true;
    try {
      const tempPath = `${DB_FILE}.tmp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const payload = JSON.stringify(this.data, null, 2);
      await fs.promises.writeFile(tempPath, payload, 'utf-8');
      await fs.promises.rename(tempPath, DB_FILE);
    } catch (err) {
      console.error('Error saving database file:', err.message);
    } finally {
      this._isSaving = false;
      if (this._hasPendingSave) {
        this._hasPendingSave = false;
        setImmediate(() => this.saveImmediately());
      }
    }
  }

  /**
   * Synchronous save fallback used during initial boot or synchronous setup
   */
  saveSync() {
    try {
      const tempPath = `${DB_FILE}.tmp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      fs.writeFileSync(tempPath, JSON.stringify(this.data, null, 2), 'utf-8');
      fs.renameSync(tempPath, DB_FILE);
    } catch (err) {
      console.error('Error synchronously saving DB:', err.message);
    }
  }

  // --- Users ---
  /**
   * Look up user by username (Priority #10: Exact username match takes precedence over name/teamName)
   */
  findUserByUsername(username) {
    if (!username || typeof username !== 'string') return null;
    const clean = username.trim().toLowerCase();

    // 1. Exact username match (highest priority)
    const exactUser = this.data.users.find(u => u.username && u.username.toLowerCase() === clean);
    if (exactUser) return exactUser;

    // 2. Team name match (for team accounts)
    const teamUser = this.data.users.find(u => u.isTeam && u.teamName && u.teamName.trim().toLowerCase() === clean);
    if (teamUser) return teamUser;

    // 3. Display name fallback
    return this.data.users.find(u => u.name && u.name.trim().toLowerCase() === clean) || null;
  }

  findUserById(id) {
    if (!id || typeof id !== 'string') return null;
    return this.data.users.find(u => u.id === id);
  }

  getAllStudents() {
    return this.data.users
      .filter(u => u.role === 'student')
      .map(u => ({ 
        id: u.id, 
        username: u.username, 
        name: u.name, 
        isTeam: Boolean(u.isTeam),
        teamName: u.teamName || null,
        teammates: u.teammates || null,
        preferredLanguage: u.preferredLanguage || 'python',
        createdAt: u.createdAt 
      }));
  }

  createStudent(username, password, name, extra = {}) {
    const cleanUsername = (username || '').trim();
    const cleanPassword = (password || '').trim();
    const cleanName = (name || '').trim();

    // Input Validation
    if (!/^[a-zA-Z0-9_-]{3,32}$/.test(cleanUsername)) {
      throw new Error('Username must be 3-32 characters and contain only letters, numbers, underscores, or hyphens');
    }

    if (cleanPassword.length < 4 || cleanPassword.length > 128) {
      throw new Error('Password must be between 4 and 128 characters');
    }

    if (this.data.users.some(u => u.username.toLowerCase() === cleanUsername.toLowerCase())) {
      throw new Error(`Username '${cleanUsername}' already exists`);
    }

    const isTeam = Boolean(extra.isTeam);
    const teamName = extra.teamName ? extra.teamName.trim() : (isTeam ? cleanName : null);
    const teammates = extra.teammates ? extra.teammates.trim() : null;
    const rawLang = (extra.preferredLanguage || 'python').toLowerCase().trim();
    const preferredLanguage = ['python', 'py', 'c', 'cpp', 'c++'].includes(rawLang)
      ? (rawLang === 'py' ? 'python' : rawLang === 'c++' ? 'cpp' : rawLang)
      : 'python';

    const student = {
      id: `usr_${uuidv4().substring(0, 8)}`,
      username: cleanUsername,
      password: hashPassword(cleanPassword),
      role: 'student',
      name: cleanName || cleanUsername,
      isTeam,
      teamName,
      teammates,
      preferredLanguage,
      createdAt: new Date().toISOString()
    };

    this.data.users.push(student);
    this.saveImmediately();
    return { 
      id: student.id, 
      username: student.username, 
      name: student.name,
      isTeam: student.isTeam,
      teamName: student.teamName,
      teammates: student.teammates,
      preferredLanguage: student.preferredLanguage
    };
  }

  deleteStudent(id) {
    const index = this.data.users.findIndex(u => u.id === id && u.role === 'student');
    if (index === -1) {
      throw new Error(`Student ${id} not found`);
    }
    const [removed] = this.data.users.splice(index, 1);
    // Clean up active assignment
    this.data.assignments = this.data.assignments.filter(a => a.studentId !== id);
    // Clean up past submissions
    this.data.submissions = this.data.submissions.filter(s => s.studentId !== id);
    this.saveImmediately();
    return { id: removed.id, username: removed.username, name: removed.name };
  }

  // --- Problems ---
  getAllProblems() {
    return this.data.problems;
  }

  getProblemById(id) {
    return this.data.problems.find(p => p.id === id);
  }

  createProblem({ title, language, filename, description, starterCode, expectedOutput, testCases, timeLimitMs = 3000, durationMinutes = 15 }) {
    const cleanTitle = (title || '').trim();
    const cleanLang = (language || '').toLowerCase().trim();
    const cleanFilename = (filename || '').trim();
    const cleanExpectedOutput = typeof expectedOutput === 'string' ? expectedOutput : '';

    // Input Validation
    if (cleanTitle.length < 2 || cleanTitle.length > 100) {
      throw new Error('Problem title must be between 2 and 100 characters');
    }

    if (!['python', 'py', 'c', 'cpp', 'c++'].includes(cleanLang)) {
      throw new Error('Language must be one of: python, c, cpp');
    }

    // Filename path-traversal prevention
    const basename = path.basename(cleanFilename);
    if (!basename || basename !== cleanFilename || basename.includes('..')) {
      throw new Error('Invalid filename: path traversal and directory separators are not allowed');
    }

    // Ensure expected output exists
    const effectiveExpectedOutput = cleanExpectedOutput || testCases?.[0]?.expectedOutput || '';
    if (!effectiveExpectedOutput && (!Array.isArray(testCases) || testCases.length === 0)) {
      throw new Error('Problem must contain an Expected Output');
    }

    const effectiveTestCases = Array.isArray(testCases) && testCases.length > 0
      ? testCases
      : [{ input: '', expectedOutput: effectiveExpectedOutput, isHidden: false }];

    const validDuration = Math.min(180, Math.max(1, Number(durationMinutes) || 15));
    const validTimeLimit = Math.min(30000, Math.max(100, Number(timeLimitMs) || 3000));

    const problem = {
      id: `prob_${uuidv4().substring(0, 8)}`,
      title: cleanTitle,
      language: cleanLang === 'py' ? 'python' : cleanLang === 'c++' ? 'cpp' : cleanLang,
      filename: basename,
      description: (description || '').trim(),
      starterCode: starterCode || '',
      expectedOutput: effectiveExpectedOutput,
      testCases: effectiveTestCases,
      timeLimitMs: validTimeLimit,
      durationMinutes: validDuration,
      createdAt: new Date().toISOString()
    };

    this.data.problems.push(problem);
    this.saveImmediately();
    return problem;
  }

  // Feature 3: Update existing problem
  updateProblem(id, { title, language, filename, description, starterCode, expectedOutput, testCases, timeLimitMs, durationMinutes }) {
    const problem = this.getProblemById(id);
    if (!problem) throw new Error(`Problem ${id} not found`);

    if (title !== undefined) {
      const cleanTitle = title.trim();
      if (cleanTitle.length < 2 || cleanTitle.length > 100) {
        throw new Error('Problem title must be between 2 and 100 characters');
      }
      problem.title = cleanTitle;
    }

    if (language !== undefined) {
      const cleanLang = language.toLowerCase().trim();
      if (!['python', 'py', 'c', 'cpp', 'c++'].includes(cleanLang)) {
        throw new Error('Language must be one of: python, c, cpp');
      }
      problem.language = cleanLang === 'py' ? 'python' : cleanLang === 'c++' ? 'cpp' : cleanLang;
    }

    if (filename !== undefined) {
      const basename = path.basename(filename.trim());
      if (!basename || basename !== filename.trim() || basename.includes('..')) {
        throw new Error('Invalid filename: path traversal and directory separators are not allowed');
      }
      problem.filename = basename;
    }

    if (description !== undefined) problem.description = description.trim();
    if (starterCode !== undefined) problem.starterCode = starterCode;

    if (expectedOutput !== undefined) {
      const cleanExpected = typeof expectedOutput === 'string' ? expectedOutput : '';
      if (!cleanExpected && (!testCases || (Array.isArray(testCases) && testCases.length === 0))) {
        throw new Error('Problem must contain an Expected Output or at least one test case');
      }
      problem.expectedOutput = cleanExpected;
      if (!testCases) {
        problem.testCases = [{ input: '', expectedOutput: problem.expectedOutput, isHidden: false }];
      }
    }

    if (testCases !== undefined) {
      if (!Array.isArray(testCases) || testCases.length === 0) {
        throw new Error('Problem must contain at least one test case');
      }
      for (const tc of testCases) {
        if (!tc || typeof tc.expectedOutput !== 'string') {
          throw new Error('Every test case must contain expectedOutput');
        }
      }
      problem.testCases = testCases;
      if (!problem.expectedOutput && testCases[0]?.expectedOutput) {
        problem.expectedOutput = testCases[0].expectedOutput;
      }
    }

    if (timeLimitMs !== undefined) {
      problem.timeLimitMs = Math.min(30000, Math.max(100, Number(timeLimitMs) || problem.timeLimitMs));
    }
    if (durationMinutes !== undefined) {
      problem.durationMinutes = Math.min(180, Math.max(1, Number(durationMinutes) || problem.durationMinutes));
    }

    problem.updatedAt = new Date().toISOString();
    this.saveImmediately();
    return problem;
  }

  // Feature 2: Delete existing problem
  deleteProblem(id) {
    const index = this.data.problems.findIndex(p => p.id === id);
    if (index === -1) {
      throw new Error(`Problem ${id} not found`);
    }
    const [removed] = this.data.problems.splice(index, 1);
    // Clean up active assignments referencing the deleted problem to avoid orphaned records (BUG-02)
    this.data.assignments = this.data.assignments.filter(a => a.problemId !== id);
    this.saveImmediately();
    return removed;
  }

  // --- Assignments ---
  assignProblemToStudent(studentId, problemId, resetCode = true) {
    const problem = this.getProblemById(problemId);
    if (!problem) throw new Error(`Problem ${problemId} not found`);

    const now = new Date();
    const durationMinutes = Math.max(1, problem.durationMinutes || 15);
    const expiresAt = new Date(now.getTime() + durationMinutes * 60 * 1000).toISOString();

    let assignment = this.data.assignments.find(a => a.studentId === studentId);
    if (assignment) {
      const isSameProblem = assignment.problemId === problemId;

      assignment.problemId = problemId;
      assignment.assignedAt = now.toISOString();
      assignment.expiresAt = expiresAt;
      assignment.durationMinutes = durationMinutes;
      assignment.status = 'assigned';
      assignment.lastUpdated = now.toISOString();

      // Issue 3: Reset code when switching to a different problem OR when resetCode is true
      if (!isSameProblem || resetCode) {
        assignment.currentCode = problem.starterCode;
      }
    } else {
      assignment = {
        id: `asg_${uuidv4().substring(0, 8)}`,
        studentId,
        problemId,
        assignedAt: now.toISOString(),
        expiresAt,
        durationMinutes,
        status: 'assigned',
        currentCode: problem.starterCode,
        lastUpdated: now.toISOString()
      };
      this.data.assignments.push(assignment);
    }
    this.saveImmediately();
    return assignment;
  }

  getStudentAssignment(studentId) {
    const assignment = this.data.assignments.find(a => a.studentId === studentId);
    if (!assignment) return null;
    const problem = this.getProblemById(assignment.problemId);
    if (!problem) return null;

    const hasSubmitted = Boolean(
      this.data.submissions.find(s => 
        s.studentId === studentId && 
        s.problemId === problem.id &&
        new Date(s.createdAt) >= new Date(assignment.assignedAt)
      )
    );

    const expiresAt = assignment.expiresAt
      || new Date(new Date(assignment.assignedAt).getTime() + (problem.durationMinutes || 15) * 60 * 1000).toISOString();

    const isExpired = Date.now() > new Date(expiresAt).getTime();
    const effectiveStatus = hasSubmitted
      ? assignment.status
      : (isExpired ? 'expired' : 'assigned');

    const expectedOut = problem.expectedOutput || (problem.testCases && problem.testCases[0]?.expectedOutput) || '';

    return {
      assignmentId: assignment.id,
      problemId: problem.id,
      title: problem.title,
      language: problem.language,
      filename: problem.filename,
      description: problem.description,
      starterCode: problem.starterCode,
      currentCode: assignment.currentCode,
      expectedOutput: expectedOut,
      status: effectiveStatus,
      assignedAt: assignment.assignedAt,
      expiresAt,
      durationMinutes: problem.durationMinutes || assignment.durationMinutes || 15,
      hasSubmitted,
      sampleTestCase: problem.testCases?.find(t => !t.isHidden) || { input: '', expectedOutput: expectedOut }
    };
  }

  saveStudentDraftCode(studentId, code) {
    const assignment = this.data.assignments.find(a => a.studentId === studentId);
    if (assignment) {
      assignment.currentCode = code;
      assignment.lastUpdated = new Date().toISOString();
      this.save();
    }
  }

  // --- Submissions ---
  recordSubmission({
    studentId,
    problemId,
    code,
    language,
    status,
    pass,
    rawOutput,
    genericMessage,
    executionTimeMs
  }) {
    const submission = {
      id: `sub_${uuidv4().substring(0, 8)}`,
      studentId,
      problemId,
      code,
      language,
      status,
      pass: Boolean(pass),
      rawOutput,
      genericMessage,
      executionTimeMs: executionTimeMs || 0,
      createdAt: new Date().toISOString()
    };
    this.data.submissions.push(submission);

    // Update assignment status
    const assignment = this.data.assignments.find(a => a.studentId === studentId && a.problemId === problemId);
    if (assignment) {
      assignment.status = pass ? 'passed' : 'failed';
      assignment.currentCode = code;
      assignment.lastUpdated = new Date().toISOString();
    }

    // Persist submission immediately to disk (Priority #5)
    this.saveImmediately();
    return submission;
  }

  getSubmissionsForAdmin() {
    return this.data.submissions.map(sub => {
      const student = this.findUserById(sub.studentId);
      const problem = this.getProblemById(sub.problemId);
      return {
        ...sub,
        studentName: student ? student.name : 'Unknown',
        studentUsername: student ? student.username : 'Unknown',
        problemTitle: problem ? problem.title : 'Unknown'
      };
    }).reverse();
  }

  getStudentSubmissions(studentId) {
    return this.data.submissions
      .filter(s => s.studentId === studentId)
      .map(s => ({
        id: s.id,
        problemId: s.problemId,
        status: s.status,
        pass: s.pass,
        genericMessage: s.genericMessage,
        createdAt: s.createdAt
      }))
      .reverse();
  }
}

export const db = new ContestDatabase();
