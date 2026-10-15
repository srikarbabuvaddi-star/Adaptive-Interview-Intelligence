import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.PROD ? '' : 'http://localhost:5000');

const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 45000
});

// Interceptor to attach Authorization Bearer token from localStorage
apiClient.interceptors.request.use(
  config => {
    const token = localStorage.getItem('aii_auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  error => Promise.reject(error)
);

// Interceptor for standardized error handling
apiClient.interceptors.response.use(
  response => response,
  error => {
    const message =
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.message ||
      'An unexpected network error occurred';
    const status = error.response?.status;
    const customError = new Error(message);
    customError.status = status;
    customError.data = error.response?.data;
    return Promise.reject(customError);
  }
);

export const interviewApi = {
  // Token management
  getToken() {
    return localStorage.getItem('aii_auth_token') || '';
  },

  setToken(token) {
    if (token) {
      localStorage.setItem('aii_auth_token', token);
    } else {
      localStorage.removeItem('aii_auth_token');
    }
  },

  // Auth & Profile
  async getCurrentUser() {
    try {
      const res = await apiClient.get('/api/auth/me');
      return res.data?.data;
    } catch {
      const res = await apiClient.get('/api/users/me');
      return res.data?.data;
    }
  },

  async signup(userData) {
    const res = await apiClient.post('/api/auth/signup', userData);
    return res.data?.data;
  },

  async login(credentials) {
    const res = await apiClient.post('/api/auth/login', credentials);
    return res.data?.data;
  },

  async registerUser(userData) {
    const res = await apiClient.post('/api/auth/register', userData);
    return res.data?.data;
  },

  // Jobs
  async listJobs(params = {}) {
    const res = await apiClient.get('/api/jobs', { params });
    return res.data?.data || [];
  },

  async getJobById(jobId) {
    const res = await apiClient.get(`/api/jobs/${jobId}`);
    return res.data?.data;
  },

  async createJob(jobData) {
    const res = await apiClient.post('/api/jobs', jobData);
    return res.data?.data;
  },

  // Interviews
  async listInterviews(params = {}) {
    const res = await apiClient.get('/api/interviews', { params });
    return res.data?.data || [];
  },

  async getInterviewById(interviewId) {
    const res = await apiClient.get(`/api/interviews/${interviewId}`);
    return res.data?.data;
  },

  async createInterview(jobIdOrPayload, candidateId = null) {
    let payload = {};
    if (typeof jobIdOrPayload === 'string') {
      payload = { jobId: jobIdOrPayload };
    } else if (jobIdOrPayload && typeof jobIdOrPayload === 'object') {
      payload = { ...jobIdOrPayload };
    }
    if (candidateId) {
      payload.candidateId = candidateId;
    }
    const res = await apiClient.post('/api/interviews', payload);
    return res.data?.data;
  },

  async startInterview(interviewId) {
    const res = await apiClient.post(`/api/interviews/${interviewId}/start`);
    return res.data?.data;
  },

  async submitAnswer(interviewId, { questionId, answerText, timeTakenSeconds = 30 }) {
    const res = await apiClient.post(`/api/interviews/${interviewId}/answers`, {
      questionId,
      answerText,
      timeTakenSeconds
    });
    return res.data?.data;
  },

  async endInterview(interviewId, reason = 'candidate_completed') {
    const res = await apiClient.post(`/api/interviews/${interviewId}/end`, { reason });
    return res.data?.data;
  },

  // Applications Lifecycle
  async applyForJob(jobId, applicationData) {
    const res = await apiClient.post(`/api/jobs/${jobId}/applications`, applicationData);
    return res.data?.data;
  },

  async getMyApplications() {
    const res = await apiClient.get('/api/applications/me');
    return res.data?.data || [];
  },

  async getApplicationsByJob(jobId) {
    const res = await apiClient.get(`/api/jobs/${jobId}/applications`);
    return res.data?.data || [];
  },

  async getApplicationById(applicationId) {
    const res = await apiClient.get(`/api/applications/${applicationId}`);
    return res.data?.data;
  },

  async updateApplicationStatus(applicationId, { status, reviewNotes = '' }) {
    const res = await apiClient.patch(`/api/applications/${applicationId}/status`, {
      status,
      reviewNotes
    });
    return res.data?.data;
  },

  async updateJob(jobId, updateData) {
    const res = await apiClient.patch(`/api/jobs/${jobId}`, updateData);
    return res.data?.data;
  },

  async deleteJob(jobId) {
    const res = await apiClient.delete(`/api/jobs/${jobId}`);
    return res.data?.data;
  },

  async getJobReports(jobId) {
    const res = await apiClient.get(`/api/jobs/${jobId}/reports`);
    return res.data?.data || [];
  },

  // Reports & Telemetry
  async getInterviewReport(interviewId) {
    const res = await apiClient.get(`/api/interviews/${interviewId}/report`);
    return res.data?.data;
  },

  async getSkillGap(interviewId) {
    const res = await apiClient.get(`/api/interviews/${interviewId}/skill-gap`);
    return res.data?.data;
  },

  async getIntegrityTimeline(interviewId) {
    const res = await apiClient.get(`/api/interviews/${interviewId}/integrity-timeline`);
    return res.data?.data;
  },

  async recordIntegrityEvent(interviewId, event) {
    try {
      const res = await apiClient.post(`/api/interviews/${interviewId}/integrity-events`, event);
      return res.data?.data;
    } catch (err) {
      // Telemetry errors should not interrupt active interview session
      console.warn('Telemetry event failed to sync:', err.message);
      return null;
    }
  },

  async reviewIntegrityEvent(interviewId, eventId, { reviewStatus, reviewNotes = '', falsePositive = false }) {
    const res = await apiClient.patch(
      `/api/interviews/${interviewId}/integrity-events/${eventId}/review`,
      { reviewStatus, reviewNotes, falsePositive }
    );
    return res.data?.data;
  },

  // Resume Management & Extracted Profile
  async uploadResume(file) {
    const formData = new FormData();
    formData.append('resume', file);
    const res = await apiClient.post('/api/resumes/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    return res.data?.data;
  },

  async getMyResume() {
    const res = await apiClient.get('/api/resumes/me');
    return res.data?.data;
  },

  async getMyResumeVersions() {
    const res = await apiClient.get('/api/resumes/me/versions');
    return res.data?.data || [];
  },

  async downloadMyResume(version = null) {
    const url = version ? `/api/resumes/me/download?version=${version}` : '/api/resumes/me/download';
    const res = await apiClient.get(url, { responseType: 'blob' });
    return res.data;
  },

  async reprocessMyResume() {
    const res = await apiClient.post('/api/resumes/me/reprocess');
    return res.data?.data;
  },

  async getCandidateResume(candidateId) {
    const res = await apiClient.get(`/api/resumes/candidate/${candidateId}`);
    return res.data?.data;
  },

  async downloadCandidateResume(candidateId, version = null) {
    const url = version
      ? `/api/resumes/candidate/${candidateId}/download?version=${version}`
      : `/api/resumes/candidate/${candidateId}/download`;
    const res = await apiClient.get(url, { responseType: 'blob' });
    return res.data;
  },

  // Job Explorer & Market Salary Intelligence
  async searchMarketJobs(params = {}) {
    const res = await apiClient.get('/api/job-explorer/search', { params });
    return res.data?.data;
  },

  async getMarketJobDetails(jobId, provider) {
    const res = await apiClient.get(`/api/job-explorer/jobs/${jobId}`, {
      params: provider ? { provider } : {}
    });
    return res.data?.data;
  },

  async getMarketSalaryBenchmark(params = {}) {
    const res = await apiClient.get('/api/job-explorer/salary-benchmark', { params });
    return res.data?.data;
  },

  async compareResumeWithJob(jobData) {
    const res = await apiClient.post('/api/job-explorer/compare-skills', { jobData });
    return res.data?.data;
  },

  async prepareMarketJobInterview(jobData) {
    const res = await apiClient.post('/api/job-explorer/prepare-interview', { jobData });
    return res.data?.data;
  },

  // Real-Time Voice AI API
  async transcribeAudio(fileOrBlob) {
    const formData = new FormData();
    formData.append('audio', fileOrBlob);
    const res = await apiClient.post('/api/voice/transcribe', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return res.data?.data;
  },

  async getVoiceSessionState(interviewId) {
    const res = await apiClient.get(`/api/voice/session/${interviewId}/state`);
    return res.data?.data;
  },

  async updateVoiceSessionState(interviewId, state, metadata = {}) {
    const res = await apiClient.post(`/api/voice/session/${interviewId}/state`, {
      state,
      metadata
    });
    return res.data?.data;
  },

  async synthesizeVoice({ text, voice = 'en-US-Neural2-F', rate = 1.0 }) {
    const res = await apiClient.post('/api/voice/synthesize', { text, voice, rate });
    return res.data?.data;
  },

  // Observability & Diagnostics
  async getObservabilityMetrics() {
    const res = await apiClient.get('/api/observability/metrics');
    return res.data?.data;
  },

  async getObservabilityTraces(params = {}) {
    const res = await apiClient.get('/api/observability/traces', { params });
    return res.data?.data;
  },

  // Resilient Background Job Queue
  async getQueueJobStatus(jobId) {
    const res = await apiClient.get(`/api/queue/jobs/${jobId}`);
    return res.data?.data;
  }
};

/**
 * Resolves the WebSocket URL compatible with local development and production deployments
 */
export const getWebSocketUrl = (token) => {
  const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
  const protocol = isHttps ? 'wss:' : 'ws:';
  const apiBase = import.meta.env.VITE_API_BASE_URL;

  let host = typeof window !== 'undefined' ? window.location.host : 'localhost:5000';
  if (apiBase && apiBase.startsWith('http')) {
    try {
      const parsed = new URL(apiBase);
      host = parsed.host;
    } catch {
      // fallback to current window host
    }
  }

  const query = token ? `?token=${encodeURIComponent(token)}` : '';
  return `${protocol}//${host}/ws${query}`;
};

export default interviewApi;

