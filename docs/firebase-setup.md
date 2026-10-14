# Firebase & Google Cloud Setup Guide

This guide walks you through setting up Firebase Authentication and Cloud Firestore for **Adaptive Interview Intelligence**.

---

## 1. Create a Firebase Project

1. Navigate to the [Firebase Console](https://console.firebase.google.com/).
2. Click **Add project** (or **Create a project**).
3. Name your project (e.g. `adaptive-interview-intelligence`).
4. (Optional) Enable Google Analytics and click **Create Project**.

---

## 2. Enable Firebase Authentication

1. In the Firebase Console left menu, click **Build > Authentication**.
2. Click **Get Started**.
3. Under the **Sign-in method** tab, enable:
   - **Email/Password** (Enable both Email/Password and Email link, or Email/Password alone).
   - (Optional) **Google** sign-in provider.
4. Click **Save**.

---

## 3. Create Cloud Firestore Database

1. In the Firebase Console, click **Build > Firestore Database**.
2. Click **Create database**.
3. Choose your database location (e.g., `us-central1` or `asia-south1`).
4. Select **Start in production mode** (our security rules will manage authorization).
5. Click **Enable**.

---

## 4. Generate Service Account Key (Admin SDK)

The backend Express server requires Firebase Admin SDK credentials to verify tokens and query Firestore:

1. In Firebase Console, click the **Gear Icon (Project settings)** in the top left.
2. Select the **Service accounts** tab.
3. Ensure **Node.js** is selected.
4. Click **Generate new private key** and confirm by clicking **Generate key**.
5. A JSON file will download (e.g., `adaptive-interview-intelligence-firebase-adminsdk-xxxxx.json`).

### Configuration Option A: File Path (Recommended for Local Dev)
Rename the downloaded file to `serviceAccountKey.json` and place it in the project root:
```
c:\Users\hi\Desktop\Adaptive Interview Intelligence\serviceAccountKey.json
```
Set in `.env`:
```env
FIREBASE_SERVICE_ACCOUNT_PATH=./serviceAccountKey.json
```
*(Make sure `serviceAccountKey.json` is listed in `.gitignore`)*

### Configuration Option B: Environment Variables (Recommended for Cloud Hosting)
Extract values from the downloaded JSON file and put them directly in `.env`:
```env
FIREBASE_PROJECT_ID="your-project-id"
FIREBASE_CLIENT_EMAIL="firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com"
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQD...==\n-----END PRIVATE KEY-----\n"
```

---

## 5. Deploy Firestore Security Rules

To apply the production security rules:

1. Install the Firebase CLI:
   ```bash
   npm install -g firebase-tools
   ```
2. Log in:
   ```bash
   firebase login
   ```
3. Initialize in this project directory:
   ```bash
   firebase use --add your-project-id
   ```
4. Deploy rules:
   ```bash
   firebase deploy --only firestore:rules
   ```

---

## 6. Offline Local Testing / Fallback Mode

If credentials are not yet configured on a machine, the backend will automatically:
- Detect the lack of credentials.
- Activate the built-in **InMemoryStore** emulator.
- Allow running the full server, REST endpoints, and test suite with 100% functionality.

To use the official Firebase Emulator Suite instead:
```bash
firebase emulators:start --only firestore,auth
```
And set:
```env
FIRESTORE_EMULATOR_HOST=localhost:8080
FIREBASE_AUTH_EMULATOR_HOST=localhost:9099
```
