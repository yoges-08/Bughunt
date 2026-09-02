import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { 
  Play, Send, CheckCircle2, XCircle, Clock, AlertTriangle, 
  FileCode, Terminal, LogOut, Radio, RefreshCw, Save, Layers, Sparkles, Lock
} from 'lucide-react';
import { api } from '../services/api';
import { socket } from '../services/socket';

export default function StudentEditor({ user, onLogout }) {
  const [problem, setProblem] = useState(null);
  const [code, setCode] = useState('');
  const [activeTab, setActiveTab] = useState('description'); // 'description' or 'history'
  const [runLoading, setRunLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [lastResult, setLastResult] = useState(null); // { success, status, message, isSubmit }
  const [submissions, setSubmissions] = useState([]);
  const [autoSaveStatus, setAutoSaveStatus] = useState('Saved');
  const [incomingAlert, setIncomingAlert] = useState(null);
  const [timeLeftSeconds, setTimeLeftSeconds] = useState(null);
  
  const saveTimeoutRef = useRef(null);

  // Load current assignment on mount or reconnect (Core Requirement 1)
  const loadState = async () => {
    try {
      const data = await api.getStudentCurrentProblem();
      if (data.assigned && data.problem) {
        setProblem(data.problem);
        setCode(data.problem.currentCode || data.problem.starterCode || '');
      } else {
        setProblem(null);
      }

      // Load past submissions
      const subs = await api.getStudentSubmissions();
      setSubmissions(subs);
    } catch (err) {
      console.error('Failed to load student state:', err);
    }
  };

  useEffect(() => {
    loadState();

    // Listen for real-time problem push over LAN (Core Requirement 1)
    const unsubProblemPush = socket.on('PROBLEM_ASSIGNED', (payload) => {
      setProblem(payload);
      setCode(payload.starterCode || payload.code || '');
      setLastResult(null);
      setIncomingAlert(`⚡ New Problem Assigned by Admin: "${payload.title}" (${payload.filename}) • ⏱️ ${payload.durationMinutes || 15} Mins`);
      setTimeout(() => setIncomingAlert(null), 6000);
    });

    return () => {
      unsubProblemPush();
    };
  }, []);

  // Live Timer countdown management
  useEffect(() => {
    if (!problem) {
      setTimeLeftSeconds(null);
      return;
    }

    const calcTimeLeft = () => {
      if (!problem.expiresAt && !problem.assignedAt) return null;
      const expiry = problem.expiresAt 
        ? new Date(problem.expiresAt).getTime()
        : new Date(problem.assignedAt).getTime() + (problem.durationMinutes || 15) * 60 * 1000;
      const diff = Math.max(0, Math.floor((expiry - Date.now()) / 1000));
      return diff;
    };

    setTimeLeftSeconds(calcTimeLeft());

    const interval = setInterval(() => {
      const remaining = calcTimeLeft();
      setTimeLeftSeconds(remaining);
      if (remaining === 0) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [problem]);

  // Format timer as MM:SS
  const formatTimer = (totalSeconds) => {
    if (totalSeconds === null || totalSeconds === undefined) return '--:--';
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Check Single Submission Limit & Expiration (mirror server assignedAt threshold)
  const currentProblemId = problem?.problemId || problem?.id;
  const hasSubmitted = Boolean(
    problem?.hasSubmitted ||
    (problem?.assignedAt &&
      submissions.some(s =>
        s.problemId === currentProblemId &&
        new Date(s.createdAt) >= new Date(problem.assignedAt)
      ))
  );
  const isTimeExpired = timeLeftSeconds !== null && timeLeftSeconds === 0;

  // Handle Code Edit & Auto-save
  const handleEditorChange = (newCode) => {
    const val = newCode || '';
    setCode(val);
    setAutoSaveStatus('Saving...');

    clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await api.saveDraftCode(val);
        setAutoSaveStatus('Saved');
      } catch {
        setAutoSaveStatus('Unsaved');
      }
    }, 1500);
  };

  // Local / Sandbox Test Run (Core Requirement 2 & 3)
  const handleRun = async () => {
    if (!problem || !code) return;
    setRunLoading(true);
    setLastResult(null);

    try {
      // Use sample test case stdin if available
      const stdin = problem.sampleTestCase?.input || '';
      const result = await api.runStudentCode({
        code,
        language: problem.language,
        stdin
      });
      // result is strictly { success, status, message }
      setLastResult({ ...result, isSubmit: false });
    } catch (err) {
      setLastResult({
        success: false,
        status: 'PROGRAM_ERROR',
        message: '❌ Program Error',
        isSubmit: false
      });
    } finally {
      setRunLoading(false);
    }
  };

  // Final Submit with Server Re-verification (Core Requirement 2 & 3 - One-time Only)
  const handleSubmit = async () => {
    if (!problem || !code) return;
    if (hasSubmitted || isTimeExpired) return;

    setSubmitLoading(true);
    setLastResult(null);

    try {
      const result = await api.submitStudentCode({
        problemId: currentProblemId,
        code,
        language: problem.language
      });
      // result is strictly { success, status, message }
      setLastResult({ ...result, isSubmit: true });

      // Refresh past submissions
      const subs = await api.getStudentSubmissions();
      setSubmissions(subs);
      setProblem(prev => prev ? { ...prev, hasSubmitted: true } : prev);

      // Auto-switch to History tab so student sees their recorded submission in the list
      setActiveTab('history');
    } catch (err) {
      setLastResult({
        success: false,
        status: 'EXECUTION_FAILED',
        message: err.message.includes('already submitted') 
          ? '❌ Already Submitted — Only 1 submission allowed'
          : err.message.includes('expired')
          ? '⏱ Contest Time Expired'
          : '❌ Program Execution Failed',
        isSubmit: true
      });
    } finally {
      setSubmitLoading(false);
    }
  };

  // Determine Monaco editor language mapping
  const monacoLanguage = (() => {
    const lang = (problem?.language || '').toLowerCase();
    if (lang === 'cpp' || lang === 'c++') return 'cpp';
    if (lang === 'c') return 'c';
    if (lang === 'python' || lang === 'py') return 'python';
    return 'plaintext';
  })();

  return (
    <div className="h-screen w-screen flex flex-col bg-surface-950 text-slate-100 overflow-hidden select-none">
      {/* Top Header - Fixed Height */}
      <header className="shrink-0 bg-surface-900 border-b border-slate-800 px-5 py-2.5 flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-sm">
            BH
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-white tracking-tight text-sm">Bug Hunt Contest</span>
              {problem && (
                <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] uppercase font-mono font-bold">
                  {problem.language}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 truncate max-w-xs md:max-w-md">
              {problem ? problem.title : 'Waiting for Admin to assign problem...'}
            </p>
          </div>
        </div>

        {/* Real-time LAN File Push Notification Alert */}
        {incomingAlert && (
          <div className="animate-bounce bg-emerald-500 text-surface-950 px-3 py-1 rounded-full text-xs font-bold shadow-lg flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            <span>{incomingAlert}</span>
          </div>
        )}

        <div className="flex items-center gap-3">
          {/* Live Contest Timer Display */}
          {problem && timeLeftSeconds !== null && (
            <div
              className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-mono font-bold border transition ${
                isTimeExpired
                  ? 'bg-slate-800 text-slate-400 border-slate-700'
                  : timeLeftSeconds <= 120
                  ? 'bg-rose-500/10 text-rose-400 border-rose-500/30 animate-pulse'
                  : timeLeftSeconds <= 300
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>{isTimeExpired ? 'TIME EXPIRED' : `⏱ ${formatTimer(timeLeftSeconds)}`}</span>
            </div>
          )}

          <div className="flex items-center gap-2 bg-surface-950 px-3 py-1 rounded-xl border border-slate-800 text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-slate-300 font-medium">{user.name}</span>
            <span className="text-slate-500 text-[11px]">({user.username})</span>
          </div>

          <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1">
            <Save className="w-3 h-3 text-slate-500" />
            <span>{autoSaveStatus}</span>
          </div>

          <button
            onClick={onLogout}
            className="flex items-center gap-1 px-2.5 py-1 hover:bg-rose-500/10 text-rose-400 hover:text-rose-300 rounded-lg text-xs font-medium border border-rose-500/20 transition"
          >
            <LogOut className="w-3 h-3" />
            <span>Logout</span>
          </button>
        </div>
      </header>

      {/* Main Content Area - Strictly Fills Remaining Height */}
      {problem ? (
        <div className="flex-1 min-h-0 flex overflow-hidden">
          {/* Left Panel: Problem Spec & Test Case info */}
          <div className="w-80 lg:w-96 shrink-0 bg-surface-900 border-r border-slate-800 flex flex-col min-h-0 overflow-hidden">
            {/* Tab switch Header */}
            <div className="shrink-0 flex border-b border-slate-800 text-xs">
              <button
                onClick={() => setActiveTab('description')}
                className={`flex-1 py-2.5 font-bold transition flex items-center justify-center gap-1.5 ${
                  activeTab === 'description'
                    ? 'bg-surface-950 text-emerald-400 border-b-2 border-emerald-500'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileCode className="w-3.5 h-3.5" />
                <span>Problem Prompt</span>
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`flex-1 py-2.5 font-bold transition flex items-center justify-center gap-1.5 ${
                  activeTab === 'history'
                    ? 'bg-surface-950 text-emerald-400 border-b-2 border-emerald-500'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>My Submissions ({submissions.length})</span>
              </button>
            </div>

            {/* Tab 1: Description */}
            {activeTab === 'description' && (
              <div className="flex-1 min-h-0 p-4 space-y-4 overflow-y-auto text-xs">
                <div>
                  <div className="text-slate-500 font-bold uppercase tracking-wider text-[10px] mb-1">
                    Bug Hunt Challenge
                  </div>
                  <h2 className="text-sm font-bold text-white mb-2">{problem.title}</h2>
                  <p className="text-slate-300 leading-relaxed whitespace-pre-wrap text-xs">
                    {problem.description}
                  </p>
                </div>

                <div className="bg-surface-950 p-3 rounded-xl border border-slate-800 flex justify-between items-center">
                  <div>
                    <div className="text-slate-400 font-semibold mb-0.5 text-[11px]">File Target</div>
                    <div className="font-mono text-emerald-400 text-xs">{problem.filename}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-slate-400 font-semibold mb-0.5 text-[11px]">Time Limit</div>
                    <div className="font-mono text-amber-400 text-xs">{problem.durationMinutes || 15} Mins</div>
                  </div>
                </div>

                {problem.sampleTestCase && (
                  <div className="bg-surface-950 p-3 rounded-xl border border-slate-800 space-y-2">
                    <div className="text-slate-400 font-semibold uppercase text-[10px]">Sample Test Case</div>
                    {problem.sampleTestCase.input && (
                      <div>
                        <div className="text-slate-500 text-[10px] font-mono mb-1">Sample Input:</div>
                        <pre className="font-mono text-slate-200 bg-surface-900 p-2 rounded text-[11px] overflow-x-auto whitespace-pre">
                          {problem.sampleTestCase.input}
                        </pre>
                      </div>
                    )}
                    {problem.sampleTestCase.expectedOutput && (
                      <div>
                        <div className="text-slate-500 text-[10px] font-mono mb-1">Expected Output:</div>
                        <pre className="font-mono text-emerald-300 bg-surface-900 p-2 rounded text-[11px] overflow-x-auto whitespace-pre">
                          {problem.sampleTestCase.expectedOutput}
                        </pre>
                      </div>
                    )}
                  </div>
                )}

                <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-[11px] text-blue-300 space-y-1.5">
                  <div className="font-bold flex items-center gap-1.5">
                    <span>💡 Contest Rules & Instructions</span>
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-blue-200/80 text-[11px]">
                    <li>Find and fix the bugs directly in the code editor.</li>
                    <li>Click <strong>RUN</strong> to test against sample input as many times as you like.</li>
                    <li><strong>ONE SUBMISSION ONLY:</strong> Once you click <strong>SUBMIT</strong>, your solution is final and recorded.</li>
                    <li>Keep an eye on the <strong>⏱ Timer</strong> at the top bar.</li>
                  </ul>
                </div>
              </div>
            )}

            {/* Tab 2: Submission History */}
            {activeTab === 'history' && (
              <div className="flex-1 min-h-0 p-4 space-y-2.5 overflow-y-auto text-xs">
                <div className="text-slate-400 font-bold uppercase tracking-wider text-[10px] mb-1">
                  Submission History
                </div>
                {submissions.map((sub, idx) => (
                  <div
                    key={sub.id || idx}
                    className="p-3 bg-surface-950 border border-slate-800 rounded-xl flex items-center justify-between"
                  >
                    <div>
                      <div className="font-bold text-slate-200 text-xs">
                        Submission #{submissions.length - idx}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                        {new Date(sub.createdAt).toLocaleTimeString()}
                      </div>
                      <div className="text-[11px] font-mono mt-1 text-slate-300">
                        {sub.genericMessage}
                      </div>
                    </div>
                    <div>
                      {sub.pass ? (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold text-[10px]">
                          PASS
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 font-bold text-[10px]">
                          FAIL
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {submissions.length === 0 && (
                  <div className="text-center py-8 text-slate-500 text-xs">
                    No submissions made yet.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Center & Right: Locked-Down Monaco Code Editor */}
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-surface-950">
            {/* Editor File Bar */}
            <div className="shrink-0 bg-surface-950 border-b border-slate-800 px-4 py-2 flex justify-between items-center text-xs">
              <div className="flex items-center gap-2 text-slate-300 font-mono">
                <FileCode className="w-3.5 h-3.5 text-emerald-400" />
                <span>{problem.filename}</span>
              </div>
              <div className="text-[11px] text-slate-500">
                Bundled Compiler Sandboxed • Auto-Saved
              </div>
            </div>

            {/* Monaco Editor Container - Shrinks Dynamically */}
            <div className="flex-1 min-h-0 relative overflow-hidden">
              <Editor
                height="100%"
                language={monacoLanguage}
                theme="vs-dark"
                value={code}
                onChange={handleEditorChange}
                options={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 13,
                  lineNumbers: 'on',
                  minimap: { enabled: false },
                  quickSuggestions: false,
                  parameterHints: { enabled: false },
                  suggestOnTriggerCharacters: false,
                  hover: { enabled: false },
                  contextmenu: false,
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  tabSize: 4,
                  wordWrap: 'on'
                }}
              />
            </div>

            {/* Bottom Action & Generic Status Panel - Fixed Docked at Bottom */}
            <div className="shrink-0 bg-surface-900 border-t border-slate-800 p-3.5 flex flex-col gap-2.5 z-10 shadow-lg">
              {/* Sanitized Pass/Fail Banner */}
              {lastResult && (
                <div
                  className={`p-2.5 px-3.5 rounded-xl border flex flex-col gap-1.5 transition-all ${
                    lastResult.status === 'SUCCESS'
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : lastResult.status === 'TIMEOUT'
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  }`}
                >
                  {/* Action Header: Clearly distinguishes Official SUBMIT from Local RUN */}
                  <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider font-sans">
                      {lastResult.isSubmit ? (
                        <span className="flex items-center gap-1.5 text-emerald-400 bg-emerald-500/20 px-2.5 py-0.5 rounded-md border border-emerald-500/30">
                          <Send className="w-3 h-3" />
                          <span>Official Submission Recorded</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-blue-400 bg-blue-500/20 px-2.5 py-0.5 rounded-md border border-blue-500/30">
                          <Play className="w-3 h-3 fill-blue-400" />
                          <span>Local Test Run (Sandbox)</span>
                        </span>
                      )}
                    </div>

                    <span className="text-[10px] text-slate-400 font-sans font-medium">
                      {lastResult.isSubmit ? 'Evaluated & Saved on Server' : 'Tested with Sample Input'}
                    </span>
                  </div>

                  {/* Sanitized Message */}
                  <div className="flex items-center gap-2">
                    {lastResult.status === 'SUCCESS' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : lastResult.status === 'TIMEOUT' ? (
                      <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    )}
                    <span className="text-xs font-mono font-bold">{lastResult.message}</span>
                  </div>
                </div>
              )}

              {/* Action Buttons: RUN and SUBMIT */}
              <div className="flex items-center justify-between">
                <div className="text-[11px] text-slate-400 font-sans">
                  {hasSubmitted ? (
                    <span className="text-emerald-400 font-medium flex items-center gap-1">
                      <Lock className="w-3.5 h-3.5" />
                      <span>Submission locked • 1 of 1 attempt used for this problem</span>
                    </span>
                  ) : isTimeExpired ? (
                    <span className="text-rose-400 font-medium flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Contest time has expired for this problem • Submissions closed</span>
                    </span>
                  ) : (
                    <span>Click <strong>RUN</strong> to test locally, <strong>SUBMIT</strong> for final evaluation (1 attempt only)</span>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={handleRun}
                    disabled={runLoading || submitLoading}
                    className="px-5 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-100 rounded-xl text-xs font-bold flex items-center gap-2 border border-slate-700 transition shadow"
                  >
                    <Play className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400" />
                    <span>{runLoading ? 'Running...' : 'RUN'}</span>
                  </button>

                  <button
                    onClick={handleSubmit}
                    disabled={submitLoading || runLoading || hasSubmitted || isTimeExpired}
                    className={`px-6 py-2 rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg transition ${
                      hasSubmitted
                        ? 'bg-slate-800 text-emerald-400 border border-emerald-500/30 cursor-not-allowed shadow-none'
                        : isTimeExpired
                        ? 'bg-slate-800 text-rose-400 border border-rose-500/30 cursor-not-allowed shadow-none'
                        : 'bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white shadow-emerald-950'
                    }`}
                  >
                    {hasSubmitted ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span>SUBMITTED (1/1)</span>
                      </>
                    ) : isTimeExpired ? (
                      <>
                        <Clock className="w-3.5 h-3.5 text-rose-400" />
                        <span>TIME EXPIRED</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>{submitLoading ? 'Evaluating...' : 'SUBMIT'}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Empty State: Waiting for Admin to push file */
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-surface-900 border border-slate-800 flex items-center justify-center text-emerald-400 mb-4 animate-pulse">
            <Radio className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-bold text-slate-100 mb-1">Waiting for Problem Assignment</h2>
          <p className="text-xs text-slate-400 max-w-sm mb-6">
            The contest administrator will push the problem file directly to your screen over LAN. No manual download is required.
          </p>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-900 border border-slate-800 text-xs text-slate-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Connected to LAN Contest Host</span>
          </div>
        </div>
      )}
    </div>
  );
}
