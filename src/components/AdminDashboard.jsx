import React, { useState, useEffect, useRef } from 'react';
import { 
  Users, User, Send, FileCode, CheckCircle2, XCircle, Clock, Plus, 
  RefreshCw, LogOut, Radio, Eye, Code, Terminal, Layers, AlertTriangle, Check,
  Search, Filter, Copy, FileText, Sparkles, Download, CheckCheck,
  ChevronUp, ChevronDown, ChevronsUp, ChevronsDown, ChevronLeft, ChevronRight,
  ArrowUp, ArrowDown, Pencil, Trash2
} from 'lucide-react';
import { api } from '../services/api';
import { socket } from '../services/socket';
import { formatDuration } from '../utils/time';
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
  const [keepStudentCode, setKeepStudentCode] = useState(false); // Issue 3: keep draft code on re-assign (unchecked by default)

  // Student Search & Filtering
  const [studentSearch, setStudentSearch] = useState('');
  const [studentFilter, setStudentFilter] = useState('all'); // 'all', 'online', 'offline', 'solved', 'in_progress', 'unassigned'

  // Pagination & Scroll State
  const [rowsPerPage, setRowsPerPage] = useState('all'); // 10, 25, 50, 'all'
  const [currentPage, setCurrentPage] = useState(1);
  const studentTableContainerRef = useRef(null);

  // Add Students Modal (Solo vs Team)
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
  const [studentCreationType, setStudentCreationType] = useState('select'); // 'select', 'solo', or 'team'
  const [soloStudentData, setSoloStudentData] = useState({ name: '', password: '' });
  const [teamStudentData, setTeamStudentData] = useState({ teamName: '', teammates: '', password: '' });
  const [creationLoading, setCreationLoading] = useState(false);
  
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
  const [editingProblemId, setEditingProblemId] = useState(null); // null = create mode, id = edit mode
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
      studentTableContainerRef.current.scrollBy({ top: -240, behavior: 'smooth' });
    }
  };

  const handleScrollDown = () => {
    if (studentTableContainerRef.current) {
      studentTableContainerRef.current.scrollBy({ top: 240, behavior: 'smooth' });
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

      // Issue 3 UX: Confirm if re-pushing same problem to a student already working on it
      if (!isAll && targetStudent?.assignment && targetStudent.assignment.problemId === selectedProblemId) {
        const actionDesc = keepStudentCode 
          ? "preserve their current code progress." 
          : "RESET their code to the fresh starter template.";
        const proceed = window.confirm(
          `Student "${targetStudent.name}" is already working on "${targetStudent.assignment.title}".\n\nRe-pushing will refresh their timer and ${actionDesc}\n\nDo you want to continue?`
        );
        if (!proceed) {
          setPushLoading(false);
          return;
        }
      }

      const res = await api.assignProblem({
        problemId: selectedProblemId,
        studentId: isAll ? undefined : targetId,
        assignAll: isAll,
        resetCode: !keepStudentCode
      });

      if (isAll) {
        setPushSuccessMsg(`✅ Problem successfully pushed to ALL ${students.length} students over LAN!`);
      } else {
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

  // Create Solo Student
  const handleCreateSoloStudent = async (e) => {
    e.preventDefault();
    if (!soloStudentData.name.trim() || !soloStudentData.password.trim()) {
      alert('Please enter both student name and password.');
      return;
    }
    try {
      setCreationLoading(true);
      const res = await api.createStudent({
        name: soloStudentData.name.trim(),
        password: soloStudentData.password.trim(),
        isTeam: false
      });
      setShowAddStudentModal(false);
      setSoloStudentData({ name: '', password: '' });
      alert(`🎉 Successfully created Solo Student account "${res.name}"!\n\nUsername: ${res.username}\n(Student can log in using either their name or username)`);
      loadData();
    } catch (err) {
      alert('Failed to create student: ' + err.message);
    } finally {
      setCreationLoading(false);
    }
  };

  // Create Team
  const handleCreateTeam = async (e) => {
    e.preventDefault();
    if (!teamStudentData.teamName.trim() || !teamStudentData.teammates.trim() || !teamStudentData.password.trim()) {
      alert('Please enter team name, teammates names, and password.');
      return;
    }
    try {
      setCreationLoading(true);
      const res = await api.createStudent({
        name: teamStudentData.teamName.trim(),
        teamName: teamStudentData.teamName.trim(),
        teammates: teamStudentData.teammates.trim(),
        password: teamStudentData.password.trim(),
        isTeam: true
      });
      setShowAddStudentModal(false);
      setTeamStudentData({ teamName: '', teammates: '', password: '' });
      alert(`🎉 Successfully created Team account "${res.name}"!\n\nTeam Members: ${res.teammates}\nUsername: ${res.username}\n(Team can log in using either team name or username)`);
      loadData();
    } catch (err) {
      alert('Failed to create team: ' + err.message);
    } finally {
      setCreationLoading(false);
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

  // Remove Student Account
  const handleRemoveStudent = async (studentId, studentName, studentUsername) => {
    if (!window.confirm(`Are you sure you want to remove student "${studentName}" (${studentUsername})?\n\nThis will permanently delete their account and associated submissions.`)) {
      return;
    }
    try {
      await api.deleteStudent(studentId);
      setStudents(prev => prev.filter(s => s.id !== studentId));
      if (selectedStudentId === studentId) {
        setSelectedStudentId('ALL');
      }
      loadData();
    } catch (err) {
      alert('Failed to remove student: ' + err.message);
    }
  };

  // Feature 2: Delete Problem with confirmation and reference error handling
  const handleDeleteProblem = async (problemId, title) => {
    if (!window.confirm(`Delete problem "${title}"? This cannot be undone.`)) return;
    try {
      await api.deleteProblem(problemId);
      setProblems(prev => prev.filter(p => p.id !== problemId));
      if (selectedProblemId === problemId) {
        const remaining = problems.filter(p => p.id !== problemId);
        setSelectedProblemId(remaining.length > 0 ? remaining[0].id : '');
      }
    } catch (err) {
      if (err.message.includes('referenced by')) {
        const forceDelete = window.confirm(
          `${err.message}\n\nDelete anyway? Existing submissions will be kept for records, but future re-pushes of this problem will fail.`
        );
        if (forceDelete) {
          try {
            await api.deleteProblem(problemId, true);
            setProblems(prev => prev.filter(p => p.id !== problemId));
            if (selectedProblemId === problemId) {
              const remaining = problems.filter(p => p.id !== problemId);
              setSelectedProblemId(remaining.length > 0 ? remaining[0].id : '');
            }
          } catch (forceErr) {
            alert('Failed to force-delete problem: ' + forceErr.message);
          }
        }
      } else {
        alert('Failed to delete problem: ' + err.message);
      }
    }
  };

  // Feature 3: Open Edit Problem Modal
  const handleOpenEditProblem = (p) => {
    const visibleTc = (p.testCases || []).find(t => !t.isHidden);
    const hiddenTc = (p.testCases || []).find(t => t.isHidden);
    setNewProblemData({
      title: p.title || '',
      language: p.language || 'python',
      filename: p.filename || '',
      description: p.description || '',
      starterCode: p.starterCode || '',
      durationMinutes: p.durationMinutes || 15,
      input1: visibleTc?.input || '',
      output1: visibleTc?.expectedOutput || '',
      input2: hiddenTc?.input || '',
      output2: hiddenTc?.expectedOutput || ''
    });
    setEditingProblemId(p.id);
    setShowAddProblemModal(true);
  };

  // Feature 3: Create or Update Problem
  const handleSaveProblem = async (e) => {
    e.preventDefault();
    try {
      const testCases = [];
      if (newProblemData.output1) {
        testCases.push({ input: newProblemData.input1, expectedOutput: newProblemData.output1, isHidden: false });
      }
      if (newProblemData.output2) {
        testCases.push({ input: newProblemData.input2, expectedOutput: newProblemData.output2, isHidden: true });
      }

      if (testCases.length === 0) {
        alert('At least one test case with an expected output is required');
        return;
      }

      const payload = {
        title: newProblemData.title,
        language: newProblemData.language,
        filename: newProblemData.filename || `solution.${newProblemData.language === 'python' ? 'py' : newProblemData.language}`,
        description: newProblemData.description,
        starterCode: newProblemData.starterCode,
        durationMinutes: Number(newProblemData.durationMinutes) || 15,
        testCases
      };

      if (editingProblemId) {
        const updated = await api.updateProblem(editingProblemId, payload);
        setProblems(prev => prev.map(p => p.id === editingProblemId ? updated : p));
      } else {
        const created = await api.createProblem(payload);
        setProblems(prev => [...prev, created]);
        if (!selectedProblemId) {
          setSelectedProblemId(created.id);
        }
      }

      setShowAddProblemModal(false);
      setEditingProblemId(null);
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
      alert(`Failed to ${editingProblemId ? 'update' : 'create'} problem: ` + err.message);
    }
  };

  return (
    <div className="h-screen w-full bg-surface-950 text-slate-100 flex flex-col font-sans overflow-hidden">
      {/* Top LAN Server Banner - Fixed at top */}
      <div className="shrink-0">
        <HostBanner isHost={true} />
      </div>

      {/* Main Navigation Header - Fixed at top */}
      <header className="shrink-0 bg-surface-900 border-b border-slate-800 px-6 py-3.5 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-sm shadow-inner">
            BH
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-white flex items-center gap-2">
              Bug Hunt <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-semibold">Admin Dashboard</span>
            </h1>
            <p className="text-xs text-slate-400">Contest Host & LAN Management Console</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-surface-950 px-3.5 py-2 rounded-xl border border-slate-800 text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-slate-300 font-medium">{user.name}</span>
            <span className="text-slate-500">(Admin)</span>
          </div>

          <button
            onClick={loadData}
            className="p-2.5 bg-surface-950 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-slate-200 transition border border-slate-800"
            title="Refresh contest data"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            onClick={onLogout}
            className="flex items-center gap-2 px-4 py-2 bg-surface-950 hover:bg-rose-500/10 text-rose-400 hover:text-rose-300 rounded-xl text-xs font-semibold border border-slate-800 hover:border-rose-500/30 transition"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Logout</span>
          </button>
        </div>
      </header>

      {/* Main Scrollable Viewport */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Overview Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-6 pb-2">
          <div className="bg-surface-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between h-32 shadow-lg hover:border-slate-700 transition">
            <div className="flex justify-between items-start mb-2">
              <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Total Students</span>
              <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="text-3xl font-bold tracking-tight text-white mb-1">{overview?.totalStudents ?? students.length}</div>
            <div className="text-xs text-slate-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
              <span className="text-emerald-400 font-medium">{students.filter(s => s.isOnline).length} online</span>
              <span className="text-slate-500">on LAN</span>
            </div>
          </div>

          <div className="bg-surface-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between h-32 shadow-lg hover:border-slate-700 transition">
            <div className="flex justify-between items-start mb-2">
              <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Buggy Problems</span>
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <FileCode className="w-4 h-4" />
              </div>
            </div>
            <div className="text-3xl font-bold tracking-tight text-white mb-1">{overview?.totalProblems ?? problems.length}</div>
            <div className="text-xs text-slate-400">C, C++, and Python bank</div>
          </div>

          <div className="bg-surface-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between h-32 shadow-lg hover:border-slate-700 transition">
            <div className="flex justify-between items-start mb-2">
              <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Submissions</span>
              <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                <Terminal className="w-4 h-4" />
              </div>
            </div>
            <div className="text-3xl font-bold tracking-tight text-white mb-1">{overview?.totalSubmissions ?? submissions.length}</div>
            <div className="text-xs text-slate-400">Recorded & re-verified</div>
          </div>

          <div className="bg-surface-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between h-32 shadow-lg hover:border-slate-700 transition">
            <div className="flex justify-between items-start mb-2">
              <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Passed Solutions</span>
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="text-3xl font-bold tracking-tight text-emerald-400 mb-1">{overview?.passedSubmissions ?? submissions.filter(s => s.pass).length}</div>
            <div className="text-xs text-slate-400">
              {overview?.totalSubmissions ? Math.round(((overview?.passedSubmissions || 0) / overview.totalSubmissions) * 100) : 0}% success rate
            </div>
          </div>
        </div>

        {/* LAN Problem Push Dispatch Panel */}
        <div className="mx-6 my-4 p-5 bg-surface-900 border border-slate-800 rounded-2xl shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2.5">
              <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                LAN Problem Dispatch (Direct File Push)
              </h2>
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={keepStudentCode}
                onChange={(e) => setKeepStudentCode(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-slate-700 bg-surface-950 text-emerald-500 focus:ring-emerald-500/20 accent-emerald-500"
              />
              <span>Keep student's current code on re-assignment</span>
            </label>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
            <div className="lg:col-span-5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Select Problem</label>
              <select
                value={selectedProblemId}
                onChange={(e) => setSelectedProblemId(e.target.value)}
                className="w-full h-10 bg-surface-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-medium shadow-inner"
              >
                {problems.map((p) => (
                  <option key={p.id} value={p.id}>
                    [{p.language.toUpperCase()}] {p.title} ({p.filename}) • ⏱️ {p.durationMinutes || 15}m
                  </option>
                ))}
              </select>
            </div>

            <div className="lg:col-span-4">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Select Target</label>
              <select
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                className="w-full h-10 bg-surface-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-mono font-medium shadow-inner"
              >
                <option value="ALL">📢 All Students ({students.length} Total)</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.isOnline ? '🟢' : '⚪'} {s.name} ({s.username}) {s.assignment ? `[${s.assignment.title.slice(0, 15)}...]` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="lg:col-span-3">
              <button
                onClick={() => handlePushProblem()}
                disabled={pushLoading || !selectedProblemId}
                className="w-full h-10 px-5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition active:scale-[0.99]"
              >
                <Send className="w-4 h-4 text-slate-950 stroke-[2.5]" />
                <span>{pushLoading ? 'Pushing...' : 'Push File to Student(s)'}</span>
              </button>
            </div>
          </div>

          {pushSuccessMsg && (
            <div className="mt-3 p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-400" />
              <span className="font-medium">{pushSuccessMsg}</span>
            </div>
          )}
        </div>

        {/* Main Tabs Navigation (Sticky at top of scroll viewport) */}
        <div className="px-6 mb-4 flex gap-2 border-b border-slate-800 sticky top-0 bg-surface-950/95 backdrop-blur z-20">
          <button
            onClick={() => setActiveTab('students')}
            className={`px-4 py-3 text-xs font-semibold transition-all flex items-center gap-2 border-b-2 -mb-[1px] rounded-t-xl ${
              activeTab === 'students'
                ? 'border-emerald-400 text-emerald-400 bg-emerald-500/10 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-surface-900/50'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Live Students Monitor ({students.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('problems')}
            className={`px-4 py-3 text-xs font-semibold transition-all flex items-center gap-2 border-b-2 -mb-[1px] rounded-t-xl ${
              activeTab === 'problems'
                ? 'border-emerald-400 text-emerald-400 bg-emerald-500/10 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-surface-900/50'
            }`}
          >
            <FileCode className="w-4 h-4" />
            <span>Problem Bank ({problems.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('submissions')}
            className={`px-4 py-3 text-xs font-semibold transition-all flex items-center gap-2 border-b-2 -mb-[1px] rounded-t-xl ${
              activeTab === 'submissions'
                ? 'border-emerald-400 text-emerald-400 bg-emerald-500/10 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-surface-900/50'
            }`}
          >
            <Terminal className="w-4 h-4" />
            <span>Submissions & Compiler Diagnostics ({submissions.length})</span>
          </button>
        </div>

        {/* Tab Contents */}
        <div className="px-6 pb-8">
          {/* Tab 1: Students Monitor */}
          {activeTab === 'students' && (
            <div className="space-y-4">
              {/* Header with Search, Filter & Actions */}
              <div className="flex flex-wrap justify-between items-center gap-4">
                <div>
                  <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <span>Live Connected Students</span>
                    <span className="px-2.5 py-0.5 bg-slate-800 text-slate-400 text-xs rounded-full font-medium">
                      Showing {paginatedStudents.length} on page ({totalFiltered} matching of {students.length} total)
                    </span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">Real-time status, problem tracking, and code inspector</p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowBulkStudentModal(true)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold border border-slate-700 flex items-center gap-2 transition active:scale-[0.99] shadow"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Bulk Generate / CSV</span>
                  </button>

                  <button
                    onClick={() => {
                      setStudentCreationType('select');
                      setSoloStudentData({ name: '', password: '' });
                      setTeamStudentData({ teamName: '', teammates: '', password: '' });
                      setShowAddStudentModal(true);
                    }}
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-xs font-bold flex items-center gap-2 transition shadow-lg shadow-emerald-500/20 active:scale-[0.99]"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Add Students</span>
                  </button>
                </div>
              </div>

              {/* Search & Filter Toolbar */}
              <div className="bg-surface-900 border border-slate-800 rounded-2xl p-3.5 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
                {/* Search Bar */}
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    placeholder="Search by student name, username, or problem..."
                    className="w-full h-9 bg-surface-950 border border-slate-800 rounded-xl pl-10 pr-8 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 shadow-inner"
                  />
                  {studentSearch && (
                    <button
                      onClick={() => setStudentSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs font-bold"
                    >
                      ×
                    </button>
                  )}
                </div>

                {/* Visual Divider */}
                <div className="hidden lg:block w-px h-7 bg-slate-800 self-center" />

                {/* Status Filter Pills */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    onClick={() => setStudentFilter('all')}
                    className={`h-8 px-3 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 border ${
                      studentFilter === 'all'
                        ? 'bg-slate-800 text-white border-slate-700 shadow-sm'
                        : 'bg-surface-950 text-slate-400 hover:text-slate-200 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    All ({students.length})
                  </button>

                  <button
                    onClick={() => setStudentFilter('online')}
                    className={`h-8 px-3 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 border ${
                      studentFilter === 'online'
                        ? 'bg-slate-800 text-emerald-300 border-emerald-500/40 shadow-sm'
                        : 'bg-surface-950 text-slate-400 hover:text-slate-200 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                    <span>Online ({students.filter(s => s.isOnline).length})</span>
                  </button>

                  <button
                    onClick={() => setStudentFilter('offline')}
                    className={`h-8 px-3 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 border ${
                      studentFilter === 'offline'
                        ? 'bg-slate-800 text-slate-200 border-slate-700 shadow-sm'
                        : 'bg-surface-950 text-slate-400 hover:text-slate-200 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-500 inline-block" />
                    <span>Offline ({students.filter(s => !s.isOnline).length})</span>
                  </button>

                  <button
                    onClick={() => setStudentFilter('solved')}
                    className={`h-8 px-3 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 border ${
                      studentFilter === 'solved'
                        ? 'bg-slate-800 text-emerald-300 border-emerald-500/40 shadow-sm'
                        : 'bg-surface-950 text-slate-400 hover:text-slate-200 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Solved ({students.filter(s => s.hasPassed).length})</span>
                  </button>

                  <button
                    onClick={() => setStudentFilter('in_progress')}
                    className={`h-8 px-3 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 border ${
                      studentFilter === 'in_progress'
                        ? 'bg-slate-800 text-amber-300 border-amber-500/40 shadow-sm'
                        : 'bg-surface-950 text-slate-400 hover:text-slate-200 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    <span>In Progress ({students.filter(s => s.assignment && !s.hasPassed && s.assignment.status !== 'expired').length})</span>
                  </button>

                  <button
                    onClick={() => setStudentFilter('expired')}
                    className={`h-8 px-3 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 border ${
                      studentFilter === 'expired'
                        ? 'bg-slate-800 text-rose-300 border-rose-500/40 shadow-sm'
                        : 'bg-surface-950 text-slate-400 hover:text-slate-200 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5 text-rose-400" />
                    <span>Timed Out ({students.filter(s => s.assignment?.status === 'expired').length})</span>
                  </button>

                  <button
                    onClick={() => setStudentFilter('unassigned')}
                    className={`h-8 px-3 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 border ${
                      studentFilter === 'unassigned'
                        ? 'bg-slate-800 text-white border-slate-700 shadow-sm'
                        : 'bg-surface-950 text-slate-400 hover:text-slate-200 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <span>Unassigned ({students.filter(s => !s.assignment).length})</span>
                  </button>
                </div>
              </div>

              {/* Scroll Navigation & Pagination Control Bar (Top) */}
              <div className="bg-surface-900 border border-slate-800 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-4">
                  <span className="text-slate-400 font-medium">
                    Showing <strong className="text-slate-200 font-semibold">{startIndex + 1} - {Math.min(startIndex + paginatedStudents.length, totalFiltered)}</strong> of <strong className="text-slate-200 font-semibold">{totalFiltered}</strong> students
                  </span>

                  <div className="flex items-center gap-2 text-slate-400">
                    <span>Per page:</span>
                    <select
                      value={rowsPerPage}
                      onChange={(e) => setRowsPerPage(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                      className="bg-surface-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200 focus:outline-none focus:border-emerald-500"
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
                      className="px-2.5 py-1 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg flex items-center gap-1.5 transition font-medium"
                    >
                      <ChevronUp className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Scroll Up</span>
                    </button>
                    <div className="w-px h-4 bg-slate-800" />
                    <button
                      onClick={handleScrollDown}
                      title="Scroll Down"
                      className="px-2.5 py-1 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg flex items-center gap-1.5 transition font-medium"
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
                        className="px-3 py-1.5 bg-surface-950 hover:bg-slate-800 disabled:opacity-40 text-slate-300 rounded-lg border border-slate-800 flex items-center gap-1 transition font-medium"
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
                        className="px-3 py-1.5 bg-surface-950 hover:bg-slate-800 disabled:opacity-40 text-slate-300 rounded-lg border border-slate-800 flex items-center gap-1 transition font-medium"
                      >
                        <span>Next</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Students Table with Dedicated Scroll Container & Defined Min/Max Height */}
              <div className="bg-surface-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                <div 
                  ref={studentTableContainerRef} 
                  className="min-h-[360px] max-h-[500px] overflow-y-auto overflow-x-auto scroll-smooth block w-full"
                >
                  <table className="w-full text-left text-xs min-w-[880px] border-collapse">
                    <thead className="bg-surface-950 text-slate-400 uppercase font-semibold text-[11px] tracking-wider border-b border-slate-800 sticky top-0 z-10 shadow">
                      <tr>
                        <th className="py-3.5 px-4 bg-surface-950">Status</th>
                        <th className="py-3.5 px-4 bg-surface-950">Student / Team Name</th>
                        <th className="py-3.5 px-4 bg-surface-950">Username</th>
                        <th className="py-3.5 px-4 bg-surface-950">Currently Assigned Problem</th>
                        <th className="py-3.5 px-4 bg-surface-950">Progress</th>
                        <th className="py-3.5 px-4 bg-surface-950">Submissions</th>
                        <th className="py-3.5 px-4 bg-surface-950 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-sans">
                      {paginatedStudents.map((s) => (
                        <tr key={s.id} className="hover:bg-slate-800/30 transition">
                          {/* Status Column: aligned dot + label */}
                          <td className="py-4 px-4">
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${s.isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                              <span className={`font-medium ${s.isOnline ? 'text-emerald-400' : 'text-slate-500'}`}>
                                {s.isOnline ? 'Online' : 'Offline'}
                              </span>
                            </div>
                          </td>

                          <td className="py-4 px-4">
                            <div className="flex flex-col">
                              <div className="flex items-center gap-2">
                                {s.isTeam ? (
                                  <Users className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                                ) : (
                                  <User className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                )}
                                <span className="font-semibold text-slate-100">{s.name}</span>
                                {s.isTeam ? (
                                  <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[9px] font-bold uppercase tracking-wider">
                                    Team
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 text-[9px] font-medium uppercase tracking-wider">
                                    Solo
                                  </span>
                                )}
                              </div>
                              {s.isTeam && s.teammates && (
                                <span className="text-[11px] text-slate-400 font-normal truncate max-w-xs mt-0.5" title={s.teammates}>
                                  Members: {s.teammates}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-4 px-4 font-mono text-slate-400">{s.username}</td>

                          {/* Assigned Problem: consistent badge + title spacing */}
                          <td className="py-4 px-4">
                            {s.assignment ? (
                              <div className="flex items-center gap-2.5">
                                <span className="px-2 py-0.5 rounded-md bg-slate-800 text-[10px] uppercase font-mono text-emerald-400 border border-slate-700 font-semibold tracking-wider">
                                  {s.assignment.language}
                                </span>
                                <span className="text-slate-200 font-medium truncate max-w-[260px]">{s.assignment.title}</span>
                              </div>
                            ) : (
                              <span className="text-slate-500 italic">No problem assigned</span>
                            )}
                          </td>

                          {/* Progress badge */}
                          <td className="py-4 px-4">
                            {s.hasPassed ? (
                              <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold text-[11px] flex items-center gap-1.5 w-fit">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Solved {s.timeTakenSeconds !== null && s.timeTakenSeconds !== undefined ? `(${formatDuration(s.timeTakenSeconds)})` : ''}</span>
                              </span>
                            ) : s.assignment?.status === 'expired' ? (
                              <span className="px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 font-semibold text-[11px] flex items-center gap-1.5 w-fit" title="Contest timer expired with no submission">
                                <Clock className="w-3.5 h-3.5" /> Timed Out
                              </span>
                            ) : s.assignment?.hasSubmitted ? (
                              <span className="px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-semibold text-[11px] flex items-center gap-1.5 w-fit">
                                <Check className="w-3.5 h-3.5" />
                                <span>Submitted {s.timeTakenSeconds !== null && s.timeTakenSeconds !== undefined ? `(${formatDuration(s.timeTakenSeconds)})` : ''}</span>
                              </span>
                            ) : s.assignment ? (
                              <span className="px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-semibold text-[11px] flex items-center gap-1.5 w-fit">
                                <Clock className="w-3.5 h-3.5" /> In Progress
                              </span>
                            ) : (
                              <span className="text-slate-600">-</span>
                            )}
                          </td>

                          {/* Submissions count */}
                          <td className="py-4 px-4 text-slate-300 font-mono">
                            <span className="px-2.5 py-1 bg-surface-950 rounded-lg border border-slate-800">
                              {s.submissionsCount} attempt{s.submissionsCount !== 1 ? 's' : ''}
                            </span>
                          </td>

                          {/* Actions: Details & Remove (Push button removed per request) */}
                          <td className="py-4 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {/* Details button: equal w-20 h-8 */}
                              <button
                                onClick={() => handleInspectStudent(s.id)}
                                className="w-20 h-8 bg-surface-950 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg text-xs font-semibold border border-slate-800 hover:border-slate-700 transition flex items-center justify-center gap-1.5"
                                title="Inspect Student Code & Status"
                              >
                                <Eye className="w-3.5 h-3.5 text-blue-400" />
                                <span>Details</span>
                              </button>

                              {/* Remove action button: equal w-20 h-8 */}
                              <button
                                onClick={() => handleRemoveStudent(s.id, s.name, s.username)}
                                className="w-20 h-8 bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white rounded-lg text-xs font-semibold border border-rose-500/20 hover:border-rose-500 transition flex items-center justify-center gap-1.5"
                                title="Remove Student Account"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Remove</span>
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
                    className="px-3.5 py-1.5 bg-surface-950 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg border border-slate-800 flex items-center gap-1.5 transition font-medium"
                  >
                    <ChevronUp className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Scroll Up</span>
                  </button>
                  <button
                    onClick={handleScrollDown}
                    className="px-3.5 py-1.5 bg-surface-950 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg border border-slate-800 flex items-center gap-1.5 transition font-medium"
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
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                  Buggy Problem Repository ({problems.length})
                </h2>
                <button
                  onClick={() => setShowAddProblemModal(true)}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-xs font-bold flex items-center gap-2 transition shadow-lg shadow-emerald-500/20 active:scale-[0.99]"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  <span>Create New Buggy Problem</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {problems.map((p) => (
                  <div key={p.id} className="bg-surface-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between shadow-lg hover:border-slate-700 transition">
                    <div>
                      <div className="flex justify-between items-start mb-2.5">
                        <h3 className="font-bold text-white text-sm">{p.title}</h3>
                        <span className="px-2.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px] font-mono uppercase font-bold">
                          {p.language}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mb-3 line-clamp-2">{p.description}</p>
                      <div className="text-[11px] font-mono text-slate-400 mb-2.5">Filename: <span className="text-slate-200">{p.filename}</span></div>

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

                    <div className="mt-4 pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleOpenEditProblem(p)}
                          className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1 border border-slate-700 transition active:scale-[0.99]"
                          title="Edit Problem"
                        >
                          <Pencil className="w-3.5 h-3.5 text-amber-400" />
                          <span>Edit</span>
                        </button>

                        <button
                          onClick={() => handleDeleteProblem(p.id, p.title)}
                          className="px-2.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg text-xs font-semibold flex items-center gap-1 border border-rose-500/20 transition active:scale-[0.99]"
                          title="Delete Problem"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete</span>
                        </button>
                      </div>

                      <button
                        onClick={() => {
                          setSelectedProblemId(p.id);
                          setActiveTab('students');
                        }}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition active:scale-[0.99]"
                      >
                        <Send className="w-3.5 h-3.5 text-emerald-400" />
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
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                Contest Submissions & Internal Diagnostics ({submissions.length})
              </h2>

              <div className="bg-surface-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                <table className="w-full text-left text-xs min-w-[700px] border-collapse">
                  <thead className="bg-surface-950 text-slate-400 uppercase font-semibold text-[11px] tracking-wider border-b border-slate-800 sticky top-0 z-10 shadow">
                    <tr>
                      <th className="py-3.5 px-4 bg-surface-950">Time</th>
                      <th className="py-3.5 px-4 bg-surface-950">Student</th>
                      <th className="py-3.5 px-4 bg-surface-950">Problem</th>
                      <th className="py-3.5 px-4 bg-surface-950">Status</th>
                      <th className="py-3.5 px-4 bg-surface-950">Runtime</th>
                      <th className="py-3.5 px-4 bg-surface-950 text-right">Internal Raw Diagnostics</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-sans">
                    {submissions.map((sub) => (
                      <tr key={sub.id} className="hover:bg-slate-800/30 transition">
                        <td className="py-4 px-4 font-mono text-slate-400 text-[11px]">
                          {new Date(sub.createdAt).toLocaleTimeString()}
                        </td>
                        <td className="py-4 px-4 font-semibold text-slate-200">
                          {sub.studentName} <span className="text-slate-500 font-mono text-[11px]">({sub.studentUsername})</span>
                        </td>
                        <td className="py-4 px-4 text-slate-300">{sub.problemTitle}</td>
                        <td className="py-4 px-4">
                          {sub.pass ? (
                            <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold text-[10px]">
                              PASS
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 font-bold text-[10px]">
                              FAIL ({sub.status})
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-4 font-mono text-slate-400 text-[11px]">
                          {sub.executionTimeMs}ms
                        </td>
                        <td className="py-4 px-4 text-right">
                          <button
                            onClick={() => setSelectedSubmission(sub)}
                            className="px-3 py-1.5 bg-surface-950 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg text-xs font-semibold border border-slate-800 hover:border-slate-700 transition"
                          >
                            View Logs & Code
                          </button>
                        </td>
                      </tr>
                    ))}
                    {submissions.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-500 text-xs">
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
      </div>

      {/* Student Detail Inspector Modal */}
      {selectedStudentDetails && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 z-50">
          <div className="bg-surface-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col p-6 shadow-2xl">
            <div className="flex justify-between items-start border-b border-slate-800 pb-4 mb-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl ${selectedStudentDetails.student.isTeam ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'} border flex items-center justify-center font-bold`}>
                  {selectedStudentDetails.student.isTeam ? <Users className="w-5 h-5" /> : <User className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2 flex-wrap">
                    <span>{selectedStudentDetails.student.name}</span>
                    {selectedStudentDetails.student.isTeam ? (
                      <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/30 text-[10px] font-bold">
                        👥 Team Account
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-medium">
                        👤 Solo Student
                      </span>
                    )}
                    {selectedStudentDetails.student.isOnline ? (
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                        🟢 Online on LAN
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-500 border border-slate-700 text-[10px] font-bold">
                        ⚪ Offline
                      </span>
                    )}
                  </h3>
                  <p className="text-xs font-mono text-slate-400 mt-0.5">
                    Username: {selectedStudentDetails.student.username} • ID: {selectedStudentDetails.student.id}
                  </p>
                  {selectedStudentDetails.student.isTeam && selectedStudentDetails.student.teammates && (
                    <p className="text-xs text-slate-300 mt-1">
                      <span className="text-slate-400 font-semibold">Teammates: </span>
                      <span className="text-white font-medium">{selectedStudentDetails.student.teammates}</span>
                    </p>
                  )}
                </div>
              </div>

              <button
                onClick={() => setSelectedStudentDetails(null)}
                className="w-8 h-8 rounded-lg bg-surface-950 hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition border border-slate-800 font-bold"
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

                    {/* Time Taken to Finish Highlight */}
                    {selectedStudentDetails.timeTakenSeconds !== null && selectedStudentDetails.timeTakenSeconds !== undefined ? (
                      <div className="mt-3 p-3 rounded-xl bg-surface-900 border border-emerald-500/30 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs">
                          <Clock className="w-4 h-4" />
                          <span>Time Taken to Finish Problem:</span>
                        </div>
                        <span className="font-mono text-white font-bold text-sm bg-emerald-500/20 px-3 py-1 rounded-lg border border-emerald-500/40 shadow-sm">
                          {formatDuration(selectedStudentDetails.timeTakenSeconds)}
                        </span>
                      </div>
                    ) : selectedStudentDetails.assignment ? (
                      <div className="mt-3 p-2.5 rounded-xl bg-surface-900 border border-slate-800 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 text-slate-400 font-medium">
                          <Clock className="w-3.5 h-3.5 text-amber-400" />
                          <span>Status:</span>
                        </div>
                        <span className="font-mono text-amber-400 font-semibold">
                          In Progress (Not yet finished)
                        </span>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="text-slate-500 italic">No problem currently assigned to this student.</div>
                )}
              </div>

              {/* Student Current Draft Code */}
              {selectedStudentDetails.assignment && selectedStudentDetails.assignment.currentCode && (
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-slate-400 font-semibold uppercase text-[10px]">
                      Student Current Code Draft
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(selectedStudentDetails.assignment.currentCode);
                        setCopiedCode(true);
                        setTimeout(() => setCopiedCode(false), 2000);
                      }}
                      className="px-2.5 py-1 bg-surface-950 hover:bg-slate-800 text-slate-300 rounded-lg text-xs flex items-center gap-1.5 border border-slate-800 transition"
                    >
                      {copiedCode ? <CheckCheck className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedCode ? 'Copied' : 'Copy Code'}</span>
                    </button>
                  </div>
                  <div className="bg-surface-950 p-4 rounded-xl border border-slate-800 font-mono text-slate-200 text-[11px] max-h-48 overflow-y-auto">
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
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5 flex items-center gap-2 flex-wrap">
                          <span>{new Date(sub.createdAt).toLocaleTimeString()}</span>
                          {sub.elapsedSeconds !== null && sub.elapsedSeconds !== undefined && (
                            <>
                              <span>•</span>
                              <span className="text-emerald-400 font-semibold">
                                Time taken: {formatDuration(sub.elapsedSeconds)}
                              </span>
                            </>
                          )}
                          <span>•</span>
                          <span>{sub.executionTimeMs}ms execution</span>
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

            <div className="mt-4 pt-4 border-t border-slate-800 flex flex-wrap justify-between items-center gap-3">
              <button
                onClick={() => {
                  const studentId = selectedStudentDetails.student.id;
                  setSelectedStudentDetails(null);
                  handlePushProblem(studentId);
                }}
                className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition active:scale-[0.99]"
              >
                <Send className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Push Selected Problem to This Student</span>
              </button>

              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => {
                    const studentId = selectedStudentDetails.student.id;
                    const studentName = selectedStudentDetails.student.name;
                    const studentUsername = selectedStudentDetails.student.username;
                    setSelectedStudentDetails(null);
                    handleRemoveStudent(studentId, studentName, studentUsername);
                  }}
                  className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white rounded-xl text-xs font-semibold border border-rose-500/20 hover:border-rose-500 transition flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove Student</span>
                </button>

                <button
                  onClick={() => setSelectedStudentDetails(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium border border-slate-700 transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Students Modal (Solo vs Team) */}
      {showAddStudentModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 z-50">
          <div className="bg-surface-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            {/* Step 1: Selection Screen (Solo or Team) */}
            {studentCreationType === 'select' && (
              <div>
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h3 className="text-base font-bold text-white">Add Students</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Choose participation format</p>
                  </div>
                  <button
                    onClick={() => setShowAddStudentModal(false)}
                    className="w-8 h-8 rounded-lg bg-surface-950 hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition border border-slate-800 font-bold"
                  >
                    ✕
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 my-4">
                  {/* Solo Student Option */}
                  <button
                    type="button"
                    onClick={() => setStudentCreationType('solo')}
                    className="group p-4 bg-surface-950 hover:bg-slate-800/80 border border-slate-800 hover:border-emerald-500/50 rounded-xl text-left transition flex flex-col justify-between"
                  >
                    <div>
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-3 group-hover:scale-110 transition-transform">
                        <User className="w-5 h-5" />
                      </div>
                      <h4 className="text-sm font-bold text-white group-hover:text-emerald-400 transition">
                        Solo Student
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                        Individual participant with student name and password.
                      </p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-emerald-400 font-semibold">
                      <span>Select Solo</span>
                      <span>→</span>
                    </div>
                  </button>

                  {/* Team Option */}
                  <button
                    type="button"
                    onClick={() => setStudentCreationType('team')}
                    className="group p-4 bg-surface-950 hover:bg-slate-800/80 border border-slate-800 hover:border-blue-500/50 rounded-xl text-left transition flex flex-col justify-between"
                  >
                    <div>
                      <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 mb-3 group-hover:scale-110 transition-transform">
                        <Users className="w-5 h-5" />
                      </div>
                      <h4 className="text-sm font-bold text-white group-hover:text-blue-400 transition">
                        Team
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                        Team with team name, teammate names, and password.
                      </p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-blue-400 font-semibold">
                      <span>Select Team</span>
                      <span>→</span>
                    </div>
                  </button>
                </div>

                <div className="flex justify-end pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowAddStudentModal(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium border border-slate-700 transition"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Solo Form */}
            {studentCreationType === 'solo' && (
              <div>
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setStudentCreationType('select')}
                      className="p-1.5 rounded-lg bg-surface-950 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition"
                      title="Back to Solo/Team selection"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <div>
                      <h3 className="text-base font-bold text-white flex items-center gap-1.5">
                        <User className="w-4 h-4 text-emerald-400" />
                        <span>Add Solo Student</span>
                      </h3>
                      <p className="text-xs text-slate-400">Enter student name and password</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowAddStudentModal(false)}
                    className="w-8 h-8 rounded-lg bg-surface-950 hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition border border-slate-800 font-bold"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleCreateSoloStudent} className="space-y-4 text-xs">
                  <div>
                    <label className="block text-slate-400 font-semibold mb-1.5">Student Name</label>
                    <input
                      type="text"
                      required
                      autoFocus
                      value={soloStudentData.name}
                      onChange={(e) => setSoloStudentData({ ...soloStudentData, name: e.target.value })}
                      placeholder="e.g. Alice Johnson"
                      className="w-full h-10 bg-surface-950 border border-slate-800 rounded-xl px-3.5 py-2 text-slate-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 font-semibold mb-1.5">Password</label>
                    <input
                      type="text"
                      required
                      value={soloStudentData.password}
                      onChange={(e) => setSoloStudentData({ ...soloStudentData, password: e.target.value })}
                      placeholder="e.g. pass123"
                      className="w-full h-10 bg-surface-950 border border-slate-800 rounded-xl px-3.5 py-2 text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  {soloStudentData.name.trim() && (
                    <div className="p-2.5 rounded-xl bg-surface-950 border border-slate-800 text-[11px] text-slate-400 font-mono">
                      <span className="text-slate-500">Login username: </span>
                      <span className="text-emerald-400 font-semibold">{soloStudentData.name.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')}</span>
                      <span className="text-slate-500 block text-[10px] font-sans mt-0.5">
                        Student can log in using either their name or username.
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between items-center pt-3 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => setStudentCreationType('select')}
                      className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 transition"
                    >
                      <span>← Switch to Team</span>
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowAddStudentModal(false)}
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium border border-slate-700 transition"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={creationLoading}
                        className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl font-bold transition shadow-lg shadow-emerald-500/20 active:scale-[0.99] disabled:opacity-50"
                      >
                        {creationLoading ? 'Creating...' : 'Create Student'}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            )}

            {/* Step 3: Team Form */}
            {studentCreationType === 'team' && (
              <div>
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setStudentCreationType('select')}
                      className="p-1.5 rounded-lg bg-surface-950 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition"
                      title="Back to Solo/Team selection"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <div>
                      <h3 className="text-base font-bold text-white flex items-center gap-1.5">
                        <Users className="w-4 h-4 text-blue-400" />
                        <span>Add Team</span>
                      </h3>
                      <p className="text-xs text-slate-400">Enter team name, teammates, and password</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowAddStudentModal(false)}
                    className="w-8 h-8 rounded-lg bg-surface-950 hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition border border-slate-800 font-bold"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleCreateTeam} className="space-y-4 text-xs">
                  <div>
                    <label className="block text-slate-400 font-semibold mb-1.5">Team Name</label>
                    <input
                      type="text"
                      required
                      autoFocus
                      value={teamStudentData.teamName}
                      onChange={(e) => setTeamStudentData({ ...teamStudentData, teamName: e.target.value })}
                      placeholder="e.g. Code Titans"
                      className="w-full h-10 bg-surface-950 border border-slate-800 rounded-xl px-3.5 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 font-semibold mb-1.5">Teammates Names</label>
                    <textarea
                      required
                      rows={2}
                      value={teamStudentData.teammates}
                      onChange={(e) => setTeamStudentData({ ...teamStudentData, teammates: e.target.value })}
                      placeholder="e.g. Alice Johnson, Bob Smith, Charlie Lee"
                      className="w-full bg-surface-950 border border-slate-800 rounded-xl px-3.5 py-2 text-slate-200 focus:outline-none focus:border-blue-500 resize-none"
                    />
                    <span className="text-[10px] text-slate-500 block mt-1">Enter member names separated by commas or newlines</span>
                  </div>

                  <div>
                    <label className="block text-slate-400 font-semibold mb-1.5">Password</label>
                    <input
                      type="text"
                      required
                      value={teamStudentData.password}
                      onChange={(e) => setTeamStudentData({ ...teamStudentData, password: e.target.value })}
                      placeholder="e.g. team123"
                      className="w-full h-10 bg-surface-950 border border-slate-800 rounded-xl px-3.5 py-2 text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  {teamStudentData.teamName.trim() && (
                    <div className="p-2.5 rounded-xl bg-surface-950 border border-slate-800 text-[11px] text-slate-400 font-mono">
                      <span className="text-slate-500">Team login username: </span>
                      <span className="text-blue-400 font-semibold">{teamStudentData.teamName.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')}</span>
                      <span className="text-slate-500 block text-[10px] font-sans mt-0.5">
                        Team members can log in using either team name or username.
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between items-center pt-3 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => setStudentCreationType('select')}
                      className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 transition"
                    >
                      <span>← Switch to Solo</span>
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowAddStudentModal(false)}
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium border border-slate-700 transition"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={creationLoading}
                        className="px-5 py-2 bg-blue-500 hover:bg-blue-400 text-slate-950 rounded-xl font-bold transition shadow-lg shadow-blue-500/20 active:scale-[0.99] disabled:opacity-50"
                      >
                        {creationLoading ? 'Creating...' : 'Create Team'}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bulk Generate & CSV Import Student Modal */}
      {showBulkStudentModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 z-50">
          <div className="bg-surface-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span>Bulk Student Account Creation</span>
            </h3>
            <p className="text-xs text-slate-400 mb-4">Quickly generate student accounts or paste a CSV list.</p>

            {/* Mode Switch */}
            <div className="flex border-b border-slate-800 mb-4 text-xs">
              <button
                type="button"
                onClick={() => setBulkAddMode('generate')}
                className={`flex-1 py-2.5 font-bold transition flex items-center justify-center gap-2 ${
                  bulkAddMode === 'generate'
                    ? 'text-emerald-400 border-b-2 border-emerald-400'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>⚡ Auto-Generate Range</span>
              </button>
              <button
                type="button"
                onClick={() => setBulkAddMode('csv')}
                className={`flex-1 py-2.5 font-bold transition flex items-center justify-center gap-2 ${
                  bulkAddMode === 'csv'
                    ? 'text-emerald-400 border-b-2 border-emerald-400'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>📋 CSV / Text Paste</span>
              </button>
            </div>

            <form onSubmit={handleBulkCreateStudents} className="space-y-4 text-xs">
              {bulkAddMode === 'generate' ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-slate-400 font-semibold mb-1.5">Username Prefix</label>
                      <input
                        type="text"
                        required
                        value={bulkGenData.prefix}
                        onChange={(e) => setBulkGenData({ ...bulkGenData, prefix: e.target.value })}
                        placeholder="e.g. student"
                        className="w-full h-10 bg-surface-950 border border-slate-800 rounded-xl px-3.5 py-2 text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 font-semibold mb-1.5">Password Prefix</label>
                      <input
                        type="text"
                        required
                        value={bulkGenData.passwordPrefix}
                        onChange={(e) => setBulkGenData({ ...bulkGenData, passwordPrefix: e.target.value })}
                        placeholder="e.g. pass"
                        className="w-full h-10 bg-surface-950 border border-slate-800 rounded-xl px-3.5 py-2 text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-slate-400 font-semibold mb-1.5">Start Number</label>
                      <input
                        type="number"
                        min="1"
                        required
                        value={bulkGenData.startNumber}
                        onChange={(e) => setBulkGenData({ ...bulkGenData, startNumber: e.target.value })}
                        className="w-full h-10 bg-surface-950 border border-slate-800 rounded-xl px-3.5 py-2 text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 font-semibold mb-1.5">How Many Accounts?</label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        required
                        value={bulkGenData.count}
                        onChange={(e) => setBulkGenData({ ...bulkGenData, count: e.target.value })}
                        className="w-full h-10 bg-surface-950 border border-slate-800 rounded-xl px-3.5 py-2 text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
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
                    className="w-full bg-surface-950 border border-slate-800 rounded-xl p-3.5 text-slate-200 font-mono focus:outline-none focus:border-emerald-500 text-xs"
                  />
                </div>
              )}

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowBulkStudentModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium border border-slate-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={bulkLoading}
                  className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition active:scale-[0.99]"
                >
                  <Sparkles className="w-3.5 h-3.5 stroke-[2.5]" />
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
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-base font-bold text-white">
                  {editingProblemId ? 'Edit Buggy Problem' : 'Create New Buggy Problem'}
                </h3>
                {editingProblemId && (
                  <p className="text-xs text-amber-400 mt-1">
                    💡 Note: Edits apply to future assignments of this problem. Students currently working on it will not be affected.
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAddProblemModal(false);
                  setEditingProblemId(null);
                }}
                className="w-8 h-8 rounded-lg bg-surface-950 hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition border border-slate-800 font-bold"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSaveProblem} className="space-y-4 text-xs overflow-y-auto flex-1 pr-2">
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-1">
                  <label className="block text-slate-400 font-semibold mb-1.5">Problem Title</label>
                  <input
                    type="text"
                    required
                    value={newProblemData.title}
                    onChange={(e) => setNewProblemData({ ...newProblemData, title: e.target.value })}
                    placeholder="e.g. Fix Stack Underflow"
                    className="w-full h-10 bg-surface-950 border border-slate-800 rounded-xl px-3.5 py-2 text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1.5">Language</label>
                  <select
                    value={newProblemData.language}
                    onChange={(e) => setNewProblemData({ ...newProblemData, language: e.target.value })}
                    className="w-full h-10 bg-surface-950 border border-slate-800 rounded-xl px-3.5 py-2 text-slate-200 focus:outline-none focus:border-emerald-500 font-medium"
                  >
                    <option value="python">Python</option>
                    <option value="cpp">C++</option>
                    <option value="c">C</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1.5 flex items-center gap-1">
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
                    className="w-full h-10 bg-surface-950 border border-slate-800 rounded-xl px-3.5 py-2 text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1.5">Filename</label>
                <input
                  type="text"
                  value={newProblemData.filename}
                  onChange={(e) => setNewProblemData({ ...newProblemData, filename: e.target.value })}
                  placeholder="e.g. stack_fix.py"
                  className="w-full h-10 bg-surface-950 border border-slate-800 rounded-xl px-3.5 py-2 text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1.5">Description / Contest Prompt</label>
                <textarea
                  rows={2}
                  value={newProblemData.description}
                  onChange={(e) => setNewProblemData({ ...newProblemData, description: e.target.value })}
                  placeholder="Explain the bug hunt objective..."
                  className="w-full bg-surface-950 border border-slate-800 rounded-xl p-3 text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1.5">Starter Buggy Code</label>
                <textarea
                  rows={6}
                  required
                  value={newProblemData.starterCode}
                  onChange={(e) => setNewProblemData({ ...newProblemData, starterCode: e.target.value })}
                  placeholder="Paste buggy code that students will fix..."
                  className="w-full bg-surface-950 border border-slate-800 rounded-xl p-3.5 text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4 p-4 bg-surface-950 rounded-xl border border-slate-800">
                <div className="col-span-2 font-semibold text-slate-200">Sample Test Case (Visible to Student)</div>
                <div>
                  <label className="block text-slate-500 mb-1">Sample Input</label>
                  <input
                    type="text"
                    value={newProblemData.input1}
                    onChange={(e) => setNewProblemData({ ...newProblemData, input1: e.target.value })}
                    placeholder="e.g. 5\n1 2 3 4 5"
                    className="w-full h-9 bg-surface-900 border border-slate-800 rounded-lg px-3 py-1.5 font-mono text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">Expected Output</label>
                  <input
                    type="text"
                    value={newProblemData.output1}
                    onChange={(e) => setNewProblemData({ ...newProblemData, output1: e.target.value })}
                    placeholder="e.g. 5"
                    className="w-full h-9 bg-surface-900 border border-slate-800 rounded-lg px-3 py-1.5 font-mono text-slate-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 p-4 bg-surface-950 rounded-xl border border-slate-800">
                <div className="col-span-2 font-semibold text-slate-200">Hidden Test Case (Evaluator Only)</div>
                <div>
                  <label className="block text-slate-500 mb-1">Hidden Input</label>
                  <input
                    type="text"
                    value={newProblemData.input2}
                    onChange={(e) => setNewProblemData({ ...newProblemData, input2: e.target.value })}
                    placeholder="e.g. 3\n-5 -2 -1"
                    className="w-full h-9 bg-surface-900 border border-slate-800 rounded-lg px-3 py-1.5 font-mono text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">Expected Output</label>
                  <input
                    type="text"
                    value={newProblemData.output2}
                    onChange={(e) => setNewProblemData({ ...newProblemData, output2: e.target.value })}
                    placeholder="e.g. -1"
                    className="w-full h-9 bg-surface-900 border border-slate-800 rounded-lg px-3 py-1.5 font-mono text-slate-200"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddProblemModal(false);
                    setEditingProblemId(null);
                  }}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium border border-slate-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl font-bold transition shadow-lg shadow-emerald-500/20 active:scale-[0.99]"
                >
                  {editingProblemId ? 'Save Changes' : 'Create & Save'}
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
            <div className="flex justify-between items-start border-b border-slate-800 pb-4 mb-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  Submission Diagnostics
                  {selectedSubmission.pass ? (
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold">
                      PASS
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 text-xs font-semibold">
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
                className="w-8 h-8 rounded-lg bg-surface-950 hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition border border-slate-800 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto flex-1 pr-2">
              <div>
                <div className="text-slate-400 font-semibold uppercase text-[10px] mb-2">Submitted Source Code</div>
                <div className="bg-surface-950 p-4 rounded-xl border border-slate-800 font-mono text-slate-200 text-[11px] max-h-48 overflow-y-auto">
                  <pre>{selectedSubmission.code}</pre>
                </div>
              </div>

              <div>
                <div className="text-slate-400 font-semibold uppercase text-[10px] mb-2">
                  Raw Compiler & Evaluator Internal Diagnostics
                </div>
                <div className="bg-surface-950 p-4 rounded-xl border border-slate-800 font-mono text-slate-300 text-[11px] max-h-48 overflow-y-auto whitespace-pre-wrap">
                  {selectedSubmission.rawOutput || 'No output recorded'}
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-800 mt-4">
              <button
                onClick={() => setSelectedSubmission(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium border border-slate-700 transition"
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
