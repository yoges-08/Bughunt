/**
 * API Service for Bug Hunt App
 * Handles dynamic host connection (Host Mode vs Client Mode LAN IP) and authentication tokens.
 */

const STORAGE_KEYS = {
  TOKEN: 'bughunt_token',
  USER: 'bughunt_user',
  HOST_URL: 'bughunt_host_url'
};

class ApiService {
  constructor() {
    this.token = localStorage.getItem(STORAGE_KEYS.TOKEN) || null;
    this.user = JSON.parse(localStorage.getItem(STORAGE_KEYS.USER) || 'null');
    
    // Automatically detect current server origin
    const defaultHost = window.location.origin && window.location.origin !== 'null'
      ? window.location.origin
      : 'http://localhost:4000';

    this.hostUrl = localStorage.getItem(STORAGE_KEYS.HOST_URL) || defaultHost;
  }

  setHostUrl(url) {
    if (!url) return;
    let cleanUrl = url.trim();
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = `http://${cleanUrl}`;
    }
    // Remove trailing slash
    cleanUrl = cleanUrl.replace(/\/$/, '');
    this.hostUrl = cleanUrl;
    localStorage.setItem(STORAGE_KEYS.HOST_URL, cleanUrl);
  }

  getHostUrl() {
    return this.hostUrl || 'http://localhost:4000';
  }

  setSession(token, user) {
    this.token = token;
    this.user = user;
    localStorage.setItem(STORAGE_KEYS.TOKEN, token);
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
  }

  clearSession() {
    this.token = null;
    this.user = null;
    localStorage.removeItem(STORAGE_KEYS.TOKEN);
    localStorage.removeItem(STORAGE_KEYS.USER);
  }

  isAuthenticated() {
    return Boolean(this.token && this.user);
  }

  getUser() {
    return this.user;
  }

  async request(endpoint, options = {}) {
    const url = `${this.getHostUrl()}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers
      });

      if (response.status === 401) {
        this.clearSession();
      }

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || data.message || `Request failed with status ${response.status}`);
      }

      return data;
    } catch (err) {
      console.error(`API Error on [${endpoint}]:`, err.message);
      throw err;
    }
  }

  // --- Auth APIs ---
  async login(username, password) {
    const data = await this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    this.setSession(data.token, data.user);
    return data;
  }

  async getMe() {
    return this.request('/api/auth/me');
  }

  // --- System Info API ---
  async getSystemInfo() {
    return this.request('/api/system/info');
  }

  // --- Admin APIs ---
  async getAdminOverview() {
    return this.request('/api/admin/overview');
  }

  async getAdminStudents() {
    return this.request('/api/admin/students');
  }

  async createStudent(username, password, name) {
    return this.request('/api/admin/students', {
      method: 'POST',
      body: JSON.stringify({ username, password, name })
    });
  }

  async getAdminProblems() {
    return this.request('/api/admin/problems');
  }

  async createProblem(problemData) {
    return this.request('/api/admin/problems', {
      method: 'POST',
      body: JSON.stringify(problemData)
    });
  }

  async assignProblem({ problemId, studentId, assignAll }) {
    return this.request('/api/admin/assign', {
      method: 'POST',
      body: JSON.stringify({ problemId, studentId, assignAll })
    });
  }

  async getAdminSubmissions() {
    return this.request('/api/admin/submissions');
  }

  // --- Student APIs ---
  async getStudentCurrentProblem() {
    return this.request('/api/student/current-problem');
  }

  async saveDraftCode(code) {
    return this.request('/api/student/save-code', {
      method: 'POST',
      body: JSON.stringify({ code })
    });
  }

  async runStudentCode({ code, language, stdin }) {
    return this.request('/api/student/run', {
      method: 'POST',
      body: JSON.stringify({ code, language, stdin })
    });
  }

  async submitStudentCode({ problemId, code, language }) {
    return this.request('/api/student/submit', {
      method: 'POST',
      body: JSON.stringify({ problemId, code, language })
    });
  }

  async getStudentSubmissions() {
    return this.request('/api/student/submissions');
  }
}

export const api = new ApiService();
