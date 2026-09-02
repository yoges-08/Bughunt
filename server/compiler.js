/**
 * Bundled Compiler & Sandboxed Execution Engine
 * 
 * CORE REQUIREMENT 2:
 * Executes C, C++, and Python privately without relying on external IDEs.
 * Uses bundled compilers located in <app_root>/bin/compilers/ or configured fallbacks.
 * Isolated execution in dedicated temp sandbox directories with strict timeouts,
 * stream buffer limits, and stripped environment variables.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn, execFile, exec } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..');

// Maximum combined stdout/stderr buffer size in bytes (512 KB) to prevent memory exhaustion
const MAX_OUTPUT_BUFFER_BYTES = 512 * 1024;

// Default paths for bundled private compilers
const BUNDLED_COMPILERS = {
  c: {
    gcc: path.join(APP_ROOT, 'bin', 'compilers', 'c_cpp', 'bin', 'gcc.exe'),
    tcc: path.join(APP_ROOT, 'bin', 'compilers', 'c_cpp', 'tcc.exe')
  },
  cpp: {
    gpp: path.join(APP_ROOT, 'bin', 'compilers', 'c_cpp', 'bin', 'g++.exe')
  },
  python: {
    python: path.join(APP_ROOT, 'bin', 'compilers', 'python', 'python.exe')
  }
};

/**
 * Build a restricted, isolated environment object for sandboxed subprocesses.
 * Strips all server secrets, database keys, and JWT environment variables.
 */
function getSanitizedEnv(cwd, extraPath = '') {
  const isWindows = process.platform === 'win32';
  const basePaths = [extraPath, process.env.PATH].filter(Boolean).join(isWindows ? ';' : ':');

  return {
    PATH: basePaths,
    SYSTEMROOT: process.env.SYSTEMROOT || 'C:\\Windows',
    SYSTEMDRIVE: process.env.SYSTEMDRIVE || 'C:',
    WINDIR: process.env.WINDIR || 'C:\\Windows',
    COMSPEC: process.env.COMSPEC || 'C:\\Windows\\system32\\cmd.exe',
    PATHEXT: process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD',
    LOCALAPPDATA: process.env.LOCALAPPDATA,
    APPDATA: process.env.APPDATA,
    TEMP: cwd,
    TMP: cwd,
    PYTHONUNBUFFERED: '1',
    PYTHONDONTWRITEBYTECODE: '1'
  };
}

/**
 * Locate the compiler executable for the given language.
 * Checks the private bundled directory first, then falls back to system PATH if in dev mode.
 */
export function getCompilerPath(lang) {
  const isWindows = process.platform === 'win32';
  const ext = isWindows ? '.exe' : '';

  if (lang === 'c') {
    if (fs.existsSync(BUNDLED_COMPILERS.c.gcc)) return BUNDLED_COMPILERS.c.gcc;
    if (fs.existsSync(BUNDLED_COMPILERS.c.tcc)) return BUNDLED_COMPILERS.c.tcc;
    return `gcc${ext}`;
  }
  
  if (lang === 'cpp') {
    if (fs.existsSync(BUNDLED_COMPILERS.cpp.gpp)) return BUNDLED_COMPILERS.cpp.gpp;
    return `g++${ext}`;
  }

  if (lang === 'python' || lang === 'py') {
    if (fs.existsSync(BUNDLED_COMPILERS.python.python)) return BUNDLED_COMPILERS.python.python;
    return isWindows ? 'python' : 'python3';
  }

  throw new Error(`Unsupported language: ${lang}`);
}

/**
 * Helper to forcibly terminate a process and its child tree (cross-platform, Windows taskkill)
 */
export function killProcessTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') {
    exec(`taskkill /pid ${pid} /T /F`, () => {});
  } else {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {}
    }
  }
}

/**
 * Executes a compilation command.
 * Returns { success, stdout, stderr, rawError }
 */
async function compileSource(compilerCmd, args, cwd) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let totalBytes = 0;

    const child = spawn(compilerCmd, args, {
      cwd,
      windowsHide: true,
      detached: process.platform !== 'win32',
      env: getSanitizedEnv(cwd, path.dirname(compilerCmd))
    });

    child.stdout?.on('data', (d) => {
      if (totalBytes < MAX_OUTPUT_BUFFER_BYTES) {
        stdout += d.toString();
        totalBytes += d.length;
      }
    });

    child.stderr?.on('data', (d) => {
      if (totalBytes < MAX_OUTPUT_BUFFER_BYTES) {
        stderr += d.toString();
        totalBytes += d.length;
      }
    });

    child.on('error', (err) => {
      resolve({
        success: false,
        stdout,
        stderr: stderr || err.message,
        rawError: `Compiler process error: ${err.message}`
      });
    });

    child.on('close', (code) => {
      resolve({
        success: code === 0,
        stdout,
        stderr,
        rawError: code !== 0 ? `Compilation failed with code ${code}.\n${stderr}` : ''
      });
    });
  });
}

/**
 * Executes a compiled binary or script with stdin and timeout.
 */
async function runBinary(binaryPath, args, cwd, stdinText = '', timeoutMs = 3000) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let totalBytes = 0;
    let timedOut = false;
    const startTime = Date.now();

    const child = spawn(binaryPath, args, {
      cwd,
      windowsHide: true,
      detached: process.platform !== 'win32',
      env: getSanitizedEnv(cwd, path.dirname(binaryPath))
    });

    const timer = setTimeout(() => {
      timedOut = true;
      killProcessTree(child.pid);
    }, timeoutMs);

    if (stdinText && child.stdin) {
      child.stdin.write(stdinText);
      child.stdin.end();
    } else if (child.stdin) {
      child.stdin.end();
    }

    child.stdout?.on('data', (d) => {
      if (totalBytes < MAX_OUTPUT_BUFFER_BYTES) {
        stdout += d.toString();
        totalBytes += d.length;
      }
    });

    child.stderr?.on('data', (d) => {
      if (totalBytes < MAX_OUTPUT_BUFFER_BYTES) {
        stderr += d.toString();
        totalBytes += d.length;
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      const durationMs = Date.now() - startTime;
      resolve({
        runtimeSuccess: false,
        timedOut,
        exitCode: -1,
        stdout,
        stderr: stderr || err.message,
        rawError: err.message,
        durationMs
      });
    });

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      const durationMs = Date.now() - startTime;

      if (timedOut || signal === 'SIGKILL' || signal === 'SIGTERM') {
        resolve({
          runtimeSuccess: false,
          timedOut: true,
          exitCode: -1,
          stdout,
          stderr: 'Execution timed out',
          rawError: `Process exceeded execution time limit of ${timeoutMs}ms`,
          durationMs
        });
        return;
      }

      resolve({
        runtimeSuccess: code === 0,
        timedOut: false,
        exitCode: code ?? 0,
        stdout,
        stderr,
        rawError: code !== 0 ? `Runtime error (exit code ${code}): ${stderr}` : '',
        durationMs
      });
    });
  });
}

/**
 * Execute source code for C, C++, or Python in a sandboxed temp directory.
 * 
 * @param {Object} options
 * @param {string} options.code - Source code string
 * @param {string} options.language - 'c', 'cpp', or 'python'
 * @param {string} [options.stdin] - Input to program
 * @param {number} [options.timeoutMs=3000] - Max runtime in ms
 * @returns {Promise<Object>} Raw execution result
 */
export async function executeCode({ code, language, stdin = '', timeoutMs = 3000 }) {
  const normLang = language.toLowerCase().trim();
  const sandboxId = `bh_run_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const sandboxDir = path.join(os.tmpdir(), sandboxId);

  try {
    fs.mkdirSync(sandboxDir, { recursive: true });

    let sourceFileName;
    let executableName = process.platform === 'win32' ? 'program.exe' : 'program.out';
    let compilerPath;

    if (normLang === 'c') {
      sourceFileName = 'main.c';
      compilerPath = getCompilerPath('c');
      const sourceFilePath = path.join(sandboxDir, sourceFileName);
      const exeFilePath = path.join(sandboxDir, executableName);
      fs.writeFileSync(sourceFilePath, code, 'utf-8');

      // Compile C
      const compileRes = await compileSource(compilerPath, [sourceFileName, '-O2', '-o', executableName], sandboxDir);
      if (!compileRes.success) {
        return {
          compileSuccess: false,
          runtimeSuccess: false,
          timedOut: false,
          exitCode: 1,
          stdout: compileRes.stdout,
          stderr: compileRes.stderr,
          rawError: compileRes.rawError,
          durationMs: 0
        };
      }

      // Run C executable
      const runRes = await runBinary(exeFilePath, [], sandboxDir, stdin, timeoutMs);
      return {
        compileSuccess: true,
        ...runRes
      };
    } else if (normLang === 'cpp' || normLang === 'c++') {
      sourceFileName = 'main.cpp';
      compilerPath = getCompilerPath('cpp');
      const sourceFilePath = path.join(sandboxDir, sourceFileName);
      const exeFilePath = path.join(sandboxDir, executableName);
      fs.writeFileSync(sourceFilePath, code, 'utf-8');

      // Compile C++
      const compileRes = await compileSource(compilerPath, [sourceFileName, '-O2', '-std=c++17', '-o', executableName], sandboxDir);
      if (!compileRes.success) {
        return {
          compileSuccess: false,
          runtimeSuccess: false,
          timedOut: false,
          exitCode: 1,
          stdout: compileRes.stdout,
          stderr: compileRes.stderr,
          rawError: compileRes.rawError,
          durationMs: 0
        };
      }

      // Run C++ executable
      const runRes = await runBinary(exeFilePath, [], sandboxDir, stdin, timeoutMs);
      return {
        compileSuccess: true,
        ...runRes
      };
    } else if (normLang === 'python' || normLang === 'py') {
      sourceFileName = 'main.py';
      compilerPath = getCompilerPath('python');
      const sourceFilePath = path.join(sandboxDir, sourceFileName);
      fs.writeFileSync(sourceFilePath, code, 'utf-8');

      // Syntax check for Python
      const syntaxCheck = await new Promise((resolve) => {
        execFile(compilerPath, ['-m', 'py_compile', sourceFileName], {
          cwd: sandboxDir,
          env: getSanitizedEnv(sandboxDir, path.dirname(compilerPath))
        }, (err, stdout, stderr) => {
          if (err) {
            resolve({ success: false, stderr: stderr || err.message });
          } else {
            resolve({ success: true, stderr: '' });
          }
        });
      });

      if (!syntaxCheck.success) {
        return {
          compileSuccess: false,
          runtimeSuccess: false,
          timedOut: false,
          exitCode: 1,
          stdout: '',
          stderr: syntaxCheck.stderr,
          rawError: `Python SyntaxError:\n${syntaxCheck.stderr}`,
          durationMs: 0
        };
      }

      // Run Python script
      const runRes = await runBinary(compilerPath, [sourceFileName], sandboxDir, stdin, timeoutMs);
      return {
        compileSuccess: true,
        ...runRes
      };
    } else {
      return {
        compileSuccess: false,
        runtimeSuccess: false,
        timedOut: false,
        exitCode: 1,
        stdout: '',
        stderr: `Unsupported language ${normLang}`,
        rawError: `Unsupported language: ${normLang}`,
        durationMs: 0
      };
    }
  } catch (err) {
    return {
      compileSuccess: false,
      runtimeSuccess: false,
      timedOut: false,
      exitCode: 1,
      stdout: '',
      stderr: err.message,
      rawError: `Execution engine error: ${err.message}`,
      durationMs: 0
    };
  } finally {
    // Cleanup temporary sandbox folder
    try {
      fs.rmSync(sandboxDir, { recursive: true, force: true });
    } catch {}
  }
}
