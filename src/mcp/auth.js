const { verifySessionToken, generateSessionToken } = require('../utils/security');
const { getAuth } = require('../config/firebase');
const { COLLECTIONS, getCollection } = require('../services/db/firestore.service');
const ApiError = require('../utils/apiError');
const logger = require('../utils/logger');
const { ROLES } = require('../constants/roles');

/**
 * Resolves and verifies candidate or recruiter identity from a cryptographic bearer or session token.
 * Never trusts client-supplied IDs. Identity is derived strictly from verified cryptographic tokens.
 *
 * @param {string} rawToken - Cryptographic session token or Bearer string
 * @returns {Promise<Object>} Verified user record { uid, email, role, candidateProfile }
 */
async function resolveUserFromToken(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') {
    throw ApiError.unauthorized('MCP Authentication required: Token is missing or invalid');
  }

  const token = rawToken.startsWith('Bearer ') ? rawToken.slice(7).trim() : rawToken.trim();
  if (!token) {
    throw ApiError.unauthorized('MCP Authentication required: Empty token');
  }

  let decoded;
  // 1. Try verifying as local HMAC-SHA256 session token
  try {
    decoded = verifySessionToken(token);
  } catch (jwtErr) {
    // 2. Fallback to Firebase ID Token verification
    try {
      decoded = await getAuth().verifyIdToken(token);
    } catch (fbErr) {
      logger.warn(`MCP Token authentication rejected: ${fbErr.message}`);
      throw ApiError.unauthorized(`MCP Token verification failed: ${jwtErr.message || fbErr.message}`);
    }
  }

  if (!decoded || !decoded.uid) {
    throw ApiError.unauthorized('MCP Token verification failed: Missing user identity payload');
  }

  const uid = decoded.uid;

  // 3. Retrieve verified user record from Firestore
  const userDocRef = getCollection(COLLECTIONS.USERS).doc(uid);
  const userDocSnap = await userDocRef.get();

  if (!userDocSnap.exists) {
    return {
      uid,
      email: decoded.email || '',
      role: decoded.role || ROLES.CANDIDATE,
      candidateProfile: {}
    };
  }

  const userData = userDocSnap.data();
  return {
    uid,
    email: userData.email || decoded.email || '',
    role: userData.role || decoded.role || ROLES.CANDIDATE,
    candidateProfile: userData.candidateProfile || {},
    displayName: userData.displayName || decoded.name || ''
  };
}

/**
 * Generates an MCP session token for an authenticated user context
 */
function createMcpAuthToken(user) {
  if (!user || !user.uid) {
    throw new Error('Cannot generate MCP session token without user.uid');
  }
  return generateSessionToken({
    uid: user.uid,
    email: user.email || '',
    role: user.role || ROLES.CANDIDATE
  });
}

/**
 * Enforces multi-tenant ownership for an interview session
 */
function enforceInterviewOwnership(user, interview) {
  if (!interview) {
    throw ApiError.notFound('Interview not found');
  }

  if (user.role === ROLES.CANDIDATE && interview.candidateId !== user.uid) {
    logger.warn(`MCP Security Violation: User ${user.uid} attempted unauthorized access to interview ${interview.id} owned by ${interview.candidateId}`);
    throw ApiError.forbidden('Forbidden: You are not authorized to access or modify this interview session');
  }

  if (user.role === ROLES.RECRUITER && interview.recruiterId !== user.uid) {
    logger.warn(`MCP Security Violation: Recruiter ${user.uid} attempted access to interview ${interview.id} managed by ${interview.recruiterId}`);
    throw ApiError.forbidden('Forbidden: You can only access interviews for job positions you manage');
  }
}

module.exports = {
  resolveUserFromToken,
  createMcpAuthToken,
  enforceInterviewOwnership
};
