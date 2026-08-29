# 🐞 BUG HUNT — LAN Coding Contest Application

A single desktop application for running LAN-based "Bug Hunt" coding contests with role-based UI (Admin vs. Student), private bundled compilers, instant LAN problem push, independent server re-verification, and strict error sanitization.

---

## 🌟 Core Architecture & Key Features

### 1. Single Application with Role-Based Login & Server-Side Security
- The same application is installed on every computer (Admin PC & Student PCs).
- **Host Mode (Admin PC)**: Starts the embedded Express + WebSocket server on `0.0.0.0:4000`, hosts the contest database, and connects its local UI as Admin.
- **Client Mode (Student PCs)**: Connects to the Host PC's LAN IP address (e.g., `http://192.168.1.50:4000`).
- **Server-Side Role Enforcement**: The user interface is purely presentational. All administrative APIs (file push, student list, raw compiler diagnostics) strictly check `req.user.role === 'admin'`. Any unauthorized student request is rejected with `403 Forbidden`.

### 2. Instant LAN File Push (Core Requirement 1)
- When the Admin selects a problem and clicks **"Push File to Student(s)"**, the file and starter code are transmitted in real-time over WebSocket.
- The file immediately mounts inside the student's code editor—**no manual downloading or file picker dialogs**.
- Automatic state restoration on reconnect or app restart.

### 3. Bundled Private Compilers & Sandboxing (Core Requirement 2)
- Compilers for **C, C++, and Python** execute privately without polluting system `PATH` or requiring external IDEs.
- Sandboxed execution in temporary directories with strict 3.0s timeout enforcement to terminate infinite loops.
- **Local RUN vs Final SUBMIT**: Local `RUN` is for the student's personal test sandbox. Final `SUBMIT` is independently compiled, executed, and graded by the server against hidden test cases.

### 4. Error Sanitization Layer (Core Requirement 3)
- No debuggers, breakpoints, stack traces, compiler line numbers, or raw error logs are ever sent or shown to students.
- All outputs are sanitized at the generation layer into strictly 4 generic messages:
  - `✅ Program Executed Successfully`
  - `❌ Program Error` (for syntax / compilation errors)
  - `❌ Program Execution Failed` (for runtime crashes, non-zero exits, or wrong answers)
  - `⏱ Program Execution Timed Out` (for infinite loops exceeding 3 seconds)
- The Admin dashboard retains the full raw compiler output, stdout/stderr, and test case diffs for grading and inspection.

---

## 🚀 How to Launch the Application

### Method 1: Double-Click the Desktop Launcher (Standalone Desktop Window)
Double-click:
```text
Start-BugHunt.bat
```
*(Automatically starts backend server and opens the application in a standalone desktop window)*

### Method 2: Run via Terminal
```bash
npm run dev
```

---

## 🔑 Pre-Seeded Accounts

| Role | Username | Password | Notes |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin` | `admin123` | Full contest management, file push, and raw diagnostics |
| **Student** | `student1` | `pass1` | Team Alice |
| **Student** | `student2` | `pass2` | Team Bob |
| **Student** | `student3` | `pass3` | Team Charlie |
| **Student** | `student4` | `pass4` | Team Dana |

*Admins can also create additional student accounts live from the Admin Dashboard.*

---

## 🧪 Running Automated Tests

Run the full test suite verifying compiler sandboxing, role security, error sanitization, and server-side verification:

```bash
npm test
```
