import React, { useState, useEffect } from 'react';
import { 
  Users, Send, FileCode, CheckCircle2, XCircle, Clock, Plus, 
  RefreshCw, LogOut, Radio, Eye, Code, Terminal, Layers, AlertTriangle, Check
} from 'lucide-react';
import { api } from '../services/api';
import { socket } from '../services/socket';
import HostBanner from './HostBanner';

export default function AdminDashboard({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState('students'); // 'students', 'problems', 'submissions'
  const [overview, setOverview] = useState(null);
  const [students, setStudents] = useState([]);
  const [problems, setProblems] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  
  // Push problem state
  const [selectedProblemId, setSelectedProblemId] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('ALL');
  const [pushLoading, setPushLoading] = useState(false);
  const [pushSuccessMsg, setPushSuccessMsg] = useState('');

  // Modals
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
  const [newStudentData, setNewStudentData] = useState({ username: '', password: '', name: '' });

  const [showAddProblemModal, setShowAddProblemModal] = useState(false);
  const [newProblemData, setNewProblemData] = useState({
    title: '',
    language: 'python',
    filename: '',
    description: '',
    starterCode: '',
    input1: '',
    output1: '',
    input2: '',
    output2: ''
  });

  const [selectedSubmission, setSelectedSubmission] = useState(null);

  // Load all initial admin data
  const loadData = async () => {
    try {
      const [ov, st, pr, sub] = await Promise.all([
        api.getAdminOverview(),
        api.getAdminStudents(),
        api.getAdminProblems(),
        api.getAdminSubmissions()
      ]);
      setOverview(ov);
      setStudents(st);
      setProblems(pr);
      setSubmissions(sub);
      if (pr.length > 0 && !selectedProblemId) {
        setSelectedProblemId(pr[0].id);
      }
    } catch (err) {
      console.error('Failed to load admin data:', err);
    }
  };

  useEffect(() => {
    loadData();

    // Listen to real-time events from WebSocket
    const unsubOnline = socket.on('STUDENT_ONLINE', () => loadData());
    const unsubOffline = socket.on('STUDENT_OFFLINE', () => loadData());
    const unsubUpdate = socket.on('STUDENTS_UPDATED', () => loadData());
    const unsubSub = socket.on('NEW_SUBMISSION', (payload) => {
      loadData();
    });

    const interval = setInterval(loadData, 5000); // 5s fallback polling

    return () => {
      unsubOnline();
      unsubOffline();
      unsubUpdate();
      unsubSub();
      clearInterval(interval);
    };
  }, []);

  // Handle LAN Problem Push
  const handlePushProblem = async () => {
    if (!selectedProblemId) return;
    setPushLoading(true);
    setPushSuccessMsg('');
    try {
      if (selectedStudentId === 'ALL') {
        const res = await api.assignProblem({
          problemId: selectedProblemId,
          assignAll: true
        });
        setPushSuccessMsg(`✅ Problem successfully pushed to ALL students over LAN!`);
      } else {
        const res = await api.assignProblem({
          problemId: selectedProblemId,
          studentId: selectedStudentId
        });
        const targetStudent = students.find(s => s.id === selectedStudentId);
        setPushSuccessMsg(`✅ Problem sent to ${targetStudent?.name || 'student'} (Delivered immediately: ${res.deliveredImmediately ? 'Yes' : 'Queued on reconnect'})`);
      }
      loadData();
      setTimeout(() => setPushSuccessMsg(''), 4000);
    } catch (err) {
      alert('Failed to send problem: ' + err.message);
    } finally {
      setPushLoading(false);
    }
  };

  // Create Student
  const handleCreateStudent = async (e) => {
    e.preventDefault();
    try {
      await api.createStudent(newStudentData.username, newStudentData.password, newStudentData.name);
      setShowAddStudentModal(false);
      setNewStudentData({ username: '', password: '', name: '' });
      loadData();
    } catch (err) {
      alert('Failed to create student: ' + err.message);
    }
  };

  // Create Problem
  const handleCreateProblem = async (e) => {
    e.preventDefault();
    try {
      const testCases = [];
      if (newProblemData.output1) {
        testCases.push({ input: newProblemData.input1, expectedOutput: newProblemData.output1, isHidden: false });
      }
      if (newProblemData.output2) {
        testCases.push({ input: newProblemData.input2, expectedOutput: newProblemData.output2, isHidden: true });
      }

      await api.createProblem({
        title: newProblemData.title,
        language: newProblemData.language,
        filename: newProblemData.filename || `solution.${newProblemData.language === 'python' ? 'py' : newProblemData.language}`,
        description: newProblemData.description,
        starterCode: newProblemData.starterCode,
        testCases
      });
      setShowAddProblemModal(false);
      loadData();
    } catch (err) {
      alert('Failed to create problem: ' + err.message);
    }
  };

  return (
    <div className="min-h-screen bg-surface-950 text-slate-100 flex flex-col">
      {/* Top LAN Server Banner */}
      <HostBanner isHost={true} />

      {/* Main Navigation Header */}
      <header className="bg-surface-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold">
            BH
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
              Bug Hunt <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Admin Dashboard</span>
            </h1>
            <p className="text-xs text-slate-400">Contest Host & LAN Management Console</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-surface-950 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-slate-300 font-medium">{user.name}</span>
            <span className="text-slate-500">(Admin)</span>
          </div>

          <button
            onClick={loadData}
            className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-slate-200 transition border border-slate-800"
            title="Refresh contest data"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-rose-500/10 text-rose-400 hover:text-rose-300 rounded-xl text-xs font-medium border border-rose-500/20 transition"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Logout</span>
          </button>
        </div>
      </header>

      {/* Overview Metric Cards */}
      <div className="grid grid-cols-4 gap-4 p-6 pb-2">
        <div className="bg-surface-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex justify-between items-start text-slate-400 text-xs font-medium uppercase tracking-wider mb-2">
            <span>Total Students</span>
            <Users className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100">{overview?.totalStudents ?? 0}</div>
          <div className="text-xs text-emerald-400 mt-1 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
            <span>{overview?.onlineStudents ?? 0} online on LAN</span>
          </div>
        </div>

        <div className="bg-surface-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex justify-between items-start text-slate-400 text-xs font-medium uppercase tracking-wider mb-2">
            <span>Buggy Problems</span>
            <FileCode className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100">{overview?.totalProblems ?? 0}</div>
          <div className="text-xs text-slate-500 mt-1">C, C++, and Python</div>
        </div>

        <div className="bg-surface-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex justify-between items-start text-slate-400 text-xs font-medium uppercase tracking-wider mb-2">
            <span>Submissions</span>
            <Terminal className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100">{overview?.totalSubmissions ?? 0}</div>
          <div className="text-xs text-slate-500 mt-1">Re-verified by Server</div>
        </div>

        <div className="bg-surface-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex justify-between items-start text-slate-400 text-xs font-medium uppercase tracking-wider mb-2">
            <span>Accepted Submissions</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400">{overview?.passedSubmissions ?? 0}</div>
          <div className="text-xs text-rose-400 mt-1">{overview?.failedSubmissions ?? 0} failed / wrong answer</div>
        </div>
      </div>

      {/* Action Bar: Push Problem over LAN */}
      <div className="mx-6 my-4 bg-surface-900 border border-slate-800 rounded-2xl p-4">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3 flex items-center gap-2">
          <Send className="w-4 h-4 text-emerald-400" />
          <span>LAN File Push Control (Core Requirement 1)</span>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[240px]">
            <label className="block text-[11px] text-slate-400 uppercase font-semibold mb-1">Select Problem File</label>
            <select
              value={selectedProblemId}
              onChange={(e) => setSelectedProblemId(e.target.value)}
              className="w-full bg-surface-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
            >
              {problems.map((p) => (
                <option key={p.id} value={p.id}>
                  [{p.language.toUpperCase()}] {p.title} ({p.filename})
                </option>
              ))}
            </select>
          </div>

          <div className="w-64">
            <label className="block text-[11px] text-slate-400 uppercase font-semibold mb-1">Select Target</label>
            <select
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              className="w-full bg-surface-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
            >
              <option value="ALL">📢 All Students (Group Push)</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.isOnline ? '🟢' : '⚪'} {s.name} ({s.username})
                </option>
              ))}
            </select>
          </div>

          <div className="pt-5">
            <button
              onClick={handlePushProblem}
              disabled={pushLoading || !selectedProblemId}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-950 transition"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{pushLoading ? 'Pushing...' : 'Push File to Student(s)'}</span>
            </button>
          </div>
        </div>

        {pushSuccessMsg && (
          <div className="mt-3 p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
            <Check className="w-4 h-4" />
            <span>{pushSuccessMsg}</span>
          </div>
        )}
      </div>

      {/* Main Tabs Navigation */}
      <div className="px-6 flex gap-2 border-b border-slate-800">
        <button
          onClick={() => setActiveTab('students')}
          className={`px-4 py-3 text-xs font-bold border-b-2 transition flex items-center gap-2 ${
            activeTab === 'students'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Live Students Monitor ({students.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('problems')}
          className={`px-4 py-3 text-xs font-bold border-b-2 transition flex items-center gap-2 ${
            activeTab === 'problems'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Problem Bank ({problems.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('submissions')}
          className={`px-4 py-3 text-xs font-bold border-b-2 transition flex items-center gap-2 ${
            activeTab === 'submissions'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Terminal className="w-4 h-4" />
          <span>Submissions & Raw Diagnostics ({submissions.length})</span>
        </button>
      </div>

      {/* Tab Contents */}
      <div className="flex-1 p-6 overflow-y-auto">
        {/* Tab 1: Students Monitor */}
        {activeTab === 'students' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
                Live Connected Students
              </h2>
              <button
                onClick={() => setShowAddStudentModal(true)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-medium border border-slate-700 flex items-center gap-1.5 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Student Account</span>
              </button>
            </div>

            <div className="bg-surface-900 border border-slate-800 rounded-2xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-950 text-slate-400 uppercase font-semibold border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Student Name</th>
                    <th className="py-3 px-4">Username</th>
                    <th className="py-3 px-4">Currently Assigned Problem</th>
                    <th className="py-3 px-4">Progress</th>
                    <th className="py-3 px-4">Submissions</th>
                    <th className="py-3 px-4 text-right">Quick Push</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {students.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-800/30 transition">
                      <td className="py-3 px-4">
                        {s.isOnline ? (
                          <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            Online
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-slate-500 font-medium">
                            <span className="w-2 h-2 rounded-full bg-slate-600" />
                            Offline
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-200">{s.name}</td>
                      <td className="py-3 px-4 font-mono text-slate-400">{s.username}</td>
                      <td className="py-3 px-4">
                        {s.assignment ? (
                          <div className="flex items-center gap-2">
                            <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] uppercase font-mono text-emerald-400 border border-slate-700">
                              {s.assignment.language}
                            </span>
                            <span className="text-slate-300">{s.assignment.title}</span>
                          </div>
                        ) : (
                          <span className="text-slate-500 italic">No problem assigned</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {s.hasPassed ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold text-[11px] flex items-center gap-1 w-fit">
                            <CheckCircle2 className="w-3 h-3" /> Solved
                          </span>
                        ) : s.assignment ? (
                          <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-semibold text-[11px] flex items-center gap-1 w-fit">
                            <Clock className="w-3 h-3" /> In Progress
                          </span>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-300 font-mono">{s.submissionsCount}</td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => {
                            setSelectedStudentId(s.id);
                            handlePushProblem();
                          }}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-emerald-600 text-slate-300 hover:text-white rounded-lg text-xs font-medium border border-slate-700 transition"
                        >
                          Send Selected
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 2: Problem Bank */}
        {activeTab === 'problems' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
                Contest Problem Bank
              </h2>
              <button
                onClick={() => setShowAddProblemModal(true)}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create New Buggy Problem</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {problems.map((p) => (
                <div key={p.id} className="bg-surface-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-bold text-slate-100">{p.title}</h3>
                      <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px] font-mono uppercase font-bold">
                        {p.language}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mb-3">{p.description}</p>
                    <div className="text-[11px] font-mono text-slate-500 mb-2">Filename: {p.filename}</div>

                    <div className="bg-surface-950 p-3 rounded-xl border border-slate-800 text-[11px] font-mono text-slate-300 max-h-36 overflow-y-auto mb-3">
                      <pre>{p.starterCode}</pre>
                    </div>

                    <div className="text-[11px] text-slate-400">
                      <span>Test cases: {p.testCases?.length || 0}</span>
                      <span className="mx-2">•</span>
                      <span>Time limit: {p.timeLimitMs}ms</span>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-800 flex justify-end">
                    <button
                      onClick={() => {
                        setSelectedProblemId(p.id);
                        setActiveTab('students');
                      }}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
                    >
                      <Send className="w-3 h-3 text-emerald-400" />
                      <span>Select to Push</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 3: Submissions & Raw Diagnostics */}
        {activeTab === 'submissions' && (
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
              Submissions Log & Internal Compiler Diagnostics
            </h2>

            <div className="bg-surface-900 border border-slate-800 rounded-2xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-950 text-slate-400 uppercase font-semibold border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Time</th>
                    <th className="py-3 px-4">Student</th>
                    <th className="py-3 px-4">Problem</th>
                    <th className="py-3 px-4">Result</th>
                    <th className="py-3 px-4">Sanitized Message (Student View)</th>
                    <th className="py-3 px-4">Exec Time</th>
                    <th className="py-3 px-4 text-right">Raw Diagnostics (Admin Only)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {submissions.map((sub) => (
                    <tr key={sub.id} className="hover:bg-slate-800/30 transition">
                      <td className="py-3 px-4 text-slate-400 font-mono">
                        {new Date(sub.createdAt).toLocaleTimeString()}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-200">{sub.studentName}</td>
                      <td className="py-3 px-4 text-slate-300">{sub.problemTitle}</td>
                      <td className="py-3 px-4">
                        {sub.pass ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold text-[11px]">
                            PASS
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 font-bold text-[11px]">
                            FAIL
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-300">{sub.genericMessage}</td>
                      <td className="py-3 px-4 text-slate-400 font-mono">{sub.executionTimeMs}ms</td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => setSelectedSubmission(sub)}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-medium border border-slate-700 flex items-center gap-1.5 ml-auto transition"
                        >
                          <Eye className="w-3.5 h-3.5 text-blue-400" />
                          <span>Inspect</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                  {submissions.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500">
                        No submissions recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Raw Diagnostic Inspector Modal (Admin Only) */}
      {selectedSubmission && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 z-50">
          <div className="bg-surface-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-slate-100 flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-emerald-400" />
                  <span>Submission Raw Diagnostic (Admin Internal View)</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Submitted by {selectedSubmission.studentName} for {selectedSubmission.problemTitle}
                </p>
              </div>
              <button
                onClick={() => setSelectedSubmission(null)}
                className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-surface-950 p-3 rounded-xl border border-slate-800">
                  <div className="text-slate-500 font-semibold mb-1">Sanitized Student Message</div>
                  <div className="font-mono text-slate-200">{selectedSubmission.genericMessage}</div>
                </div>
                <div className="bg-surface-950 p-3 rounded-xl border border-slate-800">
                  <div className="text-slate-500 font-semibold mb-1">Execution Duration</div>
                  <div className="font-mono text-slate-200">{selectedSubmission.executionTimeMs} ms</div>
                </div>
                <div className="bg-surface-950 p-3 rounded-xl border border-slate-800">
                  <div className="text-slate-500 font-semibold mb-1">Verdict</div>
                  <div className={`font-bold ${selectedSubmission.pass ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {selectedSubmission.pass ? 'ACCEPTED (PASS)' : 'FAILED'}
                  </div>
                </div>
              </div>

              <div>
                <div className="text-slate-400 font-bold uppercase tracking-wider mb-1.5">Submitted Code</div>
                <div className="bg-surface-950 p-3 rounded-xl border border-slate-800 font-mono text-slate-200 max-h-48 overflow-y-auto">
                  <pre>{selectedSubmission.code}</pre>
                </div>
              </div>

              <div>
                <div className="text-slate-400 font-bold uppercase tracking-wider mb-1.5">
                  Raw Server Evaluation Logs (Never Exposed to Student)
                </div>
                <div className="bg-surface-950 p-3 rounded-xl border border-slate-800 font-mono text-slate-300 max-h-48 overflow-y-auto">
                  <pre className="text-rose-400 whitespace-pre-wrap">
                    {(() => {
                      try {
                        const parsed = JSON.parse(selectedSubmission.rawOutput);
                        return parsed.stderr || parsed.rawError || JSON.stringify(parsed.testResults, null, 2);
                      } catch {
                        return selectedSubmission.rawOutput || 'No errors';
                      }
                    })()}
                  </pre>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setSelectedSubmission(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Student Account Modal */}
      {showAddStudentModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 z-50">
          <div className="bg-surface-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <h3 className="text-base font-bold text-slate-100 mb-4">Create New Student Account</h3>
            <form onSubmit={handleCreateStudent} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Student Full Name / Team</label>
                <input
                  type="text"
                  required
                  value={newStudentData.name}
                  onChange={(e) => setNewStudentData({ ...newStudentData, name: e.target.value })}
                  placeholder="e.g. Eve Adams (Team E)"
                  className="w-full bg-surface-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Username</label>
                <input
                  type="text"
                  required
                  value={newStudentData.username}
                  onChange={(e) => setNewStudentData({ ...newStudentData, username: e.target.value })}
                  placeholder="e.g. student5"
                  className="w-full bg-surface-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Password</label>
                <input
                  type="text"
                  required
                  value={newStudentData.password}
                  onChange={(e) => setNewStudentData({ ...newStudentData, password: e.target.value })}
                  placeholder="e.g. pass5"
                  className="w-full bg-surface-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddStudentModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold"
                >
                  Create Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Problem Modal */}
      {showAddProblemModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 z-50">
          <div className="bg-surface-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col p-6 shadow-2xl">
            <h3 className="text-base font-bold text-slate-100 mb-4">Create New Buggy Problem</h3>
            <form onSubmit={handleCreateProblem} className="space-y-4 text-xs overflow-y-auto flex-1 pr-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Problem Title</label>
                  <input
                    type="text"
                    required
                    value={newProblemData.title}
                    onChange={(e) => setNewProblemData({ ...newProblemData, title: e.target.value })}
                    placeholder="e.g. Fix Stack Underflow"
                    className="w-full bg-surface-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Language</label>
                  <select
                    value={newProblemData.language}
                    onChange={(e) => setNewProblemData({ ...newProblemData, language: e.target.value })}
                    className="w-full bg-surface-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="python">Python</option>
                    <option value="cpp">C++</option>
                    <option value="c">C</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Filename</label>
                <input
                  type="text"
                  value={newProblemData.filename}
                  onChange={(e) => setNewProblemData({ ...newProblemData, filename: e.target.value })}
                  placeholder="e.g. stack_fix.py"
                  className="w-full bg-surface-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Description / Contest Prompt</label>
                <textarea
                  rows={2}
                  value={newProblemData.description}
                  onChange={(e) => setNewProblemData({ ...newProblemData, description: e.target.value })}
                  placeholder="Explain the bug hunt objective..."
                  className="w-full bg-surface-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Starter Buggy Code</label>
                <textarea
                  rows={6}
                  required
                  value={newProblemData.starterCode}
                  onChange={(e) => setNewProblemData({ ...newProblemData, starterCode: e.target.value })}
                  placeholder="Paste buggy code that students will fix..."
                  className="w-full bg-surface-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-surface-950 border border-slate-800 rounded-xl">
                  <div className="font-semibold text-slate-300 mb-1">Sample Test Case (Visible)</div>
                  <textarea
                    rows={2}
                    value={newProblemData.input1}
                    onChange={(e) => setNewProblemData({ ...newProblemData, input1: e.target.value })}
                    placeholder="Input stdin..."
                    className="w-full bg-surface-900 border border-slate-800 rounded-lg p-2 font-mono mb-2"
                  />
                  <textarea
                    rows={2}
                    value={newProblemData.output1}
                    onChange={(e) => setNewProblemData({ ...newProblemData, output1: e.target.value })}
                    placeholder="Expected stdout..."
                    className="w-full bg-surface-900 border border-slate-800 rounded-lg p-2 font-mono"
                  />
                </div>

                <div className="p-3 bg-surface-950 border border-slate-800 rounded-xl">
                  <div className="font-semibold text-slate-300 mb-1">Hidden Test Case (Scoring)</div>
                  <textarea
                    rows={2}
                    value={newProblemData.input2}
                    onChange={(e) => setNewProblemData({ ...newProblemData, input2: e.target.value })}
                    placeholder="Hidden stdin..."
                    className="w-full bg-surface-900 border border-slate-800 rounded-lg p-2 font-mono mb-2"
                  />
                  <textarea
                    rows={2}
                    value={newProblemData.output2}
                    onChange={(e) => setNewProblemData({ ...newProblemData, output2: e.target.value })}
                    placeholder="Expected stdout..."
                    className="w-full bg-surface-900 border border-slate-800 rounded-lg p-2 font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddProblemModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold"
                >
                  Create Problem
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
