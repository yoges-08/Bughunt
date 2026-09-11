import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/600.css';
import '@fontsource/jetbrains-mono/700.css';
import App from './App';
import './index.css';

// Client-Side Diagnostic & Error Telemetry Buffer (for lab debugging)
window.bughuntDiagnostics = {
  errors: [],
  logs: [],
  getReport() {
    return {
      userAgent: navigator.userAgent,
      errors: this.errors,
      logs: this.logs,
      time: new Date().toISOString()
    };
  }
};

window.onerror = (message, source, lineno, colno, error) => {
  const errEntry = {
    type: 'error',
    message: String(message),
    source,
    lineno,
    colno,
    stack: error ? error.stack : null,
    timestamp: new Date().toISOString()
  };
  window.bughuntDiagnostics.errors.push(errEntry);
  console.warn('[BugHunt Diagnostics Error]', errEntry);
  return false;
};

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  const rejectEntry = {
    type: 'unhandledrejection',
    message: reason ? (reason.message || String(reason)) : 'Unknown rejection',
    stack: reason ? reason.stack : null,
    timestamp: new Date().toISOString()
  };
  window.bughuntDiagnostics.errors.push(rejectEntry);
  console.warn('[BugHunt Diagnostics Rejection]', rejectEntry);
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
