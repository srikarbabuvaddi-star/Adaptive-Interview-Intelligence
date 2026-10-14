const { COLLECTIONS, getCollection, toTimestamp } = require('./db/firestore.service');
const { getAuth } = require('../config/firebase');
const ApiError = require('../utils/apiError');
const logger = require('../utils/logger');

class UserService {
  /**
   * Registers or syncs a new user with their role and profile in Firestore
   */
  async registerUser({ uid, email, displayName, role, candidateProfile, recruiterProfile }) {
    const usersCol = getCollection(COLLECTIONS.USERS);
    const userDocRef = usersCol.doc(uid);
    const existing = await userDocRef.get();

    if (existing.exists) {
      throw ApiError.conflict('User profile is already registered. Use PATCH /api/users/me to update.');
    }

    const userData = {
      uid,
      email,
      displayName,
      role,
      candidateProfile: role === 'candidate' ? (candidateProfile || { skills: [], experienceYears: 0 }) : null,
      recruiterProfile: role === 'recruiter' ? recruiterProfile : null,
      createdAt: toTimestamp(),
      updatedAt: toTimestamp()
    };

    await userDocRef.set(userData);

    // Optionally set custom claims on Firebase Auth
    try {
      await getAuth().setCustomUserClaims(uid, { role });
    } catch (err) {
      logger.warn(`Could not set custom claim for user ${uid}: ${err.message}`);
    }

    return userData;
  }

  /**
   * Retrieves user profile by UID (sanitizes sensitive credentials)
   */
  async getUserProfile(uid) {
    const userDocSnap = await getCollection(COLLECTIONS.USERS).doc(uid).get();
    if (!userDocSnap.exists) {
      throw ApiError.notFound('User profile not found. Please register first.');
    }
    const data = { ...userDocSnap.data() };
    delete data.passwordHash;
    delete data.passwordSalt;
    return data;
  }

  /**
   * Updates user profile (sanitizes sensitive credentials)
   */
  async updateUserProfile(uid, updateData) {
    const userDocRef = getCollection(COLLECTIONS.USERS).doc(uid);
    const existing = await userDocRef.get();

    if (!existing.exists) {
      throw ApiError.notFound('User profile not found');
    }

    const currentData = existing.data();
    const updates = {
      updatedAt: toTimestamp()
    };

    if (updateData.displayName) {
      updates.displayName = updateData.displayName;
    }

    // Protect against role modification
    if (updateData.role && updateData.role !== currentData.role) {
      throw ApiError.badRequest('Role cannot be changed after initial registration');
    }

    if (currentData.role === 'candidate' && updateData.candidateProfile) {
      updates.candidateProfile = {
        ...currentData.candidateProfile,
        ...updateData.candidateProfile
      };
    }

    if (currentData.role === 'recruiter' && updateData.recruiterProfile) {
      updates.recruiterProfile = {
        ...currentData.recruiterProfile,
        ...updateData.recruiterProfile
      };
    }

    await userDocRef.update(updates);
    const updated = await userDocRef.get();
    const data = { ...updated.data() };
    delete data.passwordHash;
    delete data.passwordSalt;
    return data;
  }
}

module.exports = new UserService();
