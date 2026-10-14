import React, { createContext, useContext, useState, useEffect } from 'react';
import interviewApi from '../services/interviewApi';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [token, setTokenState] = useState(() => interviewApi.getToken());
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const initUser = async currentToken => {
    if (!currentToken) {
      setUser(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      interviewApi.setToken(currentToken);
      const profile = await interviewApi.getCurrentUser();
      if (!profile || profile.isRegistered === false || !profile.role) {
        interviewApi.setToken(null);
        setTokenState('');
        setUser(null);
      } else {
        setUser(profile);
      }
    } catch (err) {
      console.warn('Failed to load user profile with current token:', err.message);
      setError(err.message);
      // If token is invalid/expired/forbidden, clear it
      if (err.status === 401 || err.status === 403) {
        interviewApi.setToken(null);
        setTokenState('');
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    initUser(token);
  }, []);

  const login = async (arg1, arg2) => {
    setLoading(true);
    setError(null);
    try {
      if (typeof arg1 === 'string' && !arg2) {
        // Direct token
        setTokenState(arg1);
        interviewApi.setToken(arg1);
        await initUser(arg1);
      } else {
        // Email + Password credentials
        const credentials = typeof arg1 === 'object' ? arg1 : { email: arg1, password: arg2 };
        const data = await interviewApi.login(credentials);
        setTokenState(data.token);
        interviewApi.setToken(data.token);
        setUser(data.user);
        return data.user;
      }
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signup = async (userData) => {
    setLoading(true);
    setError(null);
    try {
      const data = await interviewApi.signup(userData);
      setTokenState(data.token);
      interviewApi.setToken(data.token);
      setUser(data.user);
      return data.user;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const register = async ({ role, displayName, candidateProfile, recruiterProfile }) => {
    setLoading(true);
    setError(null);
    try {
      const profile = await interviewApi.registerUser({
        role,
        displayName,
        candidateProfile,
        recruiterProfile
      });
      setUser(profile);
      return profile;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    interviewApi.setToken(null);
    setTokenState('');
    setUser(null);
    setError(null);
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        loading,
        error,
        login,
        signup,
        register,
        logout,
        refreshUser: () => initUser(token)
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
