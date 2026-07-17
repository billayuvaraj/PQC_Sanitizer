import { useState } from 'react';
import apiClient from '../api/axiosConfig';

export default function Auth({ onSuccessfulLogin }) {
  const [isLoginView, setIsLoginView] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  const [formData, setFormData] = useState({ email: '', username: '', password: '' });
  const [status, setStatus] = useState({ type: '', message: '' });

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const toggleView = () => {
    setIsLoginView(!isLoginView);
    setStatus({ type: '', message: '' });
    setFormData({ email: '', username: '', password: '' });
    setShowPassword(false);
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Check required fields based on the view
    if (!formData.email || !formData.password || (!isLoginView && !formData.username)) {
      setStatus({ type: 'error', message: 'Please fill in all fields.' });
      return;
    }

    setIsLoading(true);
    setStatus({ type: '', message: '' });

    try {
      const endpoint = isLoginView ? '/api/users/login' : '/api/users/register';
      
      // Login only sends email & password. Registration sends all three.
      const payload = isLoginView 
        ? { email: formData.email, password: formData.password }
        : formData;

      const response = await apiClient.post(endpoint, payload);
      
      setStatus({ 
        type: 'success', 
        message: isLoginView ? '✅ Login successful!' : '✅ Account created! You can now log in.' 
      });

      if (isLoginView && onSuccessfulLogin) {
        // response.data contains the username fetched by the backend
        setTimeout(() => onSuccessfulLogin(response.data), 1000);
      } else if (!isLoginView) {
        setTimeout(() => setIsLoginView(true), 1500);
      }
      
    } catch (error) {
      const errorMsg = error.response?.data?.detail || 'Authentication failed. Check your connection.';
      setStatus({ type: 'error', message: `❌ ${errorMsg}` });
    } finally {
      setIsLoading(false);
    }
  };

  const styles = {
    container: { maxWidth: '400px', margin: '80px auto', padding: '32px', backgroundColor: '#ffffff', border: '1px solid #e0e0e0', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.02)', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
    mainTitle: { fontSize: '28px', fontWeight: '700', margin: '0 0 8px 0', color: '#1a1a1a', textAlign: 'center' },
    header: { textAlign: 'center', marginBottom: '24px', color: '#5f6368', margin: '0 0 24px 0', fontSize: '18px', fontWeight: '500' },
    input: { width: '100%', padding: '12px', margin: '8px 0 20px 0', borderRadius: '8px', border: '1px solid #dcdcdc', fontSize: '15px', boxSizing: 'border-box' },
    passwordInput: { width: '100%', padding: '12px 45px 12px 12px', margin: '8px 0 20px 0', borderRadius: '8px', border: '1px solid #dcdcdc', fontSize: '15px', boxSizing: 'border-box' },
    inputWrapper: { position: 'relative', width: '100%' },
    eyeIcon: { position: 'absolute', right: '12px', top: '22px', background: 'none', border: 'none', cursor: 'pointer', color: '#5f6368', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0' },
    button: { width: '100%', padding: '14px', backgroundColor: '#1a73e8', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: '600', cursor: isLoading ? 'not-allowed' : 'pointer', opacity: isLoading ? 0.7 : 1 },
    toggleText: { textAlign: 'center', marginTop: '20px', fontSize: '14px', color: '#5f6368' },
    toggleLink: { color: '#1a73e8', cursor: 'pointer', fontWeight: '600', textDecoration: 'none' },
    statusBox: { padding: '10px', borderRadius: '8px', marginBottom: '20px', fontSize: '14px', textAlign: 'center', backgroundColor: status.type === 'error' ? '#fce8e6' : '#e6f4ea', color: status.type === 'error' ? '#c5221f' : '#137333' }
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.mainTitle}>PQC Privacy Guard 🛡️</h1>
      <h2 style={styles.header}>
        {isLoginView ? 'Welcome Back' : 'Create an Account'}
      </h2>
      
      {status.message && (
        <div style={styles.statusBox}>
          {status.message}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        
        {/* Email is shown in BOTH views */}
        <label style={{ fontSize: '14px', fontWeight: '500', color: '#333' }}>Email Address</label>
        <input 
          type="email" 
          name="email" 
          value={formData.email} 
          onChange={handleInputChange} 
          style={styles.input} 
          placeholder="Enter your email"
          disabled={isLoading}
        />

        {/* Username is shown ONLY during Registration */}
        {!isLoginView && (
          <>
            <label style={{ fontSize: '14px', fontWeight: '500', color: '#333' }}>Username</label>
            <input 
              type="text" 
              name="username" 
              value={formData.username} 
              onChange={handleInputChange} 
              style={styles.input} 
              placeholder="Choose a display name"
              disabled={isLoading}
            />
          </>
        )}

        {/* Password is shown in BOTH views */}
        <label style={{ fontSize: '14px', fontWeight: '500', color: '#333' }}>Password</label>
        <div style={styles.inputWrapper}>
          <input 
            type={showPassword ? "text" : "password"} 
            name="password" 
            value={formData.password} 
            onChange={handleInputChange} 
            style={styles.passwordInput} 
            placeholder="••••••••"
            disabled={isLoading}
          />
          <button 
            type="button" 
            onClick={togglePasswordVisibility} 
            style={styles.eyeIcon}
            tabIndex="-1"
          >
            {showPassword ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
            )}
          </button>
        </div>

        <button type="submit" style={styles.button} disabled={isLoading}>
          {isLoading ? 'Processing...' : (isLoginView ? 'Sign In' : 'Register')}
        </button>
      </form>

      <div style={styles.toggleText}>
        {isLoginView ? "Don't have an account? " : "Already have an account? "}
        <span style={styles.toggleLink} onClick={toggleView}>
          {isLoginView ? 'Register here' : 'Sign in here'}
        </span>
      </div>
    </div>
  );
}