/**
 * Embedded Persistent Database for Bug Hunt
 * 
 * Provides an ACID-like file-backed JSON store with in-memory caching and atomic writes.
 * Supports accounts (Admin/Student), Buggy Problems, Assignments, and Submissions.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_FILE = path.resolve(__dirname, '..', 'data', 'contest_db.json');

// Initial seed data with default admin, students, and sample bug-hunt problems
const INITIAL_DB = {
  users: [
    {
      id: 'usr_admin',
      username: 'admin',
      password: 'admin123', // In a real setup or contest, admin sets or resets this
      role: 'admin',
      name: 'Contest Administrator',
      createdAt: new Date().toISOString()
    },
    {
      id: 'usr_student_1',
      username: 'student1',
      password: 'pass1',
      role: 'student',
      name: 'Alice Johnson (Team A)',
      createdAt: new Date().toISOString()
    },
    {
      id: 'usr_student_2',
      username: 'student2',
      password: 'pass2',
      role: 'student',
      name: 'Bob Smith (Team B)',
      createdAt: new Date().toISOString()
    },
    {
      id: 'usr_student_3',
      username: 'student3',
      password: 'pass3',
      role: 'student',
      name: 'Charlie Davis (Team C)',
      createdAt: new Date().toISOString()
    },
    {
      id: 'usr_student_4',
      username: 'student4',
      password: 'pass4',
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
      description: 'The given function is supposed to check if a string is a palindrome ignoring case and spaces. Fix the logic and index bounds error.',
      starterCode: `# Bug Hunt Challenge: Palindrome Checker
# Fix the bugs so that strings like "Race car" or "madam" return True, and "hello" returns False.

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
    import sys
    lines = sys.stdin.read().strip().splitlines()
    for line in lines:
        if line.strip():
            print("YES" if is_palindrome(line) else "NO")
`,
      testCases: [
        { input: "Race car\nmadam\nhello\n", expectedOutput: "YES\nYES\nNO", isHidden: false },
        { input: "A man a plan a canal Panama\nNo lemon no melon\nWorld\n", expectedOutput: "YES\nYES\nNO", isHidden: true },
        { input: "12321\n123456\n", expectedOutput: "YES\nNO", isHidden: true }
      ],
      timeLimitMs: 3000,
      createdAt: new Date().toISOString()
    },
    {
      id: 'prob_cpp_binary_search',
      title: 'Fix Binary Search Off-by-One',
      language: 'cpp',
      filename: 'binary_search.cpp',
      description: 'A classic binary search implementation with boundary index bugs and integer overflow issue. Fix it to pass all test cases.',
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
    int n, target;
    if (!(std::cin >> n >> target)) return 0;
    std::vector<int> arr(n);
    for (int i = 0; i < n; ++i) {
        std::cin >> arr[i];
    }
    std::cout << binarySearch(arr, target) << std::endl;
    return 0;
}
`,
      testCases: [
        { input: "5 7\n1 3 5 7 9\n", expectedOutput: "3", isHidden: false },
        { input: "5 1\n1 3 5 7 9\n", expectedOutput: "0", isHidden: false },
        { input: "5 9\n1 3 5 7 9\n", expectedOutput: "4", isHidden: true },
        { input: "5 4\n1 3 5 7 9\n", expectedOutput: "-1", isHidden: true }
      ],
      timeLimitMs: 3000,
      createdAt: new Date().toISOString()
    },
    {
      id: 'prob_c_array_max',
      title: 'Fix Array Maximum and Memory Bounds',
      language: 'c',
      filename: 'array_max.c',
      description: 'Find the maximum element and its count in an integer array. Fix the initialization bug and out-of-bounds loop.',
      starterCode: `/* Bug Hunt Challenge: Array Maximum & Frequency
   Input: n followed by n integers.
   Output: "<max_val> <count>"
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
    int n;
    if (scanf("%d", &n) != 1 || n <= 0) return 0;
    int arr[1000];
    for (int i = 0; i < n; i++) {
        scanf("%d", &arr[i]);
    }
    int max_val, count;
    find_max_and_count(arr, n, &max_val, &count);
    printf("%d %d\\n", max_val, count);
    return 0;
}
`,
      testCases: [
        { input: "5\n1 5 3 5 2\n", expectedOutput: "5 2", isHidden: false },
        { input: "4\n-10 -5 -2 -5\n", expectedOutput: "-2 1", isHidden: true },
        { input: "3\n7 7 7\n", expectedOutput: "7 3", isHidden: true }
      ],
      timeLimitMs: 3000,
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
    this.init();
  }

  init() {
    const dir = path.dirname(DB_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (!fs.existsSync(DB_FILE)) {
      this.data = JSON.parse(JSON.stringify(INITIAL_DB));
      this.save();
    } else {
      try {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        this.data = JSON.parse(raw);
      } catch (err) {
        console.error('Error reading database file, re-initializing:', err);
        this.data = JSON.parse(JSON.stringify(INITIAL_DB));
        this.save();
      }
    }
  }

  save() {
    try {
      const tempPath = `${DB_FILE}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(this.data, null, 2), 'utf-8');
      fs.renameSync(tempPath, DB_FILE);
    } catch (err) {
      console.error('Error saving DB:', err);
    }
  }

  // --- Users ---
  findUserByUsername(username) {
    return this.data.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  }

  findUserById(id) {
    return this.data.users.find(u => u.id === id);
  }

  getAllStudents() {
    return this.data.users
      .filter(u => u.role === 'student')
      .map(u => ({ id: u.id, username: u.username, name: u.name, createdAt: u.createdAt }));
  }

  createStudent(username, password, name) {
    if (this.findUserByUsername(username)) {
      throw new Error(`Username '${username}' already exists`);
    }
    const student = {
      id: `usr_${uuidv4().substring(0, 8)}`,
      username: username.trim(),
      password: password.trim(),
      role: 'student',
      name: name ? name.trim() : username.trim(),
      createdAt: new Date().toISOString()
    };
    this.data.users.push(student);
    this.save();
    return { id: student.id, username: student.username, name: student.name };
  }

  // --- Problems ---
  getAllProblems() {
    return this.data.problems;
  }

  getProblemById(id) {
    return this.data.problems.find(p => p.id === id);
  }

  createProblem({ title, language, filename, description, starterCode, testCases, timeLimitMs = 3000 }) {
    const problem = {
      id: `prob_${uuidv4().substring(0, 8)}`,
      title: title.trim(),
      language: language.toLowerCase().trim(),
      filename: filename.trim(),
      description: description.trim(),
      starterCode: starterCode || '',
      testCases: testCases || [],
      timeLimitMs: timeLimitMs || 3000,
      createdAt: new Date().toISOString()
    };
    this.data.problems.push(problem);
    this.save();
    return problem;
  }

  // --- Assignments ---
  assignProblemToStudent(studentId, problemId) {
    const problem = this.getProblemById(problemId);
    if (!problem) throw new Error(`Problem ${problemId} not found`);

    let assignment = this.data.assignments.find(a => a.studentId === studentId);
    if (assignment) {
      assignment.problemId = problemId;
      assignment.assignedAt = new Date().toISOString();
      assignment.currentCode = problem.starterCode;
      assignment.status = 'assigned';
      assignment.lastUpdated = new Date().toISOString();
    } else {
      assignment = {
        id: `asg_${uuidv4().substring(0, 8)}`,
        studentId,
        problemId,
        assignedAt: new Date().toISOString(),
        status: 'assigned',
        currentCode: problem.starterCode,
        lastUpdated: new Date().toISOString()
      };
      this.data.assignments.push(assignment);
    }
    this.save();
    return assignment;
  }

  getStudentAssignment(studentId) {
    const assignment = this.data.assignments.find(a => a.studentId === studentId);
    if (!assignment) return null;
    const problem = this.getProblemById(assignment.problemId);
    if (!problem) return null;

    return {
      assignmentId: assignment.id,
      problemId: problem.id,
      title: problem.title,
      language: problem.language,
      filename: problem.filename,
      description: problem.description,
      starterCode: problem.starterCode,
      currentCode: assignment.currentCode,
      status: assignment.status,
      assignedAt: assignment.assignedAt,
      sampleTestCase: problem.testCases.find(t => !t.isHidden) || null
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
      status, // SUCCESS, PROGRAM_ERROR, EXECUTION_FAILED, TIMEOUT
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

    this.save();
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
