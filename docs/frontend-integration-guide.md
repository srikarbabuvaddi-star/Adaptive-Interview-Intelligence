# React Frontend Integration Guide

This guide explains how to connect the React frontend to the **Adaptive Interview Intelligence** Express backend.

---

## 1. Firebase Client Configuration

Install Firebase in your React project:
```bash
npm install firebase axios
```

Initialize Firebase client in `src/firebase/config.js`:
```javascript
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
```

---

## 2. API Client with Automatic ID-Token Injection

Create `src/api/client.js` with an Axios request interceptor that attaches the user's fresh Firebase ID Token:

```javascript
import axios from 'axios';
import { auth } from '../firebase/config';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000/api',
  headers: {
    'Content-Type': 'application/json'
  }
});

// Attach Firebase Bearer token to all outgoing requests
api.interceptors.request.use(async (config) => {
  const currentUser = auth.currentUser;
  if (currentUser) {
    const token = await currentUser.getIdToken();
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => Promise.reject(error));

export default api;
```

---

## 3. User Authentication & Registration Flow

When a user signs up via Firebase Authentication, your React app must immediately register their role with the backend:

```javascript
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase/config';
import api from '../api/client';

export const registerUser = async ({ email, password, displayName, role, profileData }) => {
  // 1. Create account in Firebase Auth
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  
  // 2. Register role and profile in the backend
  const payload = {
    role, // 'candidate' or 'recruiter'
    displayName,
    ...(role === 'candidate' ? { candidateProfile: profileData } : { recruiterProfile: profileData })
  };

  const response = await api.post('/auth/register', payload);
  return response.data.data;
};
```

On app reload, fetch the server-validated user record:
```javascript
export const getCurrentProfile = async () => {
  const response = await api.get('/users/me');
  return response.data.data; // { uid, email, role, displayName, ... }
};
```

---

## 4. Candidate Adaptive Interview Flow

### Step 1: Start Interview
```javascript
const handleStartInterview = async (interviewId) => {
  const res = await api.post(`/interviews/${interviewId}/start`);
  const { currentQuestion, totalQuestions, questionIndex } = res.data.data;
  
  setQuestion(currentQuestion);
  setProgress({ current: questionIndex, total: totalQuestions });
};
```

### Step 2: Automated Proctoring & Tab Switch Detection
Add an event listener in the interview component to automatically notify the backend of window blur or tab changes:

```javascript
useEffect(() => {
  const handleVisibilityChange = async () => {
    if (document.hidden) {
      await api.post(`/interviews/${interviewId}/integrity-events`, {
        eventType: 'tab_switch',
        details: { timestamp: new Date().toISOString() },
        severity: 'medium'
      });
    }
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);
  return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
}, [interviewId]);
```

### Step 3: Submit Answer and Progress Adaptively
```javascript
const handleSubmitAnswer = async (questionId, answerText, timeTakenSeconds) => {
  setIsSubmitting(true);
  try {
    const res = await api.post(`/interviews/${interviewId}/answers`, {
      questionId,
      answerText,
      timeTakenSeconds
    });

    const { isInterviewComplete, nextQuestion, reportId } = res.data.data;

    if (isInterviewComplete) {
      // Redirect to report view
      navigate(`/interviews/${interviewId}/report`);
    } else {
      // Render next question adaptively
      setQuestion(nextQuestion);
      setAnswerText('');
    }
  } catch (err) {
    console.error('Answer submission failed:', err.response?.data?.error?.message);
  } finally {
    setIsSubmitting(false);
  }
};
```

### Step 4: Display Final Report & Skill Gap Analysis
```javascript
const loadReport = async (interviewId) => {
  const res = await api.get(`/interviews/${interviewId}/report`);
  const { report, skillGapReport, transcript } = res.data.data;

  // report.overallScore (0-100)
  // report.recommendation ('strong_hire', 'hire', etc.)
  // report.skillBreakdown (array of evaluated skills)
  // skillGapReport.skills (gap analysis vs required job level)
};
```

---

## 5. Recruiter Dashboard Flow

- **Create Job**: `POST /api/jobs` with `requiredSkills` array.
- **View Applications**: `GET /api/jobs/:jobId/applications`.
- **Invite Candidate**: `POST /api/interviews` passing `{ jobId, candidateId }`.
- **View Candidate Rankings & Reports**: `GET /api/jobs/:jobId/reports`.
