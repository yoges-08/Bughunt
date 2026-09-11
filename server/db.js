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
 * Standardize language aliases to canonical forms ('python', 'c', 'cpp')
 */
export function normalizeLanguage(lang) {
  if (!lang || typeof lang !== 'string') return '';
  const clean = lang.toLowerCase().trim();
  if (clean === 'py' || clean === 'python') return 'python';
  if (clean === 'c') return 'c';
  if (clean === 'cpp' || clean === 'c++') return 'cpp';
  return clean;
}

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
        "id": "prob_py_r1",
        "title": "[Round 1] Python - Student Grade Classifier",
        "language": "python",
        "filename": "grade_evaluator.py",
        "description": "Fix the loop boundary and grade comparison logic to properly compute the student average and assign the correct letter grade (A >= 85, B >= 70, C >= 50, else F) when attendance is >= 75%.",
        "starterCode": "def evaluate_student(marks, attendance):\n    total = 0\n    for i in range(len(marks) - 1):\n        total += marks[i]\n    avg = total / len(marks)\n    if attendance < 75 or avg < 50.0:\n        status, grade = \"NOT ELIGIBLE\", \"F\"\n    else:\n        status = \"ELIGIBLE\"\n        if avg >= 85.0:\n            grade = \"A\"\n        elif avg >= 70.0:\n            grade = \"B\"\n        elif avg > 50.0:\n            grade = \"C\"\n        else:\n            grade = \"F\"\n    print(f\"Average: {avg:.2f} | Attendance: {attendance}% | Status: {status} | Grade: {grade}\")\n\nevaluate_student([80, 90, 70, 80], 85)\n",
        "expectedOutput": "Average: 80.00 | Attendance: 85% | Status: ELIGIBLE | Grade: B",
        "testCases": [
            {
                "input": "",
                "expectedOutput": "Average: 80.00 | Attendance: 85% | Status: ELIGIBLE | Grade: B",
                "isHidden": false
            }
        ],
        "timeLimitMs": 3000,
        "durationMinutes": 3,
        "createdAt": "2026-09-11T09:17:28.151Z"
    },
    {
        "id": "prob_py_r2",
        "title": "[Round 2] Python - Sales Transaction Analyzer",
        "language": "python",
        "filename": "sales_analyzer.py",
        "description": "Fix the peak finder comparison, high-value threshold boundary (>= 300), and net payout calculation (total - 5% fee + $50 bonus) to produce the correct financial summary.",
        "starterCode": "def calculate_total(transactions):\n    total = 0\n    for val in transactions:\n        total += val\n    return total\n\ndef find_peak(transactions):\n    peak = transactions[0]\n    for val in transactions:\n        if val < peak:\n            peak = val\n    return peak\n\ndef filter_high_value(transactions, threshold):\n    filtered = []\n    for val in transactions:\n        if val > threshold:\n            filtered.append(val)\n    return filtered\n\ndef analyze_sales(transactions):\n    total_sales = calculate_total(transactions)\n    peak_val = find_peak(transactions)\n    high_items = filter_high_value(transactions, 300)\n    high_total = calculate_total(high_items)\n    high_count = len(high_items)\n    service_fee = high_total * 0.05\n    reward = 50 if high_count >= 3 else 0\n    net_payout = total_sales + service_fee - reward\n    print(f\"Total Sales: ${total_sales:.2f}\")\n    print(f\"Peak Transaction: ${peak_val:.2f}\")\n    print(f\"High-Value Count: {high_count} | High-Value Sum: ${high_total:.2f}\")\n    print(f\"Net Payout: ${net_payout:.2f}\")\n\nanalyze_sales([120, 450, 80, 950, 300, 600, 150])\n",
        "expectedOutput": "Total Sales: $2650.00\nPeak Transaction: $950.00\nHigh-Value Count: 4 | High-Value Sum: $2300.00\nNet Payout: $2585.00",
        "testCases": [
            {
                "input": "",
                "expectedOutput": "Total Sales: $2650.00\nPeak Transaction: $950.00\nHigh-Value Count: 4 | High-Value Sum: $2300.00\nNet Payout: $2585.00",
                "isHidden": false
            }
        ],
        "timeLimitMs": 3000,
        "durationMinutes": 10,
        "createdAt": "2026-09-11T09:17:28.159Z"
    },
    {
        "id": "prob_py_r3",
        "title": "[Round 3] Python - Contest Leaderboard & Search",
        "language": "python",
        "filename": "leaderboard_ranker.py",
        "description": "Fix the tie-breaker sort order (higher solved ranks higher), even-count median index calculation, binary search bound update, and top-k loop range.",
        "starterCode": "def sort_leaderboard(students):\n    n = len(students)\n    for i in range(n):\n        for j in range(0, n - i - 1):\n            s1, s2 = students[j], students[j + 1]\n            swap = False\n            if s1['score'] < s2['score']:\n                swap = True\n            elif s1['score'] == s2['score'] and s1['solved'] > s2['solved']:\n                swap = True\n            if swap:\n                students[j], students[j + 1] = students[j + 1], students[j]\n\ndef calculate_median(scores):\n    n = len(scores)\n    if n == 0:\n        return 0.0\n    mid = n // 2\n    if n % 2 == 1:\n        return float(scores[mid])\n    return (scores[mid] + scores[mid + 1]) / 2.0\n\ndef find_score_rank(students, target_score):\n    low = 0\n    high = len(students) - 1\n    found_idx = -1\n    while low <= high:\n        mid = (low + high) // 2\n        if students[mid]['score'] == target_score:\n            found_idx = mid\n            high = mid - 1\n        elif students[mid]['score'] < target_score:\n            high = mid\n        else:\n            low = mid + 1\n    return found_idx + 1 if found_idx != -1 else -1\n\ndef print_top_performers(students, k):\n    print(\"=== Top Performers ===\")\n    for i in range(k + 1):\n        s = students[i]\n        print(f\"Rank {i+1}: {s['name']} (Score: {s['score']}, Solved: {s['solved']})\")\n\ndef main():\n    students = [\n        {\"id\": 101, \"name\": \"Alice\", \"score\": 90, \"solved\": 4},\n        {\"id\": 102, \"name\": \"Bob\", \"score\": 85, \"solved\": 3},\n        {\"id\": 103, \"name\": \"Charlie\", \"score\": 90, \"solved\": 5},\n        {\"id\": 104, \"name\": \"David\", \"score\": 75, \"solved\": 2},\n        {\"id\": 105, \"name\": \"Eve\", \"score\": 95, \"solved\": 5},\n        {\"id\": 106, \"name\": \"Frank\", \"score\": 85, \"solved\": 4}\n    ]\n    sort_leaderboard(students)\n    scores = [s['score'] for s in students]\n    med = calculate_median(scores)\n    rank_90 = find_score_rank(students, 90)\n    print_top_performers(students, 3)\n    print(f\"\\nMedian Score: {med:.2f}\")\n    print(f\"Search Rank for 90 Score: Rank #{rank_90}\")\n\nmain()\n",
        "expectedOutput": "=== Top Performers ===\nRank 1: Eve (Score: 95, Solved: 5)\nRank 2: Charlie (Score: 90, Solved: 5)\nRank 3: Alice (Score: 90, Solved: 4)\n\nMedian Score: 87.50\nSearch Rank for 90 Score: Rank #2",
        "testCases": [
            {
                "input": "",
                "expectedOutput": "=== Top Performers ===\nRank 1: Eve (Score: 95, Solved: 5)\nRank 2: Charlie (Score: 90, Solved: 5)\nRank 3: Alice (Score: 90, Solved: 4)\n\nMedian Score: 87.50\nSearch Rank for 90 Score: Rank #2",
                "isHidden": false
            }
        ],
        "timeLimitMs": 3000,
        "durationMinutes": 20,
        "createdAt": "2026-09-11T09:17:28.159Z"
    },
    {
        "id": "prob_c_r1",
        "title": "[Round 1] C - Student Grade Classifier",
        "language": "c",
        "filename": "grade_evaluator.c",
        "description": "Fix the loop boundary and grade comparison logic in C to properly compute the student average and assign the correct letter grade (A >= 85, B >= 70, C >= 50, else F) when attendance is >= 75%.",
        "starterCode": "#include <stdio.h>\n\nint main() {\n    int marks[4] = {80, 90, 70, 80};\n    int attendance = 85;\n    int total = 0;\n    for (int i = 0; i < 3; i++) {\n        total += marks[i];\n    }\n    float avg = (float)total / 4.0f;\n    char grade = 'F';\n    if (attendance >= 75 && avg >= 85.0f) grade = 'A';\n    else if (attendance >= 75 && avg >= 70.0f) grade = 'B';\n    else if (attendance >= 75 && avg > 50.0f) grade = 'C';\n    printf(\"Average: %.2f | Attendance: %d%% | Grade: %c\\n\", avg, attendance, grade);\n    return 0;\n}\n",
        "expectedOutput": "Average: 80.00 | Attendance: 85% | Grade: B",
        "testCases": [
            {
                "input": "",
                "expectedOutput": "Average: 80.00 | Attendance: 85% | Grade: B",
                "isHidden": false
            }
        ],
        "timeLimitMs": 3000,
        "durationMinutes": 3,
        "createdAt": "2026-09-11T09:17:28.159Z"
    },
    {
        "id": "prob_c_r2",
        "title": "[Round 2] C - Sales Transaction Analyzer",
        "language": "c",
        "filename": "sales_analyzer.c",
        "description": "Fix the peak finder comparison, high-value threshold boundary (>= 300), and net payout calculation (total - 5% fee + $50 bonus) in C.",
        "starterCode": "#include <stdio.h>\n\nint main() {\n    int sales[7] = {120, 450, 80, 950, 300, 600, 150};\n    int n = 7;\n    float totalSales = 0.0f;\n    for (int i = 0; i < n; i++) {\n        totalSales += sales[i];\n    }\n    int peak = sales[0];\n    for (int i = 0; i < n; i++) {\n        if (sales[i] < peak) {\n            peak = sales[i];\n        }\n    }\n    float highSum = 0.0f;\n    int highCount = 0;\n    for (int i = 0; i < n; i++) {\n        if (sales[i] > 300) {\n            highSum += sales[i];\n            highCount++;\n        }\n    }\n    float serviceFee = highSum * 0.05f;\n    float reward = (highCount >= 3) ? 50.0f : 0.0f;\n    float netPayout = totalSales + serviceFee - reward;\n    printf(\"Total Sales: $%.2f\\n\", totalSales);\n    printf(\"Peak Transaction: $%d.00\\n\", peak);\n    printf(\"High-Value Count: %d | High-Value Sum: $%.2f\\n\", highCount, highSum);\n    printf(\"Net Payout: $%.2f\\n\", netPayout);\n    return 0;\n}\n",
        "expectedOutput": "Total Sales: $2650.00\nPeak Transaction: $950.00\nHigh-Value Count: 4 | High-Value Sum: $2300.00\nNet Payout: $2585.00",
        "testCases": [
            {
                "input": "",
                "expectedOutput": "Total Sales: $2650.00\nPeak Transaction: $950.00\nHigh-Value Count: 4 | High-Value Sum: $2300.00\nNet Payout: $2585.00",
                "isHidden": false
            }
        ],
        "timeLimitMs": 3000,
        "durationMinutes": 10,
        "createdAt": "2026-09-11T09:17:28.159Z"
    },
    {
        "id": "prob_c_r3",
        "title": "[Round 3] C - Contest Leaderboard & Search",
        "language": "c",
        "filename": "leaderboard_ranker.c",
        "description": "Fix the struct bubble sort tie-breaker, even median index averaging, binary search bound update, and top-k loop in C.",
        "starterCode": "#include <stdio.h>\n\nstruct Student {\n    char name[20];\n    int score;\n    int solved;\n};\n\nvoid sortStudents(struct Student s[], int n) {\n    for (int i = 0; i < n - 1; i++) {\n        for (int j = 0; j < n - i - 1; j++) {\n            int swap = 0;\n            if (s[j].score < s[j + 1].score) swap = 1;\n            else if (s[j].score == s[j + 1].score && s[j].solved > s[j + 1].solved) swap = 1;\n            if (swap) {\n                struct Student temp = s[j];\n                s[j] = s[j + 1];\n                s[j + 1] = temp;\n            }\n        }\n    }\n}\n\nfloat findMedian(struct Student s[], int n) {\n    int mid = n / 2;\n    if (n % 2 == 1) return (float)s[mid].score;\n    return (s[mid].score + s[mid + 1].score) / 2.0f;\n}\n\nint searchRank(struct Student s[], int n, int target) {\n    int low = 0, high = n - 1, rank = -1;\n    while (low <= high) {\n        int mid = (low + high) / 2;\n        if (s[mid].score == target) { rank = mid + 1; high = mid - 1; }\n        else if (s[mid].score < target) high = mid;\n        else low = mid + 1;\n    }\n    return rank;\n}\n\nint main() {\n    struct Student list[6] = {\n        {\"Alice\", 90, 4}, {\"Bob\", 85, 3}, {\"Charlie\", 90, 5},\n        {\"David\", 75, 2}, {\"Eve\", 95, 5}, {\"Frank\", 85, 4}\n    };\n    int n = 6;\n    sortStudents(list, n);\n    printf(\"=== Top Performers ===\\n\");\n    for (int i = 0; i <= 3; i++) {\n        printf(\"Rank %d: %s (Score: %d, Solved: %d)\\n\", i + 1, list[i].name, list[i].score, list[i].solved);\n    }\n    float median = findMedian(list, n);\n    int rank90 = searchRank(list, n, 90);\n    printf(\"\\nMedian Score: %.2f\\n\", median);\n    printf(\"Search Rank for 90 Score: Rank #%d\\n\", rank90);\n    return 0;\n}\n",
        "expectedOutput": "=== Top Performers ===\nRank 1: Eve (Score: 95, Solved: 5)\nRank 2: Charlie (Score: 90, Solved: 5)\nRank 3: Alice (Score: 90, Solved: 4)\n\nMedian Score: 87.50\nSearch Rank for 90 Score: Rank #2",
        "testCases": [
            {
                "input": "",
                "expectedOutput": "=== Top Performers ===\nRank 1: Eve (Score: 95, Solved: 5)\nRank 2: Charlie (Score: 90, Solved: 5)\nRank 3: Alice (Score: 90, Solved: 4)\n\nMedian Score: 87.50\nSearch Rank for 90 Score: Rank #2",
                "isHidden": false
            }
        ],
        "timeLimitMs": 3000,
        "durationMinutes": 20,
        "createdAt": "2026-09-11T09:17:28.159Z"
    },
    {
        "id": "prob_cpp_r1",
        "title": "[Round 1] C++ - Student Grade Classifier",
        "language": "cpp",
        "filename": "grade_evaluator.cpp",
        "description": "Fix the loop boundary and grade comparison logic in C++ to properly compute the student average and assign the correct letter grade (A >= 85, B >= 70, C >= 50, else F) when attendance is >= 75%.",
        "starterCode": "#include <iostream>\n#include <iomanip>\n\nint main() {\n    int marks[4] = {80, 90, 70, 80};\n    int attendance = 85;\n    int total = 0;\n    for (int i = 0; i < 3; i++) {\n        total += marks[i];\n    }\n    double avg = static_cast<double>(total) / 4.0;\n    char grade = 'F';\n    if (attendance >= 75 && avg >= 85.0) grade = 'A';\n    else if (attendance >= 75 && avg >= 70.0) grade = 'B';\n    else if (attendance >= 75 && avg > 50.0) grade = 'C';\n    std::cout << std::fixed << std::setprecision(2);\n    std::cout << \"Average: \" << avg << \" | Attendance: \" << attendance << \"% | Grade: \" << grade << \"\\n\";\n    return 0;\n}\n",
        "expectedOutput": "Average: 80.00 | Attendance: 85% | Grade: B",
        "testCases": [
            {
                "input": "",
                "expectedOutput": "Average: 80.00 | Attendance: 85% | Grade: B",
                "isHidden": false
            }
        ],
        "timeLimitMs": 3000,
        "durationMinutes": 3,
        "createdAt": "2026-09-11T09:17:28.159Z"
    },
    {
        "id": "prob_cpp_r2",
        "title": "[Round 2] C++ - Sales Transaction Analyzer",
        "language": "cpp",
        "filename": "sales_analyzer.cpp",
        "description": "Fix the peak finder comparison, high-value threshold boundary (>= 300), and net payout calculation (total - 5% fee + $50 bonus) in C++.",
        "starterCode": "#include <iostream>\n#include <iomanip>\n\nint main() {\n    int sales[7] = {120, 450, 80, 950, 300, 600, 150};\n    int n = 7;\n    double totalSales = 0.0;\n    for (int i = 0; i < n; i++) {\n        totalSales += sales[i];\n    }\n    int peak = sales[0];\n    for (int i = 0; i < n; i++) {\n        if (sales[i] < peak) {\n            peak = sales[i];\n        }\n    }\n    double highSum = 0.0;\n    int highCount = 0;\n    for (int i = 0; i < n; i++) {\n        if (sales[i] > 300) {\n            highSum += sales[i];\n            highCount++;\n        }\n    }\n    double serviceFee = highSum * 0.05;\n    double reward = (highCount >= 3) ? 50.0 : 0.0;\n    double netPayout = totalSales + serviceFee - reward;\n    std::cout << std::fixed << std::setprecision(2);\n    std::cout << \"Total Sales: $\" << totalSales << \"\\n\";\n    std::cout << \"Peak Transaction: $\" << peak << \".00\\n\";\n    std::cout << \"High-Value Count: \" << highCount << \" | High-Value Sum: $\" << highSum << \"\\n\";\n    std::cout << \"Net Payout: $\" << netPayout << \"\\n\";\n    return 0;\n}\n",
        "expectedOutput": "Total Sales: $2650.00\nPeak Transaction: $950.00\nHigh-Value Count: 4 | High-Value Sum: $2300.00\nNet Payout: $2585.00",
        "testCases": [
            {
                "input": "",
                "expectedOutput": "Total Sales: $2650.00\nPeak Transaction: $950.00\nHigh-Value Count: 4 | High-Value Sum: $2300.00\nNet Payout: $2585.00",
                "isHidden": false
            }
        ],
        "timeLimitMs": 3000,
        "durationMinutes": 10,
        "createdAt": "2026-09-11T09:17:28.159Z"
    },
    {
        "id": "prob_cpp_r3",
        "title": "[Round 3] C++ - Contest Leaderboard & Search",
        "language": "cpp",
        "filename": "leaderboard_ranker.cpp",
        "description": "Fix the struct bubble sort tie-breaker, even median index averaging, binary search bound update, and top-k loop in C++.",
        "starterCode": "#include <iostream>\n#include <iomanip>\n#include <string>\n\nstruct Student {\n    std::string name;\n    int score;\n    int solved;\n};\n\nvoid sortStudents(Student s[], int n) {\n    for (int i = 0; i < n - 1; i++) {\n        for (int j = 0; j < n - i - 1; j++) {\n            bool swap = false;\n            if (s[j].score < s[j + 1].score) swap = true;\n            else if (s[j].score == s[j + 1].score && s[j].solved > s[j + 1].solved) swap = true;\n            if (swap) {\n                Student temp = s[j];\n                s[j] = s[j + 1];\n                s[j + 1] = temp;\n            }\n        }\n    }\n}\n\ndouble findMedian(Student s[], int n) {\n    int mid = n / 2;\n    if (n % 2 == 1) return static_cast<double>(s[mid].score);\n    return (s[mid].score + s[mid + 1].score) / 2.0;\n}\n\nint searchRank(Student s[], int n, int target) {\n    int low = 0, high = n - 1, rank = -1;\n    while (low <= high) {\n        int mid = (low + high) / 2;\n        if (s[mid].score == target) { rank = mid + 1; high = mid - 1; }\n        else if (s[mid].score < target) high = mid;\n        else low = mid + 1;\n    }\n    return rank;\n}\n\nint main() {\n    Student list[6] = {\n        {\"Alice\", 90, 4}, {\"Bob\", 85, 3}, {\"Charlie\", 90, 5},\n        {\"David\", 75, 2}, {\"Eve\", 95, 5}, {\"Frank\", 85, 4}\n    };\n    int n = 6;\n    sortStudents(list, n);\n    std::cout << \"=== Top Performers ===\\n\";\n    for (int i = 0; i <= 3; i++) {\n        std::cout << \"Rank \" << i + 1 << \": \" << list[i].name << \" (Score: \" << list[i].score << \", Solved: \" << list[i].solved << \")\\n\";\n    }\n    double median = findMedian(list, n);\n    int rank90 = searchRank(list, n, 90);\n    std::cout << std::fixed << std::setprecision(2);\n    std::cout << \"\\nMedian Score: \" << median << \"\\n\";\n    std::cout << \"Search Rank for 90 Score: Rank #\" << rank90 << \"\\n\";\n    return 0;\n}\n",
        "expectedOutput": "=== Top Performers ===\nRank 1: Eve (Score: 95, Solved: 5)\nRank 2: Charlie (Score: 90, Solved: 5)\nRank 3: Alice (Score: 90, Solved: 4)\n\nMedian Score: 87.50\nSearch Rank for 90 Score: Rank #2",
        "testCases": [
            {
                "input": "",
                "expectedOutput": "=== Top Performers ===\nRank 1: Eve (Score: 95, Solved: 5)\nRank 2: Charlie (Score: 90, Solved: 5)\nRank 3: Alice (Score: 90, Solved: 4)\n\nMedian Score: 87.50\nSearch Rank for 90 Score: Rank #2",
                "isHidden": false
            }
        ],
        "timeLimitMs": 3000,
        "durationMinutes": 20,
        "createdAt": "2026-09-11T09:17:28.159Z"
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
        } else if (!this.data.problems.some(p => p.id === 'prob_py_r1')) {
          const seed = INITIAL_DB.problems.find(p => p.id === 'prob_py_r1');
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
      if (testCases === undefined) {
        if (Array.isArray(problem.testCases) && problem.testCases.length > 0) {
          problem.testCases = problem.testCases.map((tc, idx) => idx === 0 ? { ...tc, expectedOutput: cleanExpected } : tc);
        } else {
          problem.testCases = [{ input: '', expectedOutput: problem.expectedOutput, isHidden: false }];
        }
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
  assignProblemToStudent(studentId, problemId, resetCode = true, contestMeta = null) {
    const problem = this.getProblemById(problemId);
    if (!problem) throw new Error(`Problem ${problemId} not found`);

    const startTimestamp = contestMeta?.contestStartAt || Date.now();
    const assignedAtIso = contestMeta?.assignedAt || new Date(startTimestamp).toISOString();
    const durationMinutes = Math.max(1, problem.durationMinutes || 15);
    const expiresAt = contestMeta?.expiresAt || new Date(startTimestamp + durationMinutes * 60 * 1000).toISOString();
    const contestId = contestMeta?.contestId || null;

    let assignment = this.data.assignments.find(a => a.studentId === studentId);
    if (assignment) {
      const isSameProblem = assignment.problemId === problemId;

      assignment.problemId = problemId;
      assignment.contestId = contestId || assignment.contestId || null;
      assignment.contestStartAt = startTimestamp;
      assignment.assignedAt = assignedAtIso;
      assignment.expiresAt = expiresAt;
      assignment.durationMinutes = durationMinutes;
      assignment.status = 'assigned';
      assignment.lastUpdated = assignedAtIso;

      // Issue 3: Reset code when switching to a different problem OR when resetCode is true
      if (!isSameProblem || resetCode) {
        assignment.currentCode = problem.starterCode;
      }
    } else {
      assignment = {
        id: `asg_${uuidv4().substring(0, 8)}`,
        studentId,
        problemId,
        contestId,
        contestStartAt: startTimestamp,
        assignedAt: assignedAtIso,
        expiresAt,
        durationMinutes,
        status: 'assigned',
        currentCode: problem.starterCode,
        lastUpdated: assignedAtIso
      };
      this.data.assignments.push(assignment);
    }
    this.saveImmediately();
    return assignment;
  }

  // Authoritative Atomic Multi-Student Simultaneous Contest Assignment (BUG-ML-01 & BUG-ML-03)
  assignContestBatch({ contestId, contestStartAt, assignments: rawAssignments, resetCode = true }) {
    if (!Array.isArray(rawAssignments) || rawAssignments.length === 0) {
      return { contestId: null, contestStartAt: null, assignedAt: null, assignments: [] };
    }

    const startTimestamp = typeof contestStartAt === 'number' ? contestStartAt : Date.now();
    const assignedAtIso = new Date(startTimestamp).toISOString();
    const resolvedContestId = contestId || `contest_${startTimestamp}_${uuidv4().substring(0, 6)}`;

    const problemCache = new Map();
    const committedAssignments = [];
    const errors = [];

    // Phase 1: Validation pass across all assigned problems
    for (const item of rawAssignments) {
      const { studentId, problemId } = item;
      if (!problemCache.has(problemId)) {
        const prob = this.getProblemById(problemId);
        if (!prob) {
          errors.push({ studentId, problemId, error: `Problem ${problemId} not found` });
          continue;
        }
        problemCache.set(problemId, prob);
      }
    }

    if (errors.length > 0) {
      throw new Error(`Batch assignment validation failed: ${errors.map(e => e.error).join(', ')}`);
    }

    // Phase 2: Prepare and commit all assignments in memory with identical start/expiry timestamps
    for (const item of rawAssignments) {
      const { studentId, problemId } = item;
      const problem = problemCache.get(problemId);
      const durationMinutes = Math.max(1, problem.durationMinutes || 15);
      const expiresAt = new Date(startTimestamp + durationMinutes * 60 * 1000).toISOString();

      let existing = this.data.assignments.find(a => a.studentId === studentId);
      if (existing) {
        const isSameProblem = existing.problemId === problemId;
        existing.problemId = problemId;
        existing.contestId = resolvedContestId;
        existing.contestStartAt = startTimestamp;
        existing.assignedAt = assignedAtIso;
        existing.expiresAt = expiresAt;
        existing.durationMinutes = durationMinutes;
        existing.status = 'assigned';
        existing.lastUpdated = assignedAtIso;

        if (!isSameProblem || resetCode) {
          existing.currentCode = problem.starterCode;
        }
        committedAssignments.push({ ...existing, problem });
      } else {
        const newAssignment = {
          id: `asg_${uuidv4().substring(0, 8)}`,
          studentId,
          problemId,
          contestId: resolvedContestId,
          contestStartAt: startTimestamp,
          assignedAt: assignedAtIso,
          expiresAt,
          durationMinutes,
          status: 'assigned',
          currentCode: problem.starterCode,
          lastUpdated: assignedAtIso
        };
        this.data.assignments.push(newAssignment);
        committedAssignments.push({ ...newAssignment, problem });
      }
    }

    // Phase 3: Single atomic disk write for all students
    this.saveImmediately();

    return {
      contestId: resolvedContestId,
      contestStartAt: startTimestamp,
      assignedAt: assignedAtIso,
      assignments: committedAssignments
    };
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
      contestId: assignment.contestId || null,
      contestStartAt: assignment.contestStartAt || (assignment.assignedAt ? new Date(assignment.assignedAt).getTime() : null),
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
      sampleTestCase: problem.testCases?.find(t => !t.isHidden) || { input: '', expectedOutput: expectedOut },
      serverTime: Date.now()
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
