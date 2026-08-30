# 🐞 BUG HUNT — LAN Coding Contest Platform

A single desktop application for running LAN-based "Bug Hunt" coding contests with role-based UI (Admin Dashboard vs. Student Contest Editor), private bundled compilers, instant LAN problem push, independent server re-verification, and strict error sanitization.

---

## 🌟 Core Architecture & Key Features

### 1. Single Application with Role-Based Desktop Interface
- The same application is installed on every computer (Admin PC & Student PCs).
- **Host Mode (Admin PC)**: Starts the embedded Express + WebSocket server on `0.0.0.0:4000`, hosts the contest database, and connects its local UI as Admin.
- **Client Mode (Student PCs)**: Connects to the Host PC's LAN IP address (e.g., `http://192.168.1.50:4000`).
- **Server-Side Role Enforcement**: All administrative APIs (file push, student list, raw compiler diagnostics) strictly check `req.user.role === 'admin'`. Any unauthorized student request is rejected with `403 Forbidden`.

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

## 🚀 Setup & Launch Guide for New / Fresh Computers

### 1. Clone & Setup
Clone or copy the repository to a non-synced directory (e.g., `C:\Dev\Bughunt`):

```bash
git clone https://github.com/yoges-08/Bughunt.git
cd Bughunt
```

### 2. Install Dependencies & Build Frontend
```bash
npm install
npm run build
```

*(Note: If you see `npm warn allow-scripts` regarding electron/esbuild, approve them by running `npm approve-scripts electron` and `npm approve-scripts esbuild`, then re-run `npm install`)*

### 3. Launch the Application

#### Option A: One-Click Launcher (Recommended)
Double-click:
```text
Start-BugHunt.bat
```
*(Automatically verifies dependencies and launches the native Electron desktop application window)*

#### Option B: Launch via Terminal
```bash
npm start
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

## 🛠️ Troubleshooting Common Setup Issues

| Issue / Error | Cause | Solution |
| :--- | :--- | :--- |
| `ERR_CONNECTION_REFUSED` | Server was not running or `npm run build` was not run | Run `npm run build` once, then launch with `Start-BugHunt.bat` |
| `EADDRINUSE 0.0.0.0:4000` | Port 4000 held by an old background process | Check port via `netstat -ano \| findstr :4000` and kill with `taskkill /F /PID <pid>` |
| `EPERM` during install | OneDrive folder file locking / antivirus scan | Move project outside OneDrive (e.g. `C:\Dev\Bughunt`) |
| `allow-scripts` warning | Electron binary postinstall blocked by npm gate | Run `npm approve-scripts electron` & `npm approve-scripts esbuild`, then `npm install` |

---

## 🧪 Running Automated Tests

Run the full test suite verifying compiler sandboxing, role security, error sanitization, and server-side verification:

```bash
npm test
```
