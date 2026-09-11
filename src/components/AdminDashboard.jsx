import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Users, User, Send, FileCode, CheckCircle2, XCircle, Clock, Plus, 
  RefreshCw, LogOut, Radio, Eye, Code, Terminal, AlertTriangle, Check,
  Search, Copy, Sparkles, CheckCheck,
  ChevronUp, ChevronDown, ChevronsUp, ChevronsDown, ChevronLeft, ChevronRight,
  Pencil, Trash2
} from 'lucide-react';
import { api } from '../services/api';
import { socket } from '../services/socket';
import { formatDuration } from '../utils/time';
import HostBanner from './HostBanner';
import ConfirmDialog from './ConfirmDialog';
import { useDialog } from '../hooks/useDialog';

// Exact match with server username sanitization (server/routes/adminRoutes.js)
function formatUsernamePreview(rawName, isTeam = false) {
  if (!rawName || !rawName.trim()) return '';
  const base = rawName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '') || (isTeam ? 'team' : 'student');
  let finalUsername = base.substring(0, 24);
  if (finalUsername.length < 3) {
    finalUsername = `${finalUsername}_${isTeam ? 'team' : 'std'}`;
  }
  return finalUsername;
}

export default function AdminDashboard({ user, onLogout }) {
  const { confirm, notify, dialogProps } = useDialog();
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

  // Multi-Language Contest Kickoff State
  const [showMultiLangModal, setShowMultiLangModal] = useState(false);
  const [multiLangProblems, setMultiLangProblems] = useState({ python: '', c: '', cpp: '' });
  const [multiLangLoading, setMultiLangLoading] = useState(false);
  const [multiLangResultMsg, setMultiLangResultMsg] = useState('');

  // Student Search & Filtering
  const [studentSearch, setStudentSearch] = useState('');
  const [studentFilter, setStudentFilter] = useState('all'); // 'all', 'online', 'offline', 'solved', 'in_progress', 'unassigned'
  const [selectedLanguageFilter, setSelectedLanguageFilter] = useState('all'); // 'all', 'python', 'c', 'cpp'

  // Pagination & Scroll State
  const [rowsPerPage, setRowsPerPage] = useState('all'); // 10, 25, 50, 'all'
  const [currentPage, setCurrentPage] = useState(1);
  const studentTableContainerRef = useRef(null);

  // Add Students Modal (Solo vs Team)
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
  const [studentCreationType, setStudentCreationType] = useState('solo'); // 'solo' or 'team'
  const [soloStudentData, setSoloStudentData] = useState({ name: '', password: '', preferredLanguage: 'python' });
  const [teamStudentData, setTeamStudentData] = useState({ teamName: '', teammates: '', password: '', preferredLanguage: 'python' });
  const [creationLoading, setCreationLoading] = useState(false);
  
  // Bulk Student Modal
  const [showBulkStudentModal, setShowBulkStudentModal] = useState(false);
  const [bulkAddMode, setBulkAddMode] = useState('generate'); // 'generate' or 'csv'
  const [bulkGenData, setBulkGenData] = useState({ prefix: 'student', count: 10, startNumber: 1, passwordPrefix: 'pass', preferredLanguage: 'python' });
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
    expectedOutput: ''
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

    const interval = setInterval(loadData, 15000); // 15s fallback polling

    return () => {
      unsubOnline();
      unsubOffline();
      unsubUpdate();
      unsubSub();
      clearInterval(interval);
    };
  }, []);

  // Memoize status counts in a single pass over students
  const statusCounts = useMemo(() => {
    let online = 0;
    let offline = 0;
    let solved = 0;
    let inProgress = 0;
    let expired = 0;
    let unassigned = 0;

    for (const s of students) {
      if (s.isOnline) online++;
      else offline++;

      if (s.hasPassed) solved++;

      if (s.assignment) {
        if (!s.hasPassed && s.assignment.status !== 'expired') {
          inProgress++;
        }
        if (s.assignment.status === 'expired') {
          expired++;
        }
      } else {
        unassigned++;
      }
    }

    return {
      all: students.length,
      online,
      offline,
      solved,
      inProgress,
      expired,
      unassigned
    };
  }, [students]);

  // Compute language distribution statistics
  const languageStats = useMemo(() => {
    let python = 0;
    let c = 0;
    let cpp = 0;

    for (const s of students) {
      let lang = (s.preferredLanguage || 'python').toLowerCase();
      if (lang === 'py') lang = 'python';
      if (lang === 'c++') lang = 'cpp';

      if (lang === 'c') c++;
      else if (lang === 'cpp') cpp++;
      else python++;
    }

    return { python, c, cpp, total: students.length };
  }, [students]);

  // Compute filtered students list
  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    return students.filter(s => {
      // Status Filter
      if (studentFilter === 'online' && !s.isOnline) return false;
      if (studentFilter === 'offline' && s.isOnline) return false;
      if (studentFilter === 'solved' && !s.hasPassed) return false;
      if (studentFilter === 'in_progress' && (!s.assignment || s.hasPassed || s.assignment.status === 'expired')) return false;
      if (studentFilter === 'expired' && s.assignment?.status !== 'expired') return false;
      if (studentFilter === 'unassigned' && s.assignment) return false;

      // Language Filter
      if (selectedLanguageFilter !== 'all') {
        let sLang = (s.preferredLanguage || 'python').toLowerCase();
        if (sLang === 'py') sLang = 'python';
        if (sLang === 'c++') sLang = 'cpp';
        if (sLang !== selectedLanguageFilter) return false;
      }

      // Search query
      if (q) {
        const matchName = (s.name || '').toLowerCase().includes(q);
        const matchUsername = (s.username || '').toLowerCase().includes(q);
        const matchProblem = (s.assignment?.title || '').toLowerCase().includes(q);
        const matchTeammates = (s.teammates || '').toLowerCase().includes(q);
        return matchName || matchUsername || matchProblem || matchTeammates;
      }
      return true;
    });
  }, [students, studentFilter, selectedLanguageFilter, studentSearch]);

  // Reset page when filter or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [studentSearch, studentFilter, selectedLanguageFilter, rowsPerPage]);

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
      await notify('Failed to load student details: ' + err.message, 'Inspection Error');
    } finally {
      setLoadingStudentDetails(false);
    }
  };

  // Push Problem over LAN (Core Requirement 1)
  const handlePushProblem = async (overrideStudentId = null) => {
    const targetId = overrideStudentId || selectedStudentId;
    if (!selectedProblemId) {
      await notify('Please select a problem first', 'Select Problem');
      return;
    }

    setPushLoading(true);
    setPushSuccessMsg('');

    try {
      const isGroup = targetId.startsWith('GROUP_');
      const isAll = targetId === 'ALL' || isGroup;
      const targetLanguage = isGroup ? targetId.replace('GROUP_', '').toLowerCase() : undefined;
      const targetStudent = (!isAll && !isGroup) ? students.find(s => s.id === targetId) : null;

      // Issue 3 UX: Confirm if re-pushing same problem to a student already working on it
      if (!isAll && targetStudent?.assignment && targetStudent.assignment.problemId === selectedProblemId) {
        const actionDesc = keepStudentCode 
          ? "preserve their current code progress." 
          : "RESET their code to the fresh starter template.";
        const proceed = await confirm(
          `Student "${targetStudent.name}" is already working on "${targetStudent.assignment.title}".\n\nRe-pushing will refresh their timer and ${actionDesc}\n\nDo you want to continue?`,
          'Re-assign Problem?'
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
        targetLanguage,
        resetCode: !keepStudentCode
      });

      if (isGroup) {
        setPushSuccessMsg(`✅ Problem successfully pushed to all ${targetLanguage.toUpperCase()} students (${res.results?.length || 0} students)!`);
      } else if (isAll) {
        setPushSuccessMsg(`✅ Problem successfully pushed to ALL ${students.length} students over LAN!`);
      } else {
        setPushSuccessMsg(`✅ Problem sent to ${targetStudent?.name || 'student'} (${res.deliveredImmediately ? 'Delivered Live' : 'Queued for Connect'})`);
      }
      loadData();
      setTimeout(() => setPushSuccessMsg(''), 4000);
    } catch (err) {
      await notify('Failed to send problem: ' + err.message, 'Send Error');
    } finally {
      setPushLoading(false);
    }
  };

  // Launch Multi-Language Contest Simultaneously (Core Kickoff)
  const handleLaunchMultiLanguageContest = async () => {
    if (!multiLangProblems.python && !multiLangProblems.c && !multiLangProblems.cpp) {
      await notify('Please select at least one problem to assign.', 'Problem Selection Required');
      return;
    }

    const confirmText = `🚀 Ready to launch the Multi-Language Contest?\n\n` +
      `This will immediately push:\n` +
      `• Python Problem to ${languageStats.python} Python students/teams\n` +
      `• C Problem to ${languageStats.c} C students/teams\n` +
      `• C++ Problem to ${languageStats.cpp} C++ students/teams\n\n` +
      `All ${students.length} student screens will simultaneously load their problem with synchronized start and expiry timers. Continue?`;

    if (!await confirm(confirmText, 'Launch Multi-Language Contest?')) return;

    setMultiLangLoading(true);
    setMultiLangResultMsg('');

    try {
      const res = await api.assignMultiLanguageContest({
        problemMap: {
          python: multiLangProblems.python || undefined,
          c: multiLangProblems.c || undefined,
          cpp: multiLangProblems.cpp || undefined
        },
        resetCode: !keepStudentCode
      });

      const detailMsg = res.message || `🚀 Contest Started! Assigned ${res.assignedCount} students (${res.liveDelivered} Live on LAN, ${res.offlineCount} Offline Recovery).`;
      setMultiLangResultMsg(detailMsg);
      loadData();
      setTimeout(() => {
        setShowMultiLangModal(false);
        setMultiLangResultMsg('');
      }, 4500);
    } catch (err) {
      await notify('Failed to launch multi-language contest:\n' + err.message, 'Kickoff Error');
    } finally {
      setMultiLangLoading(false);
    }
  };

  // Create Solo Student
  const handleCreateSoloStudent = async (e) => {
    e.preventDefault();
    if (!soloStudentData.name.trim() || !soloStudentData.password.trim()) {
      await notify('Please enter both student name and password.', 'Validation Error');
      return;
    }
    try {
      setCreationLoading(true);
      const res = await api.createStudent({
        name: soloStudentData.name.trim(),
        password: soloStudentData.password.trim(),
        preferredLanguage: soloStudentData.preferredLanguage || 'python',
        isTeam: false
      });
      setShowAddStudentModal(false);
      setSoloStudentData({ name: '', password: '', preferredLanguage: 'python' });
      await notify(
        `Successfully created Solo Student account "${res.name}" (${(res.preferredLanguage || 'python').toUpperCase()})!\n\nUsername: ${res.username}\n(Student can log in using either their name or username)`,
        'Solo Student Created'
      );
      loadData();
    } catch (err) {
      await notify('Failed to create student: ' + err.message, 'Creation Error');
    } finally {
      setCreationLoading(false);
    }
  };

  // Create Team
  const handleCreateTeam = async (e) => {
    e.preventDefault();
    if (!teamStudentData.teamName.trim() || !teamStudentData.teammates.trim() || !teamStudentData.password.trim()) {
      await notify('Please enter team name, teammates names, and password.', 'Validation Error');
      return;
    }
    try {
      setCreationLoading(true);
      const res = await api.createStudent({
        name: teamStudentData.teamName.trim(),
        teamName: teamStudentData.teamName.trim(),
        teammates: teamStudentData.teammates.trim(),
        password: teamStudentData.password.trim(),
        preferredLanguage: teamStudentData.preferredLanguage || 'python',
        isTeam: true
      });
      setShowAddStudentModal(false);
      setTeamStudentData({ teamName: '', teammates: '', password: '', preferredLanguage: 'python' });
      await notify(
        `Successfully created Team account "${res.name}" (${(res.preferredLanguage || 'python').toUpperCase()})!\n\nTeam Members: ${res.teammates}\nUsername: ${res.username}\n(Team can log in using either team name or username)`,
        'Team Account Created'
      );
      loadData();
    } catch (err) {
      await notify('Failed to create team: ' + err.message, 'Creation Error');
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
        // Parse CSV format: username, password, name, language (optional)
        const lines = bulkCsvText.trim().split('\n');
        const studentList = [];
        for (const line of lines) {
          const parts = line.split(',').map(s => s.trim());
          if (parts.length >= 2 && parts[0] && parts[1]) {
            studentList.push({
              username: parts[0],
              password: parts[1],
              name: parts[2] || parts[0],
              preferredLanguage: (parts[3] || 'python').toLowerCase().trim()
            });
          }
        }
        if (studentList.length === 0) {
          await notify('No valid student entries found in CSV text. Expected: username, password, Name, language(optional)', 'CSV Parse Error');
          setBulkLoading(false);
          return;
        }
        payload = { students: studentList };
      }

      const res = await api.createBulkStudents(payload);
      setShowBulkStudentModal(false);
      setBulkCsvText('');
      await notify(
        `Successfully created ${res.createdCount} student accounts!${res.errorsCount > 0 ? ` (${res.errorsCount} skipped/duplicates)` : ''}`,
        'Bulk Accounts Created'
      );
      loadData();
    } catch (err) {
      await notify('Bulk creation failed: ' + err.message, 'Bulk Creation Error');
    } finally {
      setBulkLoading(false);
    }
  };

  // Remove Student Account
  const handleRemoveStudent = async (studentId, studentName, studentUsername) => {
    const ok = await confirm(
      `Are you sure you want to remove student "${studentName}" (${studentUsername})?\n\nThis will permanently delete their account and associated submissions.`,
      'Remove Student Account?'
    );
    if (!ok) return;

    try {
      await api.deleteStudent(studentId);
      setStudents(prev => prev.filter(s => s.id !== studentId));
      if (selectedStudentId === studentId) {
        setSelectedStudentId('ALL');
      }
      loadData();
    } catch (err) {
      await notify('Failed to remove student: ' + err.message, 'Remove Error');
    }
  };

  // Feature 2: Delete Problem with confirmation and reference error handling
  const handleDeleteProblem = async (problemId, title) => {
    const ok = await confirm(`Delete problem "${title}"? This cannot be undone.`, 'Delete Problem?');
    if (!ok) return;

    try {
      await api.deleteProblem(problemId);
      setProblems(prev => prev.filter(p => p.id !== problemId));
      if (selectedProblemId === problemId) {
        const remaining = problems.filter(p => p.id !== problemId);
        setSelectedProblemId(remaining.length > 0 ? remaining[0].id : '');
      }
    } catch (err) {
      if (err.message.includes('referenced by')) {
        const forceDelete = await confirm(
          `${err.message}\n\nDelete anyway? Existing submissions will be kept for records, but future re-pushes of this problem will fail.`,
          'Force Delete Problem?'
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
            await notify('Failed to force-delete problem: ' + forceErr.message, 'Force Delete Error');
          }
        }
      } else {
        await notify('Failed to delete problem: ' + err.message, 'Delete Error');
      }
    }
  };

  // Feature 3: Open Edit Problem Modal
  const handleOpenEditProblem = (p) => {
    const expOut = p.expectedOutput || (p.testCases && p.testCases[0]?.expectedOutput) || '';

    setNewProblemData({
      title: p.title || '',
      language: p.language || 'python',
      filename: p.filename || '',
      description: p.description || '',
      starterCode: p.starterCode || '',
      durationMinutes: p.durationMinutes || 15,
      expectedOutput: expOut
    });
    setEditingProblemId(p.id);
    setShowAddProblemModal(true);
  };

  // Feature 3: Create or Update Problem
  const handleSaveProblem = async (e) => {
    e.preventDefault();
    try {
      const expOut = (newProblemData.expectedOutput || '').trim();
      if (!expOut) {
        await notify('Expected Output is required.', 'Validation Error');
        return;
      }

      let testCases = [{ input: '', expectedOutput: expOut, isHidden: false }];
      if (editingProblemId) {
        const existingProblem = problems.find(p => p.id === editingProblemId);
        if (existingProblem && Array.isArray(existingProblem.testCases) && existingProblem.testCases.length > 0) {
          testCases = existingProblem.testCases.map((tc, idx) => {
            if (idx === 0) {
              return { ...tc, expectedOutput: expOut };
            }
            return { ...tc };
          });
        }
      }

      const payload = {
        title: newProblemData.title.trim(),
        language: newProblemData.language,
        filename: newProblemData.filename.trim() || `solution.${newProblemData.language === 'python' ? 'py' : newProblemData.language}`,
        description: newProblemData.description || '',
        starterCode: newProblemData.starterCode || '',
        durationMinutes: Number(newProblemData.durationMinutes) || 15,
        expectedOutput: expOut,
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
        expectedOutput: ''
      });
      loadData();
    } catch (err) {
      await notify(`Failed to ${editingProblemId ? 'update' : 'create'} problem: ` + err.message, 'Problem Error');
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

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  // Pre-populate multiLangProblems if empty
                  const pyProb = problems.find(p => p.language === 'python');
                  const cProb = problems.find(p => p.language === 'c');
                  const cppProb = problems.find(p => p.language === 'cpp');
                  setMultiLangProblems({
                    python: multiLangProblems.python || (pyProb ? pyProb.id : ''),
                    c: multiLangProblems.c || (cProb ? cProb.id : ''),
                    cpp: multiLangProblems.cpp || (cppProb ? cppProb.id : '')
                  });
                  setShowMultiLangModal(true);
                }}
                className="px-3.5 py-1.5 bg-gradient-to-r from-emerald-500/20 via-teal-500/20 to-cyan-500/20 hover:from-emerald-500/30 hover:to-teal-500/30 text-emerald-300 border border-emerald-500/40 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition active:scale-[0.98]"
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                <span>🚀 Launch Multi-Language Contest ({students.length} Systems)</span>
              </button>

              <label className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={keepStudentCode}
                  onChange={(e) => setKeepStudentCode(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-slate-700 bg-surface-950 text-emerald-500 focus:ring-emerald-500/20 accent-emerald-500"
                />
                <span>Keep draft code on re-assign</span>
              </label>
            </div>
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
                <optgroup label="📢 Bulk Groups">
                  <option value="ALL">📢 All Students ({students.length} Total)</option>
                  <option value="GROUP_PYTHON">🐍 All Python Students ({languageStats.python} Total)</option>
                  <option value="GROUP_C">⚙️ All C Students ({languageStats.c} Total)</option>
                  <option value="GROUP_CPP">⚡ All C++ Students ({languageStats.cpp} Total)</option>
                </optgroup>
                <optgroup label="👤 Individual Students / Teams">
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.isOnline ? '🟢' : '⚪'} [{(s.preferredLanguage || 'py').toUpperCase()}] {s.name} ({s.username}) {s.assignment ? `[${s.assignment.title.slice(0, 15)}...]` : ''}
                    </option>
                  ))}
                </optgroup>
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
                      setStudentCreationType('solo');
                      setSoloStudentData({ name: '', password: '', preferredLanguage: 'python' });
                      setTeamStudentData({ teamName: '', teammates: '', password: '', preferredLanguage: 'python' });
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

                {/* Status & Language Filter Pills */}
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      onClick={() => setStudentFilter('all')}
                      className={`h-8 px-3 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 border ${
                        studentFilter === 'all'
                          ? 'bg-slate-800 text-white border-slate-700 shadow-sm'
                          : 'bg-surface-950 text-slate-400 hover:text-slate-200 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      All ({statusCounts.all})
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
                      <span>Online ({statusCounts.online})</span>
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
                      <span>Offline ({statusCounts.offline})</span>
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
                      <span>Solved ({statusCounts.solved})</span>
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
                      <span>In Progress ({statusCounts.inProgress})</span>
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
                      <span>Timed Out ({statusCounts.expired})</span>
                    </button>

                    <button
                      onClick={() => setStudentFilter('unassigned')}
                      className={`h-8 px-3 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 border ${
                        studentFilter === 'unassigned'
                          ? 'bg-slate-800 text-white border-slate-700 shadow-sm'
                          : 'bg-surface-950 text-slate-400 hover:text-slate-200 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <span>Unassigned ({statusCounts.unassigned})</span>
                    </button>
                  </div>

                  {/* Language Pills Bar */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-slate-800">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">Language:</span>
                    <button
                      onClick={() => setSelectedLanguageFilter('all')}
                      className={`h-6 px-2.5 rounded text-[11px] font-semibold transition border ${
                        selectedLanguageFilter === 'all'
                          ? 'bg-slate-800 text-white border-slate-600 shadow-sm'
                          : 'bg-surface-950 text-slate-400 hover:text-slate-200 border-slate-800'
                      }`}
                    >
                      All ({languageStats.total})
                    </button>
                    <button
                      onClick={() => setSelectedLanguageFilter('python')}
                      className={`h-6 px-2.5 rounded text-[11px] font-semibold transition border flex items-center gap-1 ${
                        selectedLanguageFilter === 'python'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm font-bold'
                          : 'bg-surface-950 text-slate-400 hover:text-emerald-300 border-slate-800'
                      }`}
                    >
                      <span>🐍 Python</span>
                      <span className="text-[10px] px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-300">{languageStats.python}</span>
                    </button>
                    <button
                      onClick={() => setSelectedLanguageFilter('c')}
                      className={`h-6 px-2.5 rounded text-[11px] font-semibold transition border flex items-center gap-1 ${
                        selectedLanguageFilter === 'c'
                          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-sm font-bold'
                          : 'bg-surface-950 text-slate-400 hover:text-cyan-300 border-slate-800'
                      }`}
                    >
                      <span>⚙️ C</span>
                      <span className="text-[10px] px-1 py-0.2 rounded bg-cyan-500/20 text-cyan-300">{languageStats.c}</span>
                    </button>
                    <button
                      onClick={() => setSelectedLanguageFilter('cpp')}
                      className={`h-6 px-2.5 rounded text-[11px] font-semibold transition border flex items-center gap-1 ${
                        selectedLanguageFilter === 'cpp'
                          ? 'bg-blue-500/20 text-blue-300 border-blue-500/50 shadow-sm font-bold'
                          : 'bg-surface-950 text-slate-400 hover:text-blue-300 border-slate-800'
                      }`}
                    >
                      <span>⚡ C++</span>
                      <span className="text-[10px] px-1 py-0.2 rounded bg-blue-500/20 text-blue-300">{languageStats.cpp}</span>
                    </button>
                  </div>
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
                        <th className="py-3.5 px-4 bg-surface-950">Username & Language</th>
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
                          <td className="py-4 px-4 font-mono text-slate-400">
                            <div className="flex items-center gap-2">
                              <span>{s.username}</span>
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                                (s.preferredLanguage === 'c') ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/20' :
                                (s.preferredLanguage === 'cpp' || s.preferredLanguage === 'c++') ? 'bg-blue-500/10 text-blue-300 border border-blue-500/20' :
                                'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                              }`}>
                                {s.preferredLanguage === 'cpp' ? 'C++' : (s.preferredLanguage?.toUpperCase() || 'PYTHON')}
                              </span>
                            </div>
                          </td>

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
                  onClick={() => {
                    setEditingProblemId(null);
                    setNewProblemData({
                      title: '',
                      language: 'python',
                      filename: '',
                      description: '',
                      starterCode: '',
                      durationMinutes: 15,
                      expectedOutput: ''
                    });
                    setShowAddProblemModal(true);
                  }}
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
                        <span className="text-emerald-400 font-medium flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>{p.durationMinutes || 15} mins timer</span>
                        </span>
                        <span>•</span>
                        <span>Sandbox: {p.timeLimitMs || 3000}ms</span>
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
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <User className="w-4 h-4 text-emerald-400" />
                  <span>Add Students</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Create a Solo Student or Team account</p>
              </div>
              <button
                onClick={() => setShowAddStudentModal(false)}
                className="w-8 h-8 rounded-lg bg-surface-950 hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition border border-slate-800 font-bold"
              >
                ✕
              </button>
            </div>

            {/* Participation Format Tabs */}
            <div className="flex bg-surface-950 p-1 rounded-xl border border-slate-800 mb-5">
              <button
                type="button"
                onClick={() => setStudentCreationType('solo')}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                  studentCreationType === 'solo'
                    ? 'bg-emerald-500 text-slate-950 font-bold shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <User className="w-3.5 h-3.5" />
                <span>Solo Student</span>
              </button>
              <button
                type="button"
                onClick={() => setStudentCreationType('team')}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                  studentCreationType === 'team'
                    ? 'bg-blue-500 text-slate-950 font-bold shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Team Account</span>
              </button>
            </div>

            {/* Solo Form */}
            {studentCreationType === 'solo' && (
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

                <div>
                  <label className="block text-slate-400 font-semibold mb-1.5">Preferred Programming Language</label>
                  <select
                    value={soloStudentData.preferredLanguage}
                    onChange={(e) => setSoloStudentData({ ...soloStudentData, preferredLanguage: e.target.value })}
                    className="w-full h-10 bg-surface-950 border border-slate-800 rounded-xl px-3.5 py-2 text-slate-200 focus:outline-none focus:border-emerald-500 font-medium"
                  >
                    <option value="python">🐍 Python (Default)</option>
                    <option value="c">⚙️ C Language</option>
                    <option value="cpp">⚡ C++</option>
                  </select>
                </div>

                {soloStudentData.name.trim() && (
                  <div className="p-2.5 rounded-xl bg-surface-950 border border-slate-800 text-[11px] text-slate-400 font-mono">
                    <span className="text-slate-500">Login username: </span>
                    <span className="text-emerald-400 font-semibold">{formatUsernamePreview(soloStudentData.name, false)}</span>
                    <span className="text-slate-500 block text-[10px] font-sans mt-0.5">
                      Student can log in using either their name or username.
                    </span>
                  </div>
                )}

                <div className="flex justify-end items-center gap-2 pt-3 border-t border-slate-800">
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
              </form>
            )}

            {/* Team Form */}
            {studentCreationType === 'team' && (
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

                <div>
                  <label className="block text-slate-400 font-semibold mb-1.5">Team Contest Language</label>
                  <select
                    value={teamStudentData.preferredLanguage}
                    onChange={(e) => setTeamStudentData({ ...teamStudentData, preferredLanguage: e.target.value })}
                    className="w-full h-10 bg-surface-950 border border-slate-800 rounded-xl px-3.5 py-2 text-slate-200 focus:outline-none focus:border-blue-500 font-medium"
                  >
                    <option value="python">🐍 Python (Default)</option>
                    <option value="c">⚙️ C Language</option>
                    <option value="cpp">⚡ C++</option>
                  </select>
                </div>

                {teamStudentData.teamName.trim() && (
                  <div className="p-2.5 rounded-xl bg-surface-950 border border-slate-800 text-[11px] text-slate-400 font-mono">
                    <span className="text-slate-500">Team login username: </span>
                    <span className="text-blue-400 font-semibold">{formatUsernamePreview(teamStudentData.teamName, true)}</span>
                    <span className="text-slate-500 block text-[10px] font-sans mt-0.5">
                      Team members can log in using either team name or username.
                    </span>
                  </div>
                )}

                <div className="flex justify-end items-center gap-2 pt-3 border-t border-slate-800">
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
              </form>
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

                  <div>
                    <label className="block text-slate-400 font-semibold mb-1.5">Target Language Preference</label>
                    <select
                      value={bulkGenData.preferredLanguage}
                      onChange={(e) => setBulkGenData({ ...bulkGenData, preferredLanguage: e.target.value })}
                      className="w-full h-10 bg-surface-950 border border-slate-800 rounded-xl px-3.5 py-2 text-slate-200 focus:outline-none focus:border-emerald-500 font-medium"
                    >
                      <option value="python">🐍 Python (Default)</option>
                      <option value="c">⚙️ C Language</option>
                      <option value="cpp">⚡ C++</option>
                    </select>
                  </div>

                  <div className="p-3 bg-surface-950 rounded-xl border border-slate-800 text-[11px] text-slate-400">
                    Will create <strong className="text-emerald-400">{bulkGenData.preferredLanguage.toUpperCase()}</strong> accounts: <strong className="text-emerald-400">{bulkGenData.prefix}{bulkGenData.startNumber}</strong> to <strong className="text-emerald-400">{bulkGenData.prefix}{Number(bulkGenData.startNumber) + Number(bulkGenData.count) - 1}</strong> with passwords <strong className="text-amber-400">{bulkGenData.passwordPrefix}1</strong>, <strong className="text-amber-400">{bulkGenData.passwordPrefix}2</strong>...
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="block text-slate-400 font-semibold">
                    Paste Student Rows (Format: <code className="text-emerald-400 font-mono">username, password, Full Name / Team, language</code>)
                  </label>
                  <textarea
                    rows={6}
                    required
                    value={bulkCsvText}
                    onChange={(e) => setBulkCsvText(e.target.value)}
                    placeholder="student10, pass10, Alice (Team 10), python&#10;student11, pass11, Bob (Team 11), c&#10;student12, pass12, Charlie (Team 12), cpp"
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

      {/* Multi-Language Contest Kickoff Modal */}
      {showMultiLangModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 z-50">
          <div className="bg-surface-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col p-6 shadow-2xl">
            <div className="flex justify-between items-start border-b border-slate-800 pb-4 mb-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-emerald-400" />
                  <span>Launch Multi-Language Contest Simultaneously</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Assign language-specific buggy programs to Python, C, and C++ students/teams at the exact same instant with synchronized timers.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowMultiLangModal(false);
                  setMultiLangResultMsg('');
                }}
                className="w-8 h-8 rounded-lg bg-surface-950 hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition border border-slate-800 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto flex-1 pr-2 text-xs">
              {/* Participant Summary Cards */}
              <div className="grid grid-cols-4 gap-2.5">
                <div className="bg-surface-950 p-3 rounded-xl border border-slate-800">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Total Systems</div>
                  <div className="text-xl font-mono font-bold text-white mt-1">{languageStats.total}</div>
                  <div className="text-[10px] text-slate-500">Across {languageStats.total} LAN station{languageStats.total !== 1 ? 's' : ''}</div>
                </div>
                <div className="bg-emerald-950/20 p-3 rounded-xl border border-emerald-500/30">
                  <div className="text-[10px] uppercase font-bold text-emerald-400">🐍 Python Students</div>
                  <div className="text-xl font-mono font-bold text-emerald-300 mt-1">{languageStats.python}</div>
                  <div className="text-[10px] text-emerald-500/80">Will get Python bug</div>
                </div>
                <div className="bg-cyan-950/20 p-3 rounded-xl border border-cyan-500/30">
                  <div className="text-[10px] uppercase font-bold text-cyan-400">⚙️ C Students</div>
                  <div className="text-xl font-mono font-bold text-cyan-300 mt-1">{languageStats.c}</div>
                  <div className="text-[10px] text-cyan-500/80">Will get C bug</div>
                </div>
                <div className="bg-blue-950/20 p-3 rounded-xl border border-blue-500/30">
                  <div className="text-[10px] uppercase font-bold text-blue-400">⚡ C++ Students</div>
                  <div className="text-xl font-mono font-bold text-blue-300 mt-1">{languageStats.cpp}</div>
                  <div className="text-[10px] text-blue-500/80">Will get C++ bug</div>
                </div>
              </div>

              {/* Language Problem Selectors */}
              <div className="space-y-3 pt-2">
                {/* 1. Python Problem Selection */}
                <div className="p-3.5 bg-surface-950 rounded-xl border border-emerald-500/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                      <span>🐍 Python Problem</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono">
                        Targeting {languageStats.python} student{languageStats.python !== 1 ? 's' : ''}
                      </span>
                    </label>
                  </div>
                  <select
                    value={multiLangProblems.python}
                    onChange={(e) => setMultiLangProblems({ ...multiLangProblems, python: e.target.value })}
                    className="w-full h-10 bg-surface-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500 text-xs font-medium"
                  >
                    <option value="">-- Do not assign to Python students --</option>
                    <optgroup label="🐍 Python Repository Problems">
                      {problems.filter(p => p.language === 'python').map(p => (
                        <option key={p.id} value={p.id}>{p.title} ({p.durationMinutes || 15}m timer)</option>
                      ))}
                    </optgroup>
                    <optgroup label="All Problems">
                      {problems.filter(p => p.language !== 'python').map(p => (
                        <option key={p.id} value={p.id}>{p.title} ({p.language.toUpperCase()})</option>
                      ))}
                    </optgroup>
                  </select>
                </div>

                {/* 2. C Problem Selection */}
                <div className="p-3.5 bg-surface-950 rounded-xl border border-cyan-500/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-cyan-400 flex items-center gap-1.5">
                      <span>⚙️ C Problem</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-mono">
                        Targeting {languageStats.c} student{languageStats.c !== 1 ? 's' : ''}
                      </span>
                    </label>
                  </div>
                  <select
                    value={multiLangProblems.c}
                    onChange={(e) => setMultiLangProblems({ ...multiLangProblems, c: e.target.value })}
                    className="w-full h-10 bg-surface-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-cyan-500 text-xs font-medium"
                  >
                    <option value="">-- Do not assign to C students --</option>
                    <optgroup label="⚙️ C Repository Problems">
                      {problems.filter(p => p.language === 'c').map(p => (
                        <option key={p.id} value={p.id}>{p.title} ({p.durationMinutes || 15}m timer)</option>
                      ))}
                    </optgroup>
                    <optgroup label="All Problems">
                      {problems.filter(p => p.language !== 'c').map(p => (
                        <option key={p.id} value={p.id}>{p.title} ({p.language.toUpperCase()})</option>
                      ))}
                    </optgroup>
                  </select>
                </div>

                {/* 3. C++ Problem Selection */}
                <div className="p-3.5 bg-surface-950 rounded-xl border border-blue-500/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-blue-400 flex items-center gap-1.5">
                      <span>⚡ C++ Problem</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono">
                        Targeting {languageStats.cpp} student{languageStats.cpp !== 1 ? 's' : ''}
                      </span>
                    </label>
                  </div>
                  <select
                    value={multiLangProblems.cpp}
                    onChange={(e) => setMultiLangProblems({ ...multiLangProblems, cpp: e.target.value })}
                    className="w-full h-10 bg-surface-900 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500 text-xs font-medium"
                  >
                    <option value="">-- Do not assign to C++ students --</option>
                    <optgroup label="⚡ C++ Repository Problems">
                      {problems.filter(p => p.language === 'cpp').map(p => (
                        <option key={p.id} value={p.id}>{p.title} ({p.durationMinutes || 15}m timer)</option>
                      ))}
                    </optgroup>
                    <optgroup label="All Problems">
                      {problems.filter(p => p.language !== 'cpp').map(p => (
                        <option key={p.id} value={p.id}>{p.title} ({p.language.toUpperCase()})</option>
                      ))}
                    </optgroup>
                  </select>
                </div>
              </div>

              {/* Code Reset option checkbox */}
              <div className="p-3 rounded-xl bg-surface-950 border border-slate-800 flex items-center justify-between">
                <div>
                  <div className="text-slate-200 font-semibold">Starter Code Handling</div>
                  <div className="text-[11px] text-slate-400">
                    {keepStudentCode ? 'Preserve any existing drafts if students are re-assigned' : 'Provide a clean, fresh starter code template to all students'}
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                  <input
                    type="checkbox"
                    checked={keepStudentCode}
                    onChange={(e) => setKeepStudentCode(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-700 bg-surface-900 text-emerald-500 focus:ring-emerald-500"
                  />
                  <span>Keep existing drafts</span>
                </label>
              </div>

              {/* Success Result Message Banner */}
              {multiLangResultMsg && (
                <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/50 text-emerald-300 text-xs font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{multiLangResultMsg}</span>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-slate-800 mt-4">
              <button
                type="button"
                onClick={() => {
                  setShowMultiLangModal(false);
                  setMultiLangResultMsg('');
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium border border-slate-700 transition text-xs"
              >
                Close
              </button>

              <button
                type="button"
                onClick={handleLaunchMultiLanguageContest}
                disabled={multiLangLoading || (!multiLangProblems.python && !multiLangProblems.c && !multiLangProblems.cpp)}
                className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 via-cyan-500 to-blue-500 hover:opacity-95 text-slate-950 rounded-xl font-extrabold flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition active:scale-[0.99] disabled:opacity-50 text-xs"
              >
                <Sparkles className="w-4 h-4 stroke-[2.5]" />
                <span>{multiLangLoading ? `Launching to all ${languageStats.total} systems...` : '🚀 Launch Contest Across All Systems'}</span>
              </button>
            </div>
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
                    autoFocus
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

              {/* Problem Expected Output Field */}
              <div className="space-y-2 pt-2">
                <div>
                  <label className="text-slate-300 font-bold uppercase tracking-wider text-xs flex items-center gap-1.5">
                    <span>Expected Output (Stdout) *</span>
                  </label>
                  <p className="text-[11px] text-slate-500">The exact console output that the student's fixed program should produce.</p>
                </div>

                <textarea
                  rows={4}
                  required
                  value={newProblemData.expectedOutput}
                  onChange={(e) => setNewProblemData({ ...newProblemData, expectedOutput: e.target.value })}
                  placeholder="e.g. YES&#10;YES&#10;NO"
                  className="w-full bg-surface-950 border border-slate-800 rounded-xl p-3.5 text-emerald-300 font-mono text-xs focus:outline-none focus:border-emerald-500 resize-none shadow-inner"
                />
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
      {selectedSubmission && (() => {
        let parsedDiag = null;
        if (selectedSubmission.rawOutput) {
          try {
            parsedDiag = typeof selectedSubmission.rawOutput === 'object'
              ? selectedSubmission.rawOutput
              : JSON.parse(selectedSubmission.rawOutput);
          } catch {
            parsedDiag = null;
          }
        }

        return (
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

                {parsedDiag && parsedDiag.testResults && parsedDiag.testResults.length > 0 ? (
                  <div>
                    <div className="text-slate-400 font-semibold uppercase text-[10px] mb-2 flex items-center justify-between">
                      <span>Evaluator Test Case Breakdown ({parsedDiag.testResults.length} Cases)</span>
                      <span className="text-slate-500 font-mono">Total Execution: {parsedDiag.durationMs || selectedSubmission.executionTimeMs}ms</span>
                    </div>
                    <div className="space-y-2">
                      {parsedDiag.testResults.map((tr, i) => (
                        <div key={i} className={`p-3 rounded-xl border ${tr.passed ? 'bg-emerald-950/20 border-emerald-500/30' : 'bg-rose-950/20 border-rose-500/30'} space-y-2`}>
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-200 text-xs font-mono">
                              Test Case #{tr.testCaseIndex || i + 1} {tr.isHidden ? '(Hidden)' : '(Visible)'}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${tr.passed ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                              {tr.passed ? 'PASSED' : tr.timedOut ? 'TIMEOUT' : tr.compileFailed ? 'COMPILE ERROR' : tr.runtimeFailed ? 'RUNTIME ERROR' : 'FAILED (Wrong Output)'}
                            </span>
                          </div>

                          {(tr.expectedOutput !== undefined || tr.actualOutput !== undefined) && (
                            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                              <div className="bg-surface-950 p-2 rounded-lg border border-slate-800">
                                <span className="text-slate-500 block text-[10px]">Expected Output:</span>
                                <span className="text-slate-300 whitespace-pre-wrap">{tr.expectedOutput || '(Empty)'}</span>
                              </div>
                              <div className="bg-surface-950 p-2 rounded-lg border border-slate-800">
                                <span className="text-slate-500 block text-[10px]">Actual Output:</span>
                                <span className={tr.passed ? 'text-emerald-400 whitespace-pre-wrap' : 'text-rose-400 whitespace-pre-wrap'}>{tr.actualOutput || '(Empty)'}</span>
                              </div>
                            </div>
                          )}

                          {tr.error && (
                            <div className="p-2 bg-rose-950/40 border border-rose-500/30 rounded-lg text-rose-300 font-mono text-[11px] whitespace-pre-wrap">
                              {tr.error}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {(parsedDiag?.stderr || parsedDiag?.rawError) && (
                  <div>
                    <div className="text-slate-400 font-semibold uppercase text-[10px] mb-2">Compiler / Runtime Output</div>
                    <div className="bg-surface-950 p-4 rounded-xl border border-rose-500/30 font-mono text-rose-300 text-[11px] max-h-48 overflow-y-auto whitespace-pre-wrap">
                      {parsedDiag.stderr || parsedDiag.rawError}
                    </div>
                  </div>
                )}

                <div>
                  <div className="text-slate-400 font-semibold uppercase text-[10px] mb-2">
                    Raw Internal Diagnostics JSON
                  </div>
                  <div className="bg-surface-950 p-3 rounded-xl border border-slate-800 font-mono text-slate-400 text-[10px] max-h-36 overflow-y-auto whitespace-pre-wrap">
                    <pre>{parsedDiag ? JSON.stringify(parsedDiag, null, 2) : (selectedSubmission.rawOutput || 'No output recorded')}</pre>
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
        );
      })()}

      <ConfirmDialog {...dialogProps} />
    </div>
  );
}
