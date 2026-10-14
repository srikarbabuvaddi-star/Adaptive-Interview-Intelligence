const crypto = require('crypto');
const env = require('../config/env');

const JWT_SECRET = env.JWT_SECRET || (process.env.NODE_ENV === 'test' ? 'test-jwt-secret-key-32-chars-long' : 'adaptive-interview-intelligence-secure-jwt-secret-2026');
if (process.env.NODE_ENV === 'production' && !env.JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is required in production mode');
}
const TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Secure password hashing using Node.js crypto.scrypt
 */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

/**
 * Verify a plaintext password against a stored hash and salt
 */
function verifyPassword(password, storedHash, salt) {
  try {
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(storedHash, 'hex'));
  } catch (err) {
    return false;
  }
}

/**
 * Base64URL encoding/decoding
 */
function base64UrlEncode(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

/**
 * Generate a cryptographically signed session token (JWT)
 */
function generateSessionToken(payload) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const exp = Date.now() + TOKEN_EXPIRY_MS;
  const fullPayload = { ...payload, exp, iat: Date.now() };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));

  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/**
 * Verify and decode session token
 */
function verifySessionToken(token) {
  if (!token || typeof token !== 'string') {
    throw new Error('Token is missing or not a string');
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid token format');
  }

  const [encodedHeader, encodedPayload, signature] = parts;

  // Verify HMAC signature
  const expectedSignature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  if (signature !== expectedSignature) {
    throw new Error('Token signature verification failed');
  }

  // Parse payload and check expiration
  const payloadStr = base64UrlDecode(encodedPayload);
  const payload = JSON.parse(payloadStr);

  if (payload.exp && Date.now() > payload.exp) {
    throw new Error('Token has expired');
  }

  return payload;
}

module.exports = {
  hashPassword,
  verifyPassword,
  generateSessionToken,
  verifySessionToken
};
