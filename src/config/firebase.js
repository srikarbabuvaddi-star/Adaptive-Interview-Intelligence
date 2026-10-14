const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const env = require('./env');
const logger = require('../utils/logger');
const InMemoryStore = require('./inMemoryStore');

let isInitialized = false;
let db = null;
let auth = null;
let usingMock = false;

function initFirebase() {
  if (isInitialized) {
    return { db, auth, admin, usingMock };
  }

  // Check if we should use mock (e.g. test mode or no credentials)
  const hasServiceAccountFile =
    env.FIREBASE_SERVICE_ACCOUNT_PATH &&
    fs.existsSync(path.resolve(process.cwd(), env.FIREBASE_SERVICE_ACCOUNT_PATH));

  const hasEnvCredentials =
    env.FIREBASE_PROJECT_ID &&
    env.FIREBASE_CLIENT_EMAIL &&
    env.FIREBASE_PRIVATE_KEY;

  const hasEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

  if (!hasServiceAccountFile && !hasEnvCredentials && !hasEmulator) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'FATAL: Real Firebase database credentials are required in production. Please set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY or FIREBASE_SERVICE_ACCOUNT_PATH in .env'
      );
    }
    logger.warn('No Firebase credentials or emulator found. Initializing in-memory Firestore & Auth provider for local test suite execution.');
    usingMock = true;
    const store = new InMemoryStore();
    db = store.getFirestore();
    auth = store.getAuth();
    isInitialized = true;
    return { db, auth, admin: null, usingMock };
  }

  try {
    let credential;

    if (hasServiceAccountFile) {
      const saPath = path.resolve(process.cwd(), env.FIREBASE_SERVICE_ACCOUNT_PATH);
      const serviceAccount = JSON.parse(fs.readFileSync(saPath, 'utf8'));
      credential = admin.credential.cert(serviceAccount);
      logger.info(`Firebase initialized using service account file at ${saPath}`);
    } else if (hasEnvCredentials) {
      credential = admin.credential.cert({
        projectId: env.FIREBASE_PROJECT_ID,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        privateKey: env.FIREBASE_PRIVATE_KEY
      });
      logger.info(`Firebase initialized using environment credentials for project ${env.FIREBASE_PROJECT_ID}`);
    } else {
      credential = admin.credential.applicationDefault();
      logger.info('Firebase initialized using default credentials / emulator');
    }

    if (!admin.apps.length) {
      admin.initializeApp({
        credential,
        projectId: env.FIREBASE_PROJECT_ID || undefined
      });
    }

    db = admin.firestore();
    auth = admin.auth();
    isInitialized = true;
    usingMock = false;
  } catch (err) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`FATAL: Failed to connect to real Firebase database in production: ${err.message}`);
    }
    logger.error(`Failed to initialize Firebase Admin: ${err.message}. Falling back to in-memory store for local testing.`);
    usingMock = true;
    const store = new InMemoryStore();
    db = store.getFirestore();
    auth = store.getAuth();
    isInitialized = true;
  }

  return { db, auth, admin, usingMock };
}

module.exports = {
  initFirebase,
  getDb: () => {
    if (!isInitialized) initFirebase();
    return db;
  },
  getAuth: () => {
    if (!isInitialized) initFirebase();
    return auth;
  },
  isUsingMock: () => usingMock
};
