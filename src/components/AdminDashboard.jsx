import React, { useState, useEffect, useRef } from 'react';
import { 
  Users, Send, FileCode, CheckCircle2, XCircle, Clock, Plus, 
  RefreshCw, LogOut, Radio, Eye, Code, Terminal, Layers, AlertTriangle, Check,
  Search, Filter, Copy, FileText, Sparkles, Download, CheckCheck,
  ChevronUp, ChevronDown, ChevronsUp, ChevronsDown, ChevronLeft, ChevronRight,
  ArrowUp, ArrowDown
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

  // Student Search & Filtering
  const [studentSearch, setStudentSearch] = useState('');
  const [studentFilter, setStudentFilter] = useState('all'); // 'all', 'online', 'offline', 'solved', 'in_progress', 'unassigned'

  // Pagination & Scroll State
  const [rowsPerPage, setRowsPerPage] = useState(10); // 10, 25, 50, 'all'
  const [currentPage, setCurrentPage] = useState(1);
  const studentTableContainerRef = useRef(null);

  // Modals
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
  const [newStudentData, setNewStudentData] = useState({ username: '', password: '', name: '' });
  
  // Bulk Student Modal
  const [showBulkStudentModal, setShowBulkStudentModal] = useState(false);
  const [bulkAddMode, setBulkAddMode] = useState('generate'); // 'generate' or 'csv'
  const [bulkGenData, setBulkGenData] = useState({ prefix: 'student', count: 10, startNumber: 1, passwordPrefix: 'pass' });
  const [bulkCsvText, setBulkCsvText] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);

  // Student Inspection Modal
  const [selectedStudentDetails, setSelectedStudentDetails] = useState(null);
  const [loadingStudentDetails, setLoadingStudentDetails] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const [showAddProblemModal, setShowAddProblemModal] = useState(false);
  const [newProblemData, setNewProblemData] = useState({
    title: '',
    language: 'python',
    filename: '',
    description: '',
    starterCode: '',
    durationMinutes: 15,
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
    const unsubSub = socket.on('NEW_SUBMISSION', () => {
      loadData();
    });

    const interval = setInterval(loadData, 3000); // 3s fallback polling

    return () => {
      unsubOnline();
      unsubOffline();
      unsubUpdate();
      unsubSub();
      clearInterval(interval);
    };
  }, []);

  // Reset page when filter or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [studentSearch, studentFilter, rowsPerPage]);

  // Compute filtered students list
  const filteredStudents = students.filter(s => {
    // Status Filter
    if (studentFilter === 'online' && !s.isOnline) return false;
    if (studentFilter === 'offline' && s.isOnline) return false;
    if (studentFilter === 'solved' && !s.hasPassed) return false;
    if (studentFilter === 'in_progress' && (!s.assignment || s.hasPassed || s.assignment.status === 'expired')) return false;
    if (studentFilter === 'expired' && s.assignment?.status !== 'expired') return false;
    if (studentFilter === 'unassigned' && s.assignment) return false;

    // Search query
    if (studentSearch.trim()) {
      const q = studentSearch.toLowerCase();
      const matchName = (s.name || '').toLowerCase().includes(q);
      const matchUsername = (s.username || '').toLowerCase().includes(q);
      const matchProblem = (s.assignment?.title || '').toLowerCase().includes(q);
      return matchName || matchUsername || matchProblem;
    }
    return true;
  });

  // Pagination calculation
  const totalFiltered = filteredStudents.length;
  const totalPages = rowsPerPage === 'all' ? 1 : Math.max(1, Math.ceil(totalFiltered / rowsPerPage));
  const effectivePage = Math.min(currentPage, totalPages);
  const startIndex = rowsPerPage === 'all' ? 0 : (effectivePage - 1) * rowsPerPage;
  const paginatedStudents = rowsPerPage === 'all'
    ? filteredStudents
    : filteredStudents.slice(startIndex, startIndex + rowsPerPage);

  // Smooth table scroll helpers
  const handleScrollUp = () => {
    if (studentTableContainerRef.current) {
      studentTableContainerRef.current.scrollBy({ top: -220, behavior: 'smooth' });
    }
  };

  const handleScrollDown = () => {
    if (studentTableContainerRef.current) {
      studentTableContainerRef.current.scrollBy({ top: 220, behavior: 'smooth' });
    }
  };

  const handleScrollTop = () => {
    if (studentTableContainerRef.current) {
      studentTableContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleScrollBottom = () => {
    if (studentTableContainerRef.current) {
      studentTableContainerRef.current.scrollTo({
        top: studentTableContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  };

  // Handle Inspect Student Details
  const handleInspectStudent = async (studentId) => {
    setLoadingStudentDetails(true);
    try {
      const details = await api.getStudentDetails(studentId);
      setSelectedStudentDetails(details);
    } catch (err) {
      alert('Failed to load student details: ' + err.message);
    } finally {
      setLoadingStudentDetails(false);
    }
  };

  // Push Problem over LAN (Core Requirement 1)
  const handlePushProblem = async (overrideStudentId = null) => {
    const targetId = overrideStudentId || selectedStudentId;
    if (!selectedProblemId) {
      alert('Please select a problem first');
      return;
    }

    setPushLoading(true);
    setPushSuccessMsg('');

    try {
      const isAll = targetId === 'ALL';
      const targetStudent = students.find(s => s.id === targetId);

      // Issue 2 UX: Confirm if re-pushing same problem to a student already working on it
      if (!isAll && targetStudent?.assignment && targetStudent.assignment.problemId === selectedProblemId) {
        const proceed = window.confirm(
          `Student "${targetStudent.name}" is already working on "${targetStudent.assignment.title}".\n\nRe-pushing will refresh their timer but preserve their typed code progress.\n\nDo you want to continue?`
        );
        if (!proceed) {
          setPushLoading(false);
          return;
        }
      }

      const res = await api.assignProblem({
        problemId: selectedProblemId,
        studentId: isAll ? undefined : targetId,
        assignAll: isAll
      });

      if (isAll) {
        setPushSuccessMsg(`✅ Problem successfully pushed to ALL ${students.length} students over LAN!`);
      } else {
        const targetStudent = students.find(s => s.id === targetId);
        setPushSuccessMsg(`✅ Problem sent to ${targetStudent?.name || 'student'} (${res.deliveredImmediately ? 'Delivered Live' : 'Queued for Connect'})`);
      }
      loadData();
      setTimeout(() => setPushSuccessMsg(''), 4000);
    } catch (err) {
      alert('Failed to send problem: ' + err.message);
    } finally {
      setPushLoading(false);
    }
  };

  // Create Single Student
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

  // Bulk Create Students
  const handleBulkCreateStudents = async (e) => {
    e.preventDefault();
    setBulkLoading(true);
    try {
      let payload;
      if (bulkAddMode === 'generate') {
        payload = { generate: bulkGenData };
      } else {
        // Parse CSV format: username, password, name
        const lines = bulkCsvText.trim().split('\n');
        const studentList = [];
        for (const line of lines) {
          const parts = line.split(',').map(s => s.trim());
          if (parts.length >= 2 && parts[0] && parts[1]) {
            studentList.push({
              username: parts[0],
              password: parts[1],
              name: parts[2] || parts[0]
            });
          }
        }
        if (studentList.length === 0) {
          alert('No valid student entries found in CSV text. Expected: username, password, Name');
          setBulkLoading(false);
          return;
        }
        payload = { students: studentList };
      }

      const res = await api.createBulkStudents(payload);
      setShowBulkStudentModal(false);
      setBulkCsvText('');
      alert(`🎉 Successfully created ${res.createdCount} student accounts!${res.errorsCount > 0 ? ` (${res.errorsCount} skipped/duplicates)` : ''}`);
      loadData();
    } catch (err) {
      alert('Bulk creation failed: ' + err.message);
    } finally {
      setBulkLoading(false);
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
        durationMinutes: Number(newProblemData.durationMinutes) || 15,
        testCases
      });
      setShowAddProblemModal(false);
      setNewProblemData({
        title: '',
        language: 'python',
        filename: '',
        description: '',
        starterCode: '',
        durationMinutes: 15,
        input1: '',
        output1: '',
        input2: '',
        output2: ''
      });
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
          <div className="text-2xl font-bold text-slate-100">{overview?.totalStudents ?? students.length}</div>
          <div className="text-xs text-emerald-400 mt-1 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
            <span>{students.filter(s => s.isOnline).length} online on LAN</span>
          </div>
        </div>

        <div className="bg-surface-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex justify-between items-start text-slate-400 text-xs font-medium uppercase tracking-wider mb-2">
            <span>Buggy Problems</span>
            <FileCode className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100">{overview?.totalProblems ?? problems.length}</div>
          <div className="text-xs text-slate-500 mt-1">C, C++, and Python</div>
        </div>

        <div className="bg-surface-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex justify-between items-start text-slate-400 text-xs font-medium uppercase tracking-wider mb-2">
            <span>Submissions</span>
            <Terminal className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100">{overview?.totalSubmissions ?? submissions.length}</div>
          <div className="text-xs text-slate-500 mt-1">Recorded & re-verified</div>
        </div>

        <div className="bg-surface-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex justify-between items-start text-slate-400 text-xs font-medium uppercase tracking-wider mb-2">
            <span>Passed Solutions</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400">{overview?.passedSubmissions ?? submissions.filter(s => s.pass).length}</div>
          <div className="text-xs text-slate-500 mt-1">
            {overview?.totalSubmissions ? Math.round(((overview?.passedSubmissions || 0) / overview.totalSubmissions) * 100) : 0}% success rate
          </div>
        </div>
      </div>

      {/* LAN Problem Push Quick Bar */}
      <div className="mx-6 my-4 p-4 bg-gradient-to-r from-surface-900 to-surface-950 border border-emerald-500/20 rounded-2xl shadow-lg">
        <div className="flex items-center gap-2 mb-3">
          <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200">
            LAN Problem Dispatch (Direct File Push)
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-[11px] text-slate-400 uppercase font-semibold mb-1">Select Problem</label>
            <select
              value={selectedProblemId}
              onChange={(e) => setSelectedProblemId(e.target.value)}
              className="w-full bg-surface-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
            >
              {problems.map((p) => (
                <option key={p.id} value={p.id}>
                  [{p.language.toUpperCase()}] {p.title} ({p.filename}) • ⏱️ {p.durationMinutes || 15}m
                </option>
              ))}
            </select>
          </div>

          <div className="w-72">
            <label className="block text-[11px] text-slate-400 uppercase font-semibold mb-1">Select Target</label>
            <select
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              className="w-full bg-surface-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
            >
              <option value="ALL">📢 All Students ({students.length} Total)</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.isOnline ? '🟢' : '⚪'} {s.name} ({s.username}) {s.assignment ? `[${s.assignment.title.slice(0, 15)}...]` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="pt-5">
            <button
              onClick={() => handlePushProblem()}
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
          className={`pb-3 px-4 text-xs font-bold transition flex items-center gap-2 border-b-2 ${
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
          className={`pb-3 px-4 text-xs font-bold transition flex items-center gap-2 border-b-2 ${
            activeTab === 'problems'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileCode className="w-4 h-4" />
          <span>Problem Bank ({problems.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('submissions')}
          className={`pb-3 px-4 text-xs font-bold transition flex items-center gap-2 border-b-2 ${
            activeTab === 'submissions'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Terminal className="w-4 h-4" />
          <span>Submissions & Compiler Diagnostics ({submissions.length})</span>
        </button>
      </div>

      {/* Tab Contents */}
      <div className="flex-1 p-6 overflow-y-auto">
        {/* Tab 1: Students Monitor */}
        {activeTab === 'students' && (
          <div className="space-y-4">
            {/* Header with Search, Filter & Actions */}
            <div className="flex flex-wrap justify-between items-center gap-4">
              <div>
                <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                  <span>Live Connected Students</span>
                  <span className="px-2 py-0.5 bg-slate-800 text-slate-400 text-xs rounded-full font-normal">
                    Showing {paginatedStudents.length} on page ({totalFiltered} matching of {students.length} total)
                  </span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">Real-time status, problem tracking, and code inspector</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowBulkStudentModal(true)}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold border border-slate-700 flex items-center gap-1.5 transition shadow"
                >
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Bulk Generate / CSV</span>
                </button>

                <button
                  onClick={() => setShowAddStudentModal(true)}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow shadow-emerald-950"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Single Student</span>
                </button>
              </div>
            </div>

            {/* Search & Filter Toolbar */}
            <div className="bg-surface-900 border border-slate-800 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3">
              {/* Search Bar */}
              <div className="relative flex-1 min-w-[240px]">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  placeholder="Search by student name, username, or problem..."
                  className="w-full bg-surface-950 border border-slate-800 rounded-xl pl-9 pr-8 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                />
                {studentSearch && (
                  <button
                    onClick={() => setStudentSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs font-bold"
                  >
                    ×
                  </button>
                )}
              </div>

              {/* Status Filter Chips */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <button
                  onClick={() => setStudentFilter('all')}
                  className={`px-2.5 py-1 rounded-lg font-medium transition ${
                    studentFilter === 'all'
                      ? 'bg-slate-700 text-white font-bold'
                      : 'bg-surface-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  All ({students.length})
                </button>

                <button
                  onClick={() => setStudentFilter('online')}
                  className={`px-2.5 py-1 rounded-lg font-medium transition flex items-center gap-1.5 ${
                    studentFilter === 'online'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold'
                      : 'bg-surface-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                  <span>Online ({students.filter(s => s.isOnline).length})</span>
                </button>

                <button
                  onClick={() => setStudentFilter('offline')}
                  className={`px-2.5 py-1 rounded-lg font-medium transition flex items-center gap-1.5 ${
                    studentFilter === 'offline'
                      ? 'bg-slate-700 text-slate-200 font-bold'
                      : 'bg-surface-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-500 inline-block" />
                  <span>Offline ({students.filter(s => !s.isOnline).length})</span>
                </button>

                <button
                  onClick={() => setStudentFilter('solved')}
                  className={`px-2.5 py-1 rounded-lg font-medium transition flex items-center gap-1.5 ${
                    studentFilter === 'solved'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold'
                      : 'bg-surface-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  <span>Solved ({students.filter(s => s.hasPassed).length})</span>
                </button>

                <button
                  onClick={() => setStudentFilter('in_progress')}
                  className={`px-2.5 py-1 rounded-lg font-medium transition flex items-center gap-1.5 ${
                    studentFilter === 'in_progress'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold'
                      : 'bg-surface-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  <Clock className="w-3 h-3 text-amber-400" />
                  <span>In Progress ({students.filter(s => s.assignment && !s.hasPassed && s.assignment.status !== 'expired').length})</span>
                </button>

                <button
                  onClick={() => setStudentFilter('expired')}
                  className={`px-2.5 py-1 rounded-lg font-medium transition flex items-center gap-1.5 ${
                    studentFilter === 'expired'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold'
                      : 'bg-surface-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  <Clock className="w-3 h-3 text-rose-400" />
                  <span>Timed Out ({students.filter(s => s.assignment?.status === 'expired').length})</span>
                </button>

                <button
                  onClick={() => setStudentFilter('unassigned')}
                  className={`px-2.5 py-1 rounded-lg font-medium transition ${
                    studentFilter === 'unassigned'
                      ? 'bg-slate-700 text-slate-200 font-bold'
                      : 'bg-surface-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  Unassigned ({students.filter(s => !s.assignment).length})
                </button>
              </div>
            </div>

            {/* Scroll Navigation & Pagination Control Bar (Top) */}
            <div className="bg-surface-900 border border-slate-800 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-3">
                <span className="text-slate-400 font-medium">
                  Showing <strong className="text-slate-200">{startIndex + 1} - {Math.min(startIndex + paginatedStudents.length, totalFiltered)}</strong> of <strong className="text-slate-200">{totalFiltered}</strong> students
                </span>

                <div className="flex items-center gap-1.5 text-slate-400">
                  <span>Per page:</span>
                  <select
                    value={rowsPerPage}
                    onChange={(e) => setRowsPerPage(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                    className="bg-surface-950 border border-slate-800 rounded-lg px-2 py-1 text-slate-200 focus:outline-none focus:border-emerald-500"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value="all">All ({totalFiltered})</option>
                  </select>
                </div>
              </div>

              {/* Interactive Scroll & Page Buttons */}
              <div className="flex items-center gap-2">
                {/* Scroll Action Buttons */}
                <div className="flex items-center bg-surface-950 border border-slate-800 rounded-xl p-0.5 gap-0.5 shadow">
                  <button
                    onClick={handleScrollTop}
                    title="Jump to Top"
                    className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-emerald-400 rounded-lg transition"
                  >
                    <ChevronsUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={handleScrollUp}
                    title="Scroll Up"
                    className="px-2 py-1 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg flex items-center gap-1 transition font-medium"
                  >
                    <ChevronUp className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Scroll Up</span>
                  </button>
                  <div className="w-[1px] h-4 bg-slate-800" />
                  <button
                    onClick={handleScrollDown}
                    title="Scroll Down"
                    className="px-2 py-1 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg flex items-center gap-1 transition font-medium"
                  >
                    <ChevronDown className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Scroll Down</span>
                  </button>
                  <button
                    onClick={handleScrollBottom}
                    title="Jump to Bottom"
                    className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-emerald-400 rounded-lg transition"
                  >
                    <ChevronsDown className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Page Prev/Next Buttons */}
                {rowsPerPage !== 'all' && totalPages > 1 && (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={effectivePage <= 1}
                      className="px-2.5 py-1.5 bg-surface-950 hover:bg-slate-800 disabled:opacity-40 text-slate-300 rounded-lg border border-slate-800 flex items-center gap-1 transition font-medium"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>Prev</span>
                    </button>
                    <span className="px-2 text-slate-400 font-mono">
                      Page {effectivePage} of {totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={effectivePage >= totalPages}
                      className="px-2.5 py-1.5 bg-surface-950 hover:bg-slate-800 disabled:opacity-40 text-slate-300 rounded-lg border border-slate-800 flex items-center gap-1 transition font-medium"
                    >
                      <span>Next</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Students Table with Dedicated Scroll Container & Sticky Header */}
            <div className="bg-surface-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <div ref={studentTableContainerRef} className="max-h-[420px] overflow-y-auto overflow-x-auto scroll-smooth">
                <table className="w-full text-left text-xs min-w-[850px]">
                  <thead className="bg-surface-950 text-slate-400 uppercase font-semibold border-b border-slate-800 sticky top-0 z-10 shadow">
                    <tr>
                      <th className="py-3 px-4 bg-surface-950">Status</th>
                      <th className="py-3 px-4 bg-surface-950">Student / Team Name</th>
                      <th className="py-3 px-4 bg-surface-950">Username</th>
                      <th className="py-3 px-4 bg-surface-950">Currently Assigned Problem</th>
                      <th className="py-3 px-4 bg-surface-950">Progress</th>
                      <th className="py-3 px-4 bg-surface-950">Submissions</th>
                      <th className="py-3 px-4 bg-surface-950 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-sans">
                    {paginatedStudents.map((s) => (
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
                        <td className="py-3 px-4 font-semibold text-slate-100">{s.name}</td>
                        <td className="py-3 px-4 font-mono text-slate-400">{s.username}</td>
                        <td className="py-3 px-4">
                          {s.assignment ? (
                            <div className="flex items-center gap-2">
                              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] uppercase font-mono text-emerald-400 border border-slate-700">
                                {s.assignment.language}
                              </span>
                              <span className="text-slate-200 font-medium">{s.assignment.title}</span>
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
                          ) : s.assignment?.status === 'expired' ? (
                            <span className="px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 font-semibold text-[11px] flex items-center gap-1 w-fit" title="Contest timer expired with no submission">
                              <Clock className="w-3 h-3" /> Timed Out
                            </span>
                          ) : s.assignment ? (
                            <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-semibold text-[11px] flex items-center gap-1 w-fit">
                              <Clock className="w-3 h-3" /> In Progress
                            </span>
                          ) : (
                            <span className="text-slate-600">-</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-300 font-mono">
                          <span className="px-2 py-0.5 bg-surface-950 rounded border border-slate-800">
                            {s.submissionsCount} attempt{s.submissionsCount !== 1 ? 's' : ''}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleInspectStudent(s.id)}
                              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-semibold border border-slate-700 flex items-center gap-1 transition"
                              title="Inspect Student Code & Status"
                            >
                              <Eye className="w-3 h-3 text-blue-400" />
                              <span>Details</span>
                            </button>

                            <button
                              onClick={() => {
                                setSelectedStudentId(s.id);
                                handlePushProblem(s.id);
                              }}
                              className="px-2.5 py-1.5 bg-slate-800 hover:bg-emerald-600 text-slate-300 hover:text-white rounded-lg text-xs font-semibold border border-slate-700 flex items-center gap-1 transition"
                              title="Push Selected Problem to this student"
                            >
                              <Send className="w-3 h-3 text-emerald-400" />
                              <span>Push</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {paginatedStudents.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-slate-500 text-xs">
                          No students match your search or filter criteria.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Bottom Quick Scroll & Pagination Bar */}
            <div className="bg-surface-900 border border-slate-800 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="text-slate-400">
                {totalFiltered} students found • Use scroll buttons or page controls to navigate
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleScrollUp}
                  className="px-3 py-1.5 bg-surface-950 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg border border-slate-800 flex items-center gap-1.5 transition font-medium"
                >
                  <ChevronUp className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Scroll Up</span>
                </button>
                <button
                  onClick={handleScrollDown}
                  className="px-3 py-1.5 bg-surface-950 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg border border-slate-800 flex items-center gap-1.5 transition font-medium"
                >
                  <ChevronDown className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Scroll Down</span>
                </button>
                <button
                  onClick={handleScrollTop}
                  className="px-2.5 py-1.5 bg-surface-950 hover:bg-slate-800 text-slate-400 hover:text-emerald-400 rounded-lg border border-slate-800 transition font-medium"
                  title="Scroll to Top"
                >
                  <ChevronsUp className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Problem Bank */}
        {activeTab === 'problems' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
                Buggy Problem Repository ({problems.length})
              </h2>
              <button
                onClick={() => setShowAddProblemModal(true)}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow shadow-emerald-950"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create New Buggy Problem</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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

                    <div className="text-[11px] text-slate-400 flex items-center gap-2">
                      <span>Test cases: {p.testCases?.length || 0}</span>
                      <span>•</span>
                      <span className="text-emerald-400 font-medium flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>{p.durationMinutes || 15} mins timer</span>
                      </span>
                      <span>•</span>
                      <span>Sandbox: {p.timeLimitMs}ms</span>
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
                      <span>Select for LAN Push</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 3: Submissions View */}
        {activeTab === 'submissions' && (
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
              Contest Submissions & Internal Diagnostics ({submissions.length})
            </h2>

            <div className="bg-surface-900 border border-slate-800 rounded-2xl overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[700px]">
                <thead className="bg-surface-950 text-slate-400 uppercase font-semibold border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Time</th>
                    <th className="py-3 px-4">Student</th>
                    <th className="py-3 px-4">Problem</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Runtime</th>
                    <th className="py-3 px-4 text-right">Internal Raw Diagnostics</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-sans">
                  {submissions.map((sub) => (
                    <tr key={sub.id} className="hover:bg-slate-800/30 transition">
                      <td className="py-3 px-4 font-mono text-slate-400 text-[11px]">
                        {new Date(sub.createdAt).toLocaleTimeString()}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-200">
                        {sub.studentName} <span className="text-slate-500 font-mono text-[11px]">({sub.studentUsername})</span>
                      </td>
                      <td className="py-3 px-4 text-slate-300">{sub.problemTitle}</td>
                      <td className="py-3 px-4">
                        {sub.pass ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold text-[10px]">
                            PASS
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 font-bold text-[10px]">
                            FAIL ({sub.status})
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-400 text-[11px]">
                        {sub.executionTimeMs}ms
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => setSelectedSubmission(sub)}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-semibold border border-slate-700 transition"
                        >
                          View Logs & Code
                        </button>
                      </td>
                    </tr>
                  ))}
                  {submissions.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500 text-xs">
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

      {/* Student Detail Inspector Modal */}
      {selectedStudentDetails && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 z-50">
          <div className="bg-surface-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col p-6 shadow-2xl">
            <div className="flex justify-between items-start border-b border-slate-800 pb-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    {selectedStudentDetails.student.name}
                    {selectedStudentDetails.student.isOnline ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                        🟢 Online on LAN
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-500 border border-slate-700 text-[10px] font-bold">
                        ⚪ Offline
                      </span>
                    )}
                  </h3>
                  <p className="text-xs font-mono text-slate-400">
                    Username: {selectedStudentDetails.student.username} • ID: {selectedStudentDetails.student.id}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedStudentDetails(null)}
                className="text-slate-400 hover:text-white text-lg font-bold p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto flex-1 pr-2 text-xs">
              {/* Current Assignment Card */}
              <div className="bg-surface-950 p-4 rounded-xl border border-slate-800">
                <div className="text-slate-400 font-bold uppercase tracking-wider text-[10px] mb-2">
                  Assigned Contest Problem
                </div>
                {selectedStudentDetails.assignment ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-white text-sm">
                        {selectedStudentDetails.assignment.title}
                      </div>
                      <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono text-[10px] uppercase">
                        {selectedStudentDetails.assignment.language}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-400 text-[11px] font-mono">
                      <span>Target File: {selectedStudentDetails.assignment.filename}</span>
                      <span>•</span>
                      <span>Assigned: {new Date(selectedStudentDetails.assignment.assignedAt).toLocaleTimeString()}</span>
                      <span>•</span>
                      <span>Duration: {selectedStudentDetails.assignment.durationMinutes}m</span>
                      <span>•</span>
                      <span className={selectedStudentDetails.assignment.status === 'expired' ? 'text-rose-400 font-bold' : selectedStudentDetails.assignment.status === 'passed' ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                        Status: {selectedStudentDetails.assignment.status === 'expired' ? '⏱️ Timed Out (No submission)' : selectedStudentDetails.assignment.status}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="text-slate-500 italic">No problem currently assigned to this student.</div>
                )}
              </div>

              {/* Student Current Draft Code */}
              {selectedStudentDetails.assignment && selectedStudentDetails.assignment.currentCode && (
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-slate-400 font-semibold uppercase text-[10px]">
                      Student Current Code Draft
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(selectedStudentDetails.assignment.currentCode);
                        setCopiedCode(true);
                        setTimeout(() => setCopiedCode(false), 2000);
                      }}
                      className="px-2 py-0.5 bg-slate-800 text-slate-300 rounded text-[10px] flex items-center gap-1 hover:bg-slate-700"
                    >
                      {copiedCode ? <CheckCheck className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedCode ? 'Copied' : 'Copy Code'}</span>
                    </button>
                  </div>
                  <div className="bg-surface-950 p-3 rounded-xl border border-slate-800 font-mono text-slate-200 text-[11px] max-h-48 overflow-y-auto">
                    <pre>{selectedStudentDetails.assignment.currentCode}</pre>
                  </div>
                </div>
              )}

              {/* Submissions History for this student */}
              <div>
                <div className="text-slate-400 font-bold uppercase tracking-wider text-[10px] mb-2">
                  Submissions History ({selectedStudentDetails.submissions?.length || 0})
                </div>
                <div className="space-y-2">
                  {(selectedStudentDetails.submissions || []).map((sub, idx) => (
                    <div
                      key={sub.id || idx}
                      className="p-3 bg-surface-950 border border-slate-800 rounded-xl flex items-center justify-between"
                    >
                      <div>
                        <div className="font-bold text-slate-200 text-xs">
                          {sub.problemTitle || 'Submission'}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                          {new Date(sub.createdAt).toLocaleTimeString()} • {sub.executionTimeMs}ms
                        </div>
                      </div>
                      <div>
                        {sub.pass ? (
                          <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold text-[10px]">
                            PASS
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 font-bold text-[10px]">
                            FAIL ({sub.status})
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  {(!selectedStudentDetails.submissions || selectedStudentDetails.submissions.length === 0) && (
                    <div className="text-slate-500 text-center py-4 text-xs">
                      No submissions recorded for this student.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800 flex justify-between items-center">
              <button
                onClick={() => {
                  const studentId = selectedStudentDetails.student.id;
                  setSelectedStudentDetails(null);
                  handlePushProblem(studentId);
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Push Selected Problem to This Student</span>
              </button>

              <button
                onClick={() => setSelectedStudentDetails(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Single Add Student Account Modal */}
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

      {/* Bulk Generate & CSV Import Student Modal */}
      {showBulkStudentModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 z-50">
          <div className="bg-surface-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl">
            <h3 className="text-base font-bold text-slate-100 mb-1 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span>Bulk Student Account Creation</span>
            </h3>
            <p className="text-xs text-slate-400 mb-4">Quickly generate student accounts or paste a CSV list.</p>

            {/* Mode Switch */}
            <div className="flex border-b border-slate-800 mb-4 text-xs">
              <button
                type="button"
                onClick={() => setBulkAddMode('generate')}
                className={`flex-1 py-2 font-bold transition flex items-center justify-center gap-1.5 ${
                  bulkAddMode === 'generate'
                    ? 'text-emerald-400 border-b-2 border-emerald-500'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>⚡ Auto-Generate Range</span>
              </button>
              <button
                type="button"
                onClick={() => setBulkAddMode('csv')}
                className={`flex-1 py-2 font-bold transition flex items-center justify-center gap-1.5 ${
                  bulkAddMode === 'csv'
                    ? 'text-emerald-400 border-b-2 border-emerald-500'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>📋 CSV / Text Paste</span>
              </button>
            </div>

            <form onSubmit={handleBulkCreateStudents} className="space-y-4 text-xs">
              {bulkAddMode === 'generate' ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-400 font-semibold mb-1">Username Prefix</label>
                      <input
                        type="text"
                        required
                        value={bulkGenData.prefix}
                        onChange={(e) => setBulkGenData({ ...bulkGenData, prefix: e.target.value })}
                        placeholder="e.g. student"
                        className="w-full bg-surface-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 font-semibold mb-1">Password Prefix</label>
                      <input
                        type="text"
                        required
                        value={bulkGenData.passwordPrefix}
                        onChange={(e) => setBulkGenData({ ...bulkGenData, passwordPrefix: e.target.value })}
                        placeholder="e.g. pass"
                        className="w-full bg-surface-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-400 font-semibold mb-1">Start Number</label>
                      <input
                        type="number"
                        min="1"
                        required
                        value={bulkGenData.startNumber}
                        onChange={(e) => setBulkGenData({ ...bulkGenData, startNumber: e.target.value })}
                        className="w-full bg-surface-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 font-semibold mb-1">How Many Accounts?</label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        required
                        value={bulkGenData.count}
                        onChange={(e) => setBulkGenData({ ...bulkGenData, count: e.target.value })}
                        className="w-full bg-surface-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  <div className="p-3 bg-surface-950 rounded-xl border border-slate-800 text-[11px] text-slate-400">
                    Will create accounts: <strong className="text-emerald-400">{bulkGenData.prefix}{bulkGenData.startNumber}</strong> to <strong className="text-emerald-400">{bulkGenData.prefix}{Number(bulkGenData.startNumber) + Number(bulkGenData.count) - 1}</strong> with passwords <strong className="text-amber-400">{bulkGenData.passwordPrefix}1</strong>, <strong className="text-amber-400">{bulkGenData.passwordPrefix}2</strong>...
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="block text-slate-400 font-semibold">
                    Paste Student Rows (Format: <code className="text-emerald-400 font-mono">username, password, Full Name / Team</code>)
                  </label>
                  <textarea
                    rows={6}
                    required
                    value={bulkCsvText}
                    onChange={(e) => setBulkCsvText(e.target.value)}
                    placeholder="student10, pass10, Alice (Team 10)&#10;student11, pass11, Bob (Team 11)&#10;student12, pass12, Charlie (Team 12)"
                    className="w-full bg-surface-950 border border-slate-800 rounded-xl p-3 text-slate-200 font-mono focus:outline-none focus:border-emerald-500 text-xs"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowBulkStudentModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={bulkLoading}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl font-bold flex items-center gap-1.5 shadow"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{bulkLoading ? 'Creating...' : 'Create Accounts'}</span>
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
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
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
                <div>
                  <label className="block text-slate-400 font-semibold mb-1 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Contest Timer (Mins)</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="180"
                    required
                    value={newProblemData.durationMinutes}
                    onChange={(e) => setNewProblemData({ ...newProblemData, durationMinutes: e.target.value })}
                    placeholder="e.g. 15"
                    className="w-full bg-surface-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                  />
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
                  className="w-full bg-surface-950 border border-slate-800 rounded-xl p-3 text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 p-3 bg-surface-950 rounded-xl border border-slate-800">
                <div className="col-span-2 font-semibold text-slate-300">Sample Test Case (Visible to Student)</div>
                <div>
                  <label className="block text-slate-500 mb-1">Sample Input</label>
                  <input
                    type="text"
                    value={newProblemData.input1}
                    onChange={(e) => setNewProblemData({ ...newProblemData, input1: e.target.value })}
                    placeholder="e.g. 5\n1 2 3 4 5"
                    className="w-full bg-surface-900 border border-slate-800 rounded-lg px-2.5 py-1.5 font-mono text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">Expected Output</label>
                  <input
                    type="text"
                    value={newProblemData.output1}
                    onChange={(e) => setNewProblemData({ ...newProblemData, output1: e.target.value })}
                    placeholder="e.g. 5"
                    className="w-full bg-surface-900 border border-slate-800 rounded-lg px-2.5 py-1.5 font-mono text-slate-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 p-3 bg-surface-950 rounded-xl border border-slate-800">
                <div className="col-span-2 font-semibold text-slate-300">Hidden Test Case (Evaluator Only)</div>
                <div>
                  <label className="block text-slate-500 mb-1">Hidden Input</label>
                  <input
                    type="text"
                    value={newProblemData.input2}
                    onChange={(e) => setNewProblemData({ ...newProblemData, input2: e.target.value })}
                    placeholder="e.g. 3\n-5 -2 -1"
                    className="w-full bg-surface-900 border border-slate-800 rounded-lg px-2.5 py-1.5 font-mono text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">Expected Output</label>
                  <input
                    type="text"
                    value={newProblemData.output2}
                    onChange={(e) => setNewProblemData({ ...newProblemData, output2: e.target.value })}
                    placeholder="e.g. -1"
                    className="w-full bg-surface-900 border border-slate-800 rounded-lg px-2.5 py-1.5 font-mono text-slate-200"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
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
                  Create & Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Submission Details Modal (Admin Diagnostics) */}
      {selectedSubmission && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 z-50">
          <div className="bg-surface-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col p-6 shadow-2xl text-xs">
            <div className="flex justify-between items-start border-b border-slate-800 pb-3 mb-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  Submission Diagnostics
                  {selectedSubmission.pass ? (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs">
                      PASS
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 text-xs">
                      FAIL ({selectedSubmission.status})
                    </span>
                  )}
                </h3>
                <p className="text-slate-400 mt-1">
                  Student: <strong className="text-slate-200">{selectedSubmission.studentName}</strong> ({selectedSubmission.studentUsername}) • Problem: <strong className="text-slate-200">{selectedSubmission.problemTitle}</strong>
                </p>
              </div>
              <button
                onClick={() => setSelectedSubmission(null)}
                className="text-slate-400 hover:text-white text-lg font-bold p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto flex-1 pr-2">
              <div>
                <div className="text-slate-400 font-semibold uppercase text-[10px] mb-1">Submitted Source Code</div>
                <div className="bg-surface-950 p-3 rounded-xl border border-slate-800 font-mono text-slate-200 text-[11px] max-h-48 overflow-y-auto">
                  <pre>{selectedSubmission.code}</pre>
                </div>
              </div>

              <div>
                <div className="text-slate-400 font-semibold uppercase text-[10px] mb-1">
                  Raw Compiler & Evaluator Internal Diagnostics
                </div>
                <div className="bg-surface-950 p-3 rounded-xl border border-slate-800 font-mono text-slate-300 text-[11px] max-h-48 overflow-y-auto whitespace-pre-wrap">
                  {selectedSubmission.rawOutput || 'No output recorded'}
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-800 mt-4">
              <button
                onClick={() => setSelectedSubmission(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
