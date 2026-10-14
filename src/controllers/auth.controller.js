const userService = require('../services/user.service');
const ApiResponse = require('../utils/apiResponse');
const ApiError = require('../utils/apiError');
const { COLLECTIONS, getCollection, toTimestamp } = require('../services/db/firestore.service');
const { ROLES } = require('../constants/roles');
const { hashPassword, verifyPassword, generateSessionToken } = require('../utils/security');
const { v4: uuidv4 } = require('uuid');

class AuthController {
  /**
   * Real user signup with email, password, and profile
   */
  async signup(req, res, next) {
    try {
      const { email, password, displayName, role = ROLES.CANDIDATE, candidateProfile, recruiterProfile } = req.body;

      if (!email || !email.includes('@')) {
        throw ApiError.badRequest('Valid email address is required');
      }

      if (!password || password.length < 6) {
        throw ApiError.badRequest('Password must be at least 6 characters');
      }

      if (!displayName || displayName.trim().length < 2) {
        throw ApiError.badRequest('Display name must be at least 2 characters');
      }

      const normalizedEmail = email.toLowerCase().trim();

      // Check if email already registered in Firestore
      const existingQuery = await getCollection(COLLECTIONS.USERS)
        .where('email', '==', normalizedEmail)
        .get();

      if (!existingQuery.empty) {
        throw ApiError.conflict('An account with this email address already exists');
      }

      // Hash password securely with salt
      const { hash, salt } = hashPassword(password);
      const uid = 'usr_' + uuidv4().replace(/-/g, '').slice(0, 16);

      const userDocRef = getCollection(COLLECTIONS.USERS).doc(uid);
      const userRecord = {
        id: uid,
        uid,
        email: normalizedEmail,
        displayName: displayName.trim(),
        role: role === ROLES.RECRUITER ? ROLES.RECRUITER : ROLES.CANDIDATE,
        passwordHash: hash,
        passwordSalt: salt,
        candidateProfile: role === ROLES.CANDIDATE ? candidateProfile || { skills: [] } : null,
        recruiterProfile: role === ROLES.RECRUITER ? recruiterProfile || { companyName: 'Company' } : null,
        createdAt: toTimestamp(),
        updatedAt: toTimestamp()
      };

      await userDocRef.set(userRecord);

      // Generate signed session token
      const token = generateSessionToken({
        uid,
        email: normalizedEmail,
        role: userRecord.role,
        name: userRecord.displayName
      });

      const cleanUser = {
        uid,
        email: normalizedEmail,
        displayName: userRecord.displayName,
        role: userRecord.role,
        candidateProfile: userRecord.candidateProfile,
        recruiterProfile: userRecord.recruiterProfile
      };

      return ApiResponse.created(res, { token, user: cleanUser }, 'Account created successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Real user login with email and password
   */
  async login(req, res, next) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        throw ApiError.badRequest('Email and password are required');
      }

      const normalizedEmail = email.toLowerCase().trim();

      const userQuery = await getCollection(COLLECTIONS.USERS)
        .where('email', '==', normalizedEmail)
        .get();

      if (userQuery.empty) {
        throw ApiError.unauthorized('Invalid email or password');
      }

      const userDoc = userQuery.docs[0];
      const userData = userDoc.data();

      if (!userData.passwordHash || !userData.passwordSalt) {
        throw ApiError.unauthorized('Please log in using your configured identity provider');
      }

      const isValid = verifyPassword(password, userData.passwordHash, userData.passwordSalt);
      if (!isValid) {
        throw ApiError.unauthorized('Invalid email or password');
      }

      const uid = userData.uid || userDoc.id;
      const token = generateSessionToken({
        uid,
        email: userData.email,
        role: userData.role,
        name: userData.displayName
      });

      const cleanUser = {
        uid,
        email: userData.email,
        displayName: userData.displayName,
        role: userData.role,
        candidateProfile: userData.candidateProfile,
        recruiterProfile: userData.recruiterProfile
      };

      return ApiResponse.success(res, { token, user: cleanUser }, 'Logged in successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Complete registration / sync user profile after Firebase client signup
   */
  async register(req, res, next) {
    try {
      const { role, displayName, candidateProfile, recruiterProfile } = req.body;
      const user = await userService.registerUser({
        uid: req.user.uid,
        email: req.user.email,
        displayName,
        role,
        candidateProfile,
        recruiterProfile
      });
      return ApiResponse.created(res, user, 'User registered successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get current authenticated user profile
   */
  async getMe(req, res, next) {
    try {
      if (!req.user.isRegistered) {
        return ApiResponse.success(res, {
          uid: req.user.uid,
          email: req.user.email,
          isRegistered: false,
          role: null
        }, 'User authenticated but profile not yet registered');
      }

      const profile = await userService.getUserProfile(req.user.uid);
      return ApiResponse.success(res, profile, 'Profile retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update profile for current user
   */
  async updateMe(req, res, next) {
    try {
      const updated = await userService.updateUserProfile(req.user.uid, req.body);
      return ApiResponse.success(res, updated, 'Profile updated successfully');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AuthController();
