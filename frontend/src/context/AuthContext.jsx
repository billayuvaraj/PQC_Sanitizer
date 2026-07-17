import { createContext, useState, useEffect, useContext } from 'react';
import apiClient from '../api/axiosConfig';

// 1. Create the Context
const AuthContext = createContext();

// 2. Create the Provider Component
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // The core function to establish a secure tunnel with the FastAPI backend
  const refreshSession = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Utilizing the centralized apiClient you built
      const response = await apiClient.get('/api/handshake');
      setSession(response.data);
    } catch (err) {
      console.error("Failed to establish quantum session:", err);
      setError("❌ Cannot reach backend. Is FastAPI running?");
      setSession(null);
    } finally {
      setIsLoading(false);
    }
  };

  // Automatically request a handshake when the application first loads
  useEffect(() => {
    refreshSession();
  }, []);

  return (
    <AuthContext.Provider value={{ session, isLoading, error, refreshSession }}>
      {children}
    </AuthContext.Provider>
  );
}

// 3. Create a Custom Hook for easy consumption
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};