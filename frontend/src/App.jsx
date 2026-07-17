import { useState } from 'react';
import Auth from './pages/Auth';
import Dashboard from './pages/Dashboard';
import apiClient from './api/axiosConfig';
import { bridgeEncrypt } from './utils/crypto';

function App() {
  // --- URL PARSING (Detect if this is the Phone View) ---
  const urlParams = new URLSearchParams(window.location.search);
  const mobileRoom = urlParams.get('room');
  const mobileKey = urlParams.get('key');
  const isMobileView = !!(mobileRoom && mobileKey);

  // --- DESKTOP AUTHENTICATION STATE ---
  const [user, setUser] = useState(null);

  // --- MOBILE STATE ---
  const [mobileStatus, setMobileStatus] = useState("Waiting for photo...");

  // ----------------------------------------------------------------
  // 📱 MOBILE VIEW COMPONENT (Only renders if URL has room keys)
  // ----------------------------------------------------------------
  if (isMobileView) {
    const handleMobileUpload = async (e) => {
      const selectedFile = e.target.files[0];
      if (!selectedFile) return;

      try {
        setMobileStatus("🔒 Encrypting on phone...");
        // 1. Encrypt before it ever leaves the phone
        const encryptedBlob = await bridgeEncrypt(selectedFile, mobileKey);
        
        setMobileStatus("🚀 Sending to desktop...");
        const formData = new FormData();
        formData.append("file", new Blob([encryptedBlob]));
        
        // 2. Post to the backend holding pen using centralized client
        await apiClient.post(`/api/bridge/upload/${mobileRoom}`, formData);
        
        setMobileStatus("✅ Sent securely! You can close your phone browser.");
      } catch (err) {
        setMobileStatus("❌ Error: Check connection or HTTPS requirements.");
      }
    };

    return (
      <div style={{ maxWidth: '400px', margin: '40px auto', padding: '20px', textAlign: 'center', fontFamily: 'sans-serif' }}>
        <h2>📱 Secure Phone Bridge</h2>
        <p style={{ color: '#666', fontSize: '14px', marginBottom: '20px' }}>
          Select a photo. It will be encrypted here on your phone before transmission.
        </p>
        <input type="file" accept="image/*" onChange={handleMobileUpload} style={{ marginBottom: '20px' }} />
        <div style={{ padding: '10px', backgroundColor: '#e6f4ea', color: '#137333', borderRadius: '8px' }}>
          {mobileStatus}
        </div>
      </div>
    );
  }

  // ----------------------------------------------------------------
  // 💻 DESKTOP ROUTING
  // ----------------------------------------------------------------
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa', padding: '20px 0' }}>
      {user ? (
        <Dashboard user={user} onLogout={() => setUser(null)} />
      ) : (
        <Auth onSuccessfulLogin={(userData) => setUser(userData)} />
      )}
    </div>
  );
}

export default App;