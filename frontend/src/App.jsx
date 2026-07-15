import { useState, useEffect } from 'react';
import axios from 'axios';
import { prepareSecurePayload } from './crypto';

// 1. Dynamic API base URL assignment for production deployment
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

function App() {
  // App Modes: 'protect' or 'verify'
  const [activeTab, setActiveTab] = useState('protect');
  
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState("Initializing Quantum Session...");
  
  // Protect Mode State
  const [metadata, setMetadata] = useState(null);
  
  // Verification Mode State
  const [verifyResult, setVerifyResult] = useState(null);

  const fetchNewSession = () => {
    setSession(null);
    // 2. Updated to use dynamic URL variable
    axios.get(`${API_BASE_URL}/api/handshake`)
      .then(res => {
        setSession(res.data);
        if (activeTab === 'protect') {
          setStatus(`✅ Secure Session Active (ID: ${res.data.session_id.substring(0, 8)}...)`);
        }
      })
      .catch(() => setStatus("❌ Cannot reach backend. Is FastAPI running?"));
  };

  useEffect(() => {
    fetchNewSession();
  }, []);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setPreview(URL.createObjectURL(selectedFile));
      setMetadata(null); 
      setVerifyResult(null);
    }
  };

  // --- HELPER: Reset UI while keeping Session/Keys ---
  const resetUI = () => {
    setFile(null);
    setPreview(null);
  };

  // --- PROTECT MODE HANDLER (Kyber + AES Tunnel) ---
  const handleUpload = async () => {
    if (!file || !session) return;
    setStatus("🔒 Encapsulating & Encrypting...");
    setMetadata(null);

    try {
      // 1. Prepare Secure Payload
      const { formData, aesKey } = await prepareSecurePayload(file, session.public_key);
      formData.append("session_id", session.session_id);

      setStatus("🚀 Transmitting securely to server...");

      // 2. Updated to use dynamic URL variable
      const res = await axios.post(`${API_BASE_URL}/api/v1/sanitize`, formData, {
        responseType: 'arraybuffer' 
      });

      setStatus("🔓 Decrypting server response locally...");

      // 3. Decrypt the return payload
      const responseBytes = new Uint8Array(res.data);
      const returnIv = responseBytes.slice(0, 12);
      const returnCiphertext = responseBytes.slice(12);

      const decryptedBuffer = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: returnIv },
        aesKey,
        returnCiphertext
      );

      // 4. Decode JSON Wrapper
      const decoder = new TextDecoder("utf-8");
      const jsonString = decoder.decode(decryptedBuffer);
      const responseData = JSON.parse(jsonString);

      // 5. Display the metadata extracted from original image
      setMetadata(responseData.metadata);

      // 6. Convert the cleaned Base64 image back into a file
      const byteCharacters = atob(responseData.image_b64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'image/png' });

      // 7. Download
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "pqc_sanitized_signed.png");
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      setStatus(`✅ Complete! Image downloaded. (Session: ${session.session_id.substring(0, 8)})`);
      
      // Auto-reset UI for next task
      resetUI();
      
    } catch (error) {
      console.error("Decryption Error:", error);
      setStatus("❌ Cryptographic Error. Check console.");
      resetUI();
    }
  };

  // --- VERIFY MODE HANDLER (Self-Contained Unencrypted POST) ---
  const handleVerify = async () => {
    if (!file) return;
    setStatus("🔍 Extracting Embedded Key & Signature...");
    setVerifyResult(null);
    
    const formData = new FormData();
    formData.append("file", file);

    try {
      // 3. Updated to use dynamic URL variable
      const res = await axios.post(`${API_BASE_URL}/api/v1/verify`, formData);
      setVerifyResult(res.data);
      setStatus("✅ Verification complete.");
      resetUI(); // Auto-reset UI after verification
    } catch (error) {
      setStatus("❌ Failed to reach verification server.");
      resetUI();
    }
  };

  // UI Helpers
  const switchTab = (tab) => {
    setActiveTab(tab);
    setFile(null);
    setPreview(null);
    setMetadata(null);
    setVerifyResult(null);
    if (tab === 'protect') {
      setStatus(session ? `✅ Secure Session Active (ID: ${session.session_id.substring(0, 8)}...)` : "Initializing Quantum Session...");
    } else {
      setStatus("Ready to verify a signed image.");
    }
  };

  const btnStyle = (disabled) => ({
    display: 'block', width: '100%', margin: '20px auto 0 auto', padding: '14px 28px', 
    cursor: disabled ? 'not-allowed' : 'pointer',
    backgroundColor: disabled ? '#e0e0e0' : '#1a73e8',
    color: disabled ? '#9aa0a6' : 'white',
    border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: '600', transition: 'background-color 0.2s'
  });

  return (
    <div style={{ maxWidth: '650px', margin: '40px auto', padding: '0 20px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: '#333' }}>
      
      <header style={{ textAlign: 'center', marginBottom: '30px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: '700', margin: '0 0 10px 0', color: '#1a1a1a' }}>PQC Privacy Guard 🛡️</h1>
        
        {/* Tab Navigation */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginBottom: '20px' }}>
          <button 
            onClick={() => switchTab('protect')}
            style={{
              padding: '8px 16px', borderRadius: '20px', border: 'none', cursor: 'pointer', fontWeight: '600',
              backgroundColor: activeTab === 'protect' ? '#1a73e8' : '#f1f3f4',
              color: activeTab === 'protect' ? 'white' : '#5f6368'
            }}
          >
            Protect Image
          </button>
          <button 
            onClick={() => switchTab('verify')}
            style={{
              padding: '8px 16px', borderRadius: '20px', border: 'none', cursor: 'pointer', fontWeight: '600',
              backgroundColor: activeTab === 'verify' ? '#1a73e8' : '#f1f3f4',
              color: activeTab === 'verify' ? 'white' : '#5f6368'
            }}
          >
            Verify Signature
          </button>
        </div>

        <div style={{ 
          display: 'inline-block', padding: '6px 14px', borderRadius: '20px', fontSize: '13px', fontWeight: '500', 
          backgroundColor: session || activeTab === 'verify' ? '#e6f4ea' : '#fce8e6', 
          color: session || activeTab === 'verify' ? '#137333' : '#c5221f' 
        }}>
          {status}
        </div>
      </header>
      
      <div style={{ backgroundColor: '#ffffff', border: '1px solid #e0e0e0', borderRadius: '12px', padding: '32px', boxShadow: '0 4px 6px rgba(0,0,0,0.02)', textAlign: 'center' }}>
        <h2 style={{ fontSize: '18px', marginTop: 0, marginBottom: '20px', color: '#1a1a1a' }}>
          {activeTab === 'protect' ? 'Upload an image to sanitize and sign' : 'Upload a signed image to verify'}
        </h2>
        
        <input type="file" onChange={handleFileChange} accept="image/*" style={{ marginBottom: '20px', fontSize: '14px' }} />
        
        {preview && (
          <div style={{ margin: '20px 0', border: '1px solid #f0f0f0', borderRadius: '8px', padding: '8px', backgroundColor: '#fafafa' }}>
            <img src={preview} alt="Preview" style={{ maxWidth: '100%', maxHeight: '220px', borderRadius: '6px', objectFit: 'contain' }} />
          </div>
        )}

        {activeTab === 'protect' ? (
          <button onClick={handleUpload} disabled={!file || !session} style={btnStyle(!file || !session)}>
            Sanitize & Sign via PQC
          </button>
        ) : (
          <button onClick={handleVerify} disabled={!file} style={btnStyle(!file)}>
            Verify Digital Signature
          </button>
        )}
      </div>

      {activeTab === 'verify' && verifyResult && (
        <div style={{ 
          marginTop: '30px', padding: '20px', borderRadius: '8px', 
          backgroundColor: verifyResult.verified ? '#e6f4ea' : '#fce8e6',
          border: `1px solid ${verifyResult.verified ? '#ceead6' : '#fad2cf'}`,
          textAlign: 'center'
        }}>
          <h3 style={{ margin: '0 0 10px 0', color: verifyResult.verified ? '#137333' : '#c5221f' }}>
            {verifyResult.verified ? 'Signature Valid' : 'Verification Failed'}
          </h3>
          <p style={{ margin: 0, fontSize: '14px', color: '#333' }}>{verifyResult.message}</p>
        </div>
      )}

      {activeTab === 'protect' && metadata && (
        <div style={{ marginTop: '30px', animation: 'fadeIn 0.3s ease' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '12px', color: '#1a1a1a' }}>
            🔍 Original Image Metadata Analysis
          </h3>
          <div style={{ border: '1px solid #e0e0e0', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#ffffff' }}>
            {Object.keys(metadata).length === 1 && (metadata.Status || metadata.Info) ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#666', fontSize: '14px', backgroundColor: '#fafafa' }}>
                ℹ️ {metadata.Status || metadata.Info}
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '1px solid #e0e0e0' }}>
                    <th style={{ padding: '12px 16px', fontWeight: '600', color: '#5f6368', width: '35%' }}>Metadata Tag</th>
                    <th style={{ padding: '12px 16px', fontWeight: '600', color: '#5f6368' }}>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(metadata).map(([key, val], index) => (
                    <tr key={key} style={{ 
                      borderBottom: index < Object.keys(metadata).length - 1 ? '1px solid #f1f3f4' : 'none',
                      backgroundColor: index % 2 === 0 ? '#ffffff' : '#fafafa'
                    }}>
                      <td style={{ padding: '12px 16px', fontWeight: '500', color: '#202124' }}>{key}</td>
                      <td style={{ padding: '12px 16px', color: '#4a4a4a', wordBreak: 'break-word', fontFamily: 'monospace' }}>{val}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;