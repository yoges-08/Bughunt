import fs from 'fs';
import path from 'path';
import http from 'http';
import https from 'https';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { checkAllCompilers } from '../server/compiler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..');
const COMPILERS_DIR = path.join(APP_ROOT, 'bin', 'compilers');
const C_CPP_DIR = path.join(COMPILERS_DIR, 'c_cpp');

console.log('====================================================');
console.log('🛠️  BUG HUNT: PRIVATE COMPILER SETUP & VERIFICATION');
console.log('====================================================');

let status = await checkAllCompilers();

// 1. If C compiler is missing, auto-download and setup TinyCC
if (!status.c.available) {
  console.log('\n📥 C toolchain is missing. Setting up bundled Tiny C Compiler (TCC)...');
  fs.mkdirSync(C_CPP_DIR, { recursive: true });

  const tccZip = path.join(COMPILERS_DIR, 'tcc.zip');
  const tccUrl = 'http://download.savannah.gnu.org/releases/tinycc/tcc-0.9.27-win64-bin.zip';

  try {
    console.log('Downloading Tiny C Compiler from:', tccUrl);
    await new Promise((resolve, reject) => {
      const file = fs.createWriteStream(tccZip);
      http.get(tccUrl, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`Failed to download: status ${res.statusCode}`));
          return;
        }
        res.pipe(file);
        file.on('finish', () => file.close(resolve));
      }).on('error', reject);
    });

    console.log('Extracting TCC...');
    execSync(`powershell -Command "Expand-Archive -Path '${tccZip}' -DestinationPath '${C_CPP_DIR}' -Force"`, { stdio: 'inherit' });
    
    // Move from subfolder if present
    const sub = path.join(C_CPP_DIR, 'tcc');
    if (fs.existsSync(sub)) {
      const items = fs.readdirSync(sub);
      for (const item of items) {
        const src = path.join(sub, item);
        const dst = path.join(C_CPP_DIR, item);
        if (fs.existsSync(dst)) fs.rmSync(dst, { recursive: true, force: true });
        fs.renameSync(src, dst);
      }
      fs.rmdirSync(sub);
    }
    if (fs.existsSync(tccZip)) fs.unlinkSync(tccZip);
    console.log('✅ TCC extraction complete.');
  } catch (err) {
    console.warn('⚠️  Could not auto-download TCC:', err.message);
  }
}

// 2. If C++ compiler is missing, explain MinGW-w64 requirement (TinyCC is C-only)
if (!status.cpp.available) {
  console.log('\nℹ️  C++ Toolchain Notice:');
  console.log('   TinyCC only compiles C code. To enable C++ problems (g++),');
  console.log('   please install MinGW-w64 on the host machine or place g++.exe in PATH / bin/compilers/c_cpp/bin.');
  console.log('   👉 Recommended MinGW-w64 build: https://winlibs.com/ or https://www.msys2.org/');
}

// Re-check after setup attempt
status = await checkAllCompilers();

console.log('\nResults:');
console.log(`[C Compiler]`);
console.log(`  - Status:  ${status.c.available ? '✅ Available' : '❌ Missing'}`);
console.log(`  - Path:    ${status.c.path || 'Not found'}`);
console.log(`  - Version: ${status.c.version || status.c.error || 'N/A'}\n`);

console.log(`[C++ Compiler]`);
console.log(`  - Status:  ${status.cpp.available ? '✅ Available' : '❌ Missing'}`);
console.log(`  - Path:    ${status.cpp.path || 'Not found'}`);
console.log(`  - Version: ${status.cpp.version || status.cpp.error || 'N/A'}\n`);

console.log(`[Python Interpreter]`);
console.log(`  - Status:  ${status.python.available ? '✅ Available' : '❌ Missing'}`);
console.log(`  - Path:    ${status.python.path || 'Not found'}`);
console.log(`  - Version: ${status.python.version || status.python.error || 'N/A'}\n`);

const allOk = status.c.available && status.cpp.available && status.python.available;
if (allOk) {
  console.log('🎉 ALL COMPILERS (C, C++, Python) CONFIGURED & VERIFIED!');
} else {
  console.log('⚠️  Some compilers are missing or need system installation.');
}
console.log('====================================================\n');
