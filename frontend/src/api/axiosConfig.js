import axios from 'axios';

// Create a centralized network client
const apiClient = axios.create({
  // Vite dynamically injects the correct URL based on your .env files.
  // It falls back to localhost to prevent crashes if the variable is missing.
  baseURL: import.meta.env.VITE_API_URL || 'https://pqcsanitizer-production.up.railway.app',
  
  // Set default headers that apply to all requests
  headers: {
    'Accept': 'application/json, application/octet-stream',
  },
});

// Response Interceptor: A global catch-all for incoming server responses
apiClient.interceptors.response.use(
  (response) => {
    // Passes successful responses (200-299) directly through to the component
    return response;
  },
  (error) => {
    // Catch global errors (like your 403 Session Expired) before they hit the component
    if (error.response) {
      if (error.response.status === 403) {
        console.warn("🔒 PQC Session expired. A new handshake is required.");
      } else if (error.response.status === 500) {
        console.error("❌ Backend server encountered a fatal error.");
      }
    } else {
      console.error("❌ Network Error: Cannot reach the backend. Is FastAPI running?");
    }
    
    // Reject the promise so the specific component's try/catch block still fires
    return Promise.reject(error);
  }
);

export default apiClient;