const { getAuth } = require('../config/firebase');
const { COLLECTIONS, getCollection } = require('../services/db/firestore.service');
const ApiError = require('../utils/apiError');
const logger = require('../utils/logger');

/**
 * Middleware to verify Firebase ID Token and attach server-verified user info to req.user
 */
const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw ApiError.unauthorized('Missing or malformed Authorization header. Expected Bearer <token>');
    }

    const token = authHeader.split('Bearer ')[1].trim();
    if (!token) {
      throw ApiError.unauthorized('Authentication token is missing');
    }

    let decodedToken;
    try {
      // 1. First try verifying as server-signed session token
      const { verifySessionToken } = require('../utils/security');
      try {
        decodedToken = verifySessionToken(token);
      } catch (jwtErr) {
        // 2. If not a session JWT, try Firebase Auth ID-token verification
        decodedToken = await getAuth().verifyIdToken(token);
      }
    } catch (err) {
      logger.warn(`Token verification failed: ${err.message}`);
      throw ApiError.unauthorized(`Invalid or expired authentication token: ${err.message}`);
    }

    const uid = decodedToken.uid;
    const email = decodedToken.email || '';

    // Fetch user record from Firestore to determine server-trusted role and profile
    const userDocRef = getCollection(COLLECTIONS.USERS).doc(uid);
    const userDocSnap = await userDocRef.get();

    if (!userDocSnap.exists) {
      // User is authenticated in Firebase Auth, but hasn't created their profile in Firestore yet
      req.user = {
        uid,
        email,
        displayName: decodedToken.name || '',
        role: null,
        isRegistered: false
      };
      return next();
    }

    const userData = userDocSnap.data();

    // Attach validated, server-side user data to request
    req.user = {
      uid,
      email: userData.email || email,
      displayName: userData.displayName || decodedToken.name || '',
      role: userData.role, // Server-verified role
      candidateProfile: userData.candidateProfile || null,
      recruiterProfile: userData.recruiterProfile || null,
      isRegistered: true
    };

    next();
  } catch (error) {
    next(error);
  }
};

const { resolveUserFromToken } = require('../mcp/auth');

module.exports = {
  requireAuth,
  authenticate: requireAuth,
  resolveUserFromToken
};
