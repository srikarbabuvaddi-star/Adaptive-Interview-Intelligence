# Production Deployment Guide

Backend: **Adaptive Interview Intelligence**  
Runtime: **Node.js (Express.js)**  
Platform Target: **Google Cloud Run, Render, Railway, or AWS ECS**

---

## 1. Production Checklist

Before deploying to production:
- [ ] Replace any development keys with real Google Cloud / Gemini API keys and Firebase service account credentials.
- [ ] Set `NODE_ENV=production`.
- [ ] Set `FRONTEND_URL` to your production React app URL (e.g. `https://adaptive-interview.web.app`).
- [ ] Deploy Firestore security rules (`firebase deploy --only firestore:rules`).
- [ ] Ensure `ENABLE_MOCK_SERVICES=false`.
- [ ] Verify rate limiting settings (`RATE_LIMIT_MAX=100`, `RATE_LIMIT_WINDOW_MS=900000`).

---

## 2. Option A: Google Cloud Run (Recommended)

Google Cloud Run is the recommended platform because it natively integrates with Firebase and Google Gemini API with minimal latency, zero-scaling cost, and automatic HTTPS.

### Step 1: Install & Authenticate Google Cloud CLI
```bash
gcloud auth login
gcloud config set project YOUR_GOOGLE_CLOUD_PROJECT_ID
```

### Step 2: Build and Deploy Container Directly
```bash
gcloud run deploy adaptive-interview-backend \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars NODE_ENV=production \
  --set-env-vars FRONTEND_URL="https://your-frontend-app.web.app" \
  --set-env-vars GEMINI_MODEL="gemini-2.5-flash"
```

### Step 3: Configure Cloud Run Secrets
Store sensitive secrets in Google Secret Manager or Cloud Run environment variables:
```bash
gcloud run services update adaptive-interview-backend \
  --set-env-vars GEMINI_API_KEY="your-gemini-api-key" \
  --set-env-vars FIREBASE_PROJECT_ID="your-project-id" \
  --set-env-vars FIREBASE_CLIENT_EMAIL="firebase-adminsdk-xxx@your-project.iam.gserviceaccount.com" \
  --set-env-vars FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
```

---

## 3. Option B: Render or Railway

### Render:
1. Connect your GitHub repository to [Render.com](https://render.com/).
2. Select **Web Service**.
3. Choose **Node** runtime (or Docker).
4. Build Command: `npm install`
5. Start Command: `npm start`
6. Add Environment Variables in the Render Dashboard:
   - `NODE_ENV`: `production`
   - `PORT`: `10000` (or leave default assigned by Render)
   - `FRONTEND_URL`: `https://your-react-frontend.vercel.app`
   - `FIREBASE_PROJECT_ID`: `your-firebase-project-id`
   - `FIREBASE_CLIENT_EMAIL`: `your-service-account-email`
   - `FIREBASE_PRIVATE_KEY`: Private key with escaped newlines `\n`
   - `GEMINI_API_KEY`: Your Gemini API key
   - `GEMINI_MODEL`: `gemini-2.5-flash`

### Railway:
1. Click **New Project > Deploy from GitHub repo**.
2. Railway detects `package.json` and runs `npm install` and `npm start`.
3. In project **Variables**, add all required secrets from `.env.example`.

---

## 4. Option C: Docker Container Deployment

Build the container image:
```bash
docker build -t adaptive-interview-backend:latest .
```

Run the container:
```bash
docker run -d \
  -p 5000:5000 \
  --env-file .env \
  --name adaptive-backend \
  adaptive-interview-backend:latest
```

Verify logs:
```bash
docker logs -f adaptive-backend
```

---

## 5. Health Check & Uptime Monitoring

The backend exposes a lightweight health check endpoint at `/api/health`:
```http
GET https://your-backend-domain.com/api/health
```

Expected response (`200 OK`):
```json
{
  "success": true,
  "message": "API Service is running smoothly",
  "data": {
    "status": "healthy",
    "timestamp": "2026-10-11T14:30:00.000Z",
    "service": "Adaptive Interview Intelligence API",
    "version": "1.0.0"
  }
}
```

Configure your uptime pingers (e.g. Better Uptime, UptimeRobot, or Google Cloud Monitoring) to point to `/api/health`.
