import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import QRCode from 'react-qr-code';
import { prepareSecurePayload, generateBridgeCredentials, bridgeEncrypt, bridgeDecrypt } from './crypto';

function App() {
  // --- URL PARSING (Detect if this is the Phone View) ---
  const urlParams = new URLSearchParams(window.location.search);
  const mobileRoom = urlParams.get('room');
  const mobileKey = urlParams.get('key');
  const isMobileView = !!(mobileRoom && mobileKey);

  // --- DESKTOP STATE ---
  const [activeTab, setActiveTab] = useState('protect');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState("Initializing Quantum Session...");
  const [metadata, setMetadata] = useState(null);
  const [verifyResult, setVerifyResult] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Mobile Bridge State
  const [showQR, setShowQR] = useState(false);
  const [qrUrl, setQrUrl] = useState("");
  const isPolling = useRef(false);

  // --- MOBILE STATE ---
  const [mobileStatus, setMobileStatus] = useState("Waiting for photo...");

  const fileInputRef = useRef(null);

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
        
        // 2. Post to the backend holding pen
        const backendUrl = window.location.origin.replace(window.location.port, '8000');
        await axios.post(`${backendUrl}/api/bridge/upload/${mobileRoom}`, formData);
        
        setMobileStatus("✅ Sent securely! You can close your phone browser.");
      } catch (err) {
        setMobileStatus("❌ Error: Are you accessing via HTTPS?");
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
  // 💻 DESKTOP VIEW COMPONENT
  // ----------------------------------------------------------------

  const fetchNewSession = () => {
    setSession(null);
    axios.get("http://localhost:8000/api/handshake")
      .then(res => {
        setSession(res.data);
        if (activeTab === 'protect') setStatus(`✅ Secure Quantum Tunnel Established`);
      })
      .catch(() => setStatus("❌ Cannot reach backend. Is FastAPI running?"));
  };

  useEffect(() => {
    fetchNewSession();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => { if (preview) URL.revokeObjectURL(preview); };
  }, [preview]);

  // --- MOBILE BRIDGE LOGIC (Desktop) ---
  const openMobileBridge = async () => {
    const { room, keyHex } = await generateBridgeCredentials();
    
    // Create URL. Note: For a phone to scan this locally, you need your computer's local IP (e.g., 192.168.x.x)
    const mobileLink = `${window.location.origin}/?room=${room}&key=${keyHex}`;
    setQrUrl(mobileLink);
    setShowQR(true);
    isPolling.current = true;
    
    setStatus("⏳ Waiting for phone upload...");
    pollBackendForImage(room, keyHex);
  };

  const pollBackendForImage = async (room, keyHex) => {
    if (!isPolling.current) return;

    try {
      const res = await axios.get(`http://localhost:8000/api/bridge/download/${room}`, { responseType: 'arraybuffer' });
      
      // We got the file!
      isPolling.current = false;
      setShowQR(false);
      setStatus("🔓 Decrypting image from phone...");
      
      const decryptedFile = await bridgeDecrypt(res.data, keyHex);
      setFile(decryptedFile);
      setPreview(URL.createObjectURL(decryptedFile));
      setStatus("✅ Phone image received securely. Ready to Sanitize.");
      
    } catch (error) {
      if (error.response && error.response.status === 404 && isPolling.current) {
        // File not there yet, check again in 2 seconds
        setTimeout(() => pollBackendForImage(room, keyHex), 2000);
      } else {
        isPolling.current = false;
        setShowQR(false);
        setStatus("❌ Bridge connection failed.");
      }
    }
  };

  const cancelBridge = () => {
    isPolling.current = false;
    setShowQR(false);
    setStatus(`✅ Secure Quantum Tunnel Established`);
  };

  // --- EXISTING DESKTOP LOGIC ---
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setPreview(URL.createObjectURL(selectedFile));
      setMetadata(null); 
      setVerifyResult(null);
    }
  };

  const handleUpload = async () => {
    if (!file || !session) return;
    setIsProcessing(true);
    setStatus("🔒 Encapsulating & Encrypting...");
    setMetadata(null);

    try {
      const { formData, aesKey } = await prepareSecurePayload(file, session.public_key);
      formData.append("session_id", session.session_id);

      setStatus("🚀 Transmitting securely to server...");
      const res = await axios.post("http://localhost:8000/api/v1/sanitize", formData, { responseType: 'arraybuffer' });

      setStatus("🔓 Decrypting server response locally...");
      const responseBytes = new Uint8Array(res.data);
      const returnIv = responseBytes.slice(0, 12);
      const returnCiphertext = responseBytes.slice(12);

      const decryptedBuffer = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv: returnIv }, aesKey, returnCiphertext);

      const jsonString = new TextDecoder("utf-8").decode(decryptedBuffer);
      const responseData = JSON.parse(jsonString);

      setMetadata(responseData.metadata);

      const base64Response = await fetch(`data:image/png;base64,${responseData.image_b64}`);
      const blob = await base64Response.blob();

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "pqc_sanitized_signed.png");
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => window.URL.revokeObjectURL(url), 1000);
      
      setStatus(`✅ Complete! Image downloaded.`);
      
    } catch (error) {
      if (error.response && error.response.status === 403) {
        setStatus("⚠️ Session expired. Requesting a new secure tunnel...");
        fetchNewSession();
      } else {
        setStatus("❌ Cryptographic Error. Check console.");
      }
    } finally {
      setIsProcessing(false);
      setFile(null);
      setPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleVerify = async () => {
    if (!file) return;
    setIsProcessing(true);
    setStatus("🔍 Extracting Embedded Key & Signature...");
    setVerifyResult(null);
    
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await axios.post("http://localhost:8000/api/v1/verify", formData);
      setVerifyResult(res.data);
      setStatus("✅ Verification complete.");
    } catch (error) {
      setStatus("❌ Failed to reach verification server.");
    } finally {
      setIsProcessing(false);
    }
  };

  const switchTab = (tab) => {
    if (isProcessing) return;
    setActiveTab(tab);
    setFile(null);
    setPreview(null);
    setMetadata(null);
    setVerifyResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (tab === 'protect') setStatus(session ? `✅ Secure Quantum Tunnel Established` : "Initializing Quantum Session...");
    else setStatus("Ready to verify a signed image.");
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
        <h1 style={{ fontSize: '28px', fontWeight: '700', margin: '0 0 10px 0', color: '#fbfbfb' }}>PQC Privacy Guard 🛡️</h1>
        
        <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginBottom: '20px' }}>
          <button onClick={() => switchTab('protect')} disabled={isProcessing} style={{ padding: '8px 16px', borderRadius: '20px', border: 'none', cursor: isProcessing ? 'not-allowed' : 'pointer', fontWeight: '600', backgroundColor: activeTab === 'protect' ? '#1a73e8' : '#f1f3f4', color: activeTab === 'protect' ? 'white' : '#5f6368', opacity: isProcessing && activeTab !== 'protect' ? 0.5 : 1 }}> Protect Image </button>
          <button onClick={() => switchTab('verify')} disabled={isProcessing} style={{ padding: '8px 16px', borderRadius: '20px', border: 'none', cursor: isProcessing ? 'not-allowed' : 'pointer', fontWeight: '600', backgroundColor: activeTab === 'verify' ? '#1a73e8' : '#f1f3f4', color: activeTab === 'verify' ? 'white' : '#5f6368', opacity: isProcessing && activeTab !== 'verify' ? 0.5 : 1 }}> Verify Signature </button>
        </div>

        <div style={{ display: 'inline-block', padding: '6px 14px', borderRadius: '20px', fontSize: '13px', fontWeight: '500', backgroundColor: session || activeTab === 'verify' ? '#e6f4ea' : '#fce8e6', color: session || activeTab === 'verify' ? '#137333' : '#c5221f' }}>
          {status}
        </div>
      </header>
      
      <div style={{ backgroundColor: '#ffffff', border: '1px solid #e0e0e0', borderRadius: '12px', padding: '32px', boxShadow: '0 4px 6px rgba(0,0,0,0.02)', textAlign: 'center' }}>
        
        {/* QR CODE MODAL OVERLAY */}
        {showQR && (
          <div style={{ padding: '20px', border: '2px dashed #1a73e8', borderRadius: '12px', marginBottom: '20px', backgroundColor: '#f8fbff' }}>
            <h3 style={{ margin: '0 0 15px 0' }}>Scan with Phone Camera</h3>
            <div style={{ background: 'white', padding: '10px', display: 'inline-block', borderRadius: '8px' }}>
              <QRCode value={qrUrl} size={150} />
            </div>
            <p style={{ fontSize: '12px', color: '#666' }}>Waiting for secure E2EE transfer...</p>
            <button onClick={cancelBridge} style={{ padding: '6px 12px', border: 'none', background: '#fce8e6', color: '#c5221f', borderRadius: '6px', cursor: 'pointer' }}>Cancel</button>
          </div>
        )}

        <h2 style={{ fontSize: '18px', marginTop: 0, marginBottom: '20px', color: '#1a1a1a' }}>
          {activeTab === 'protect' ? 'Upload an image to sanitize and sign' : 'Upload a signed image to verify'}
        </h2>
        
        <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" disabled={isProcessing || showQR} style={{ marginBottom: '10px', fontSize: '14px' }} />
        
        {/* NEW BUTTON: Trigger Mobile Bridge */}
        {activeTab === 'protect' && !showQR && !file && (
           <div style={{ marginTop: '10px' }}>
             <span style={{ fontSize: '14px', color: '#666' }}>— or —</span><br/>
             <button onClick={openMobileBridge} style={{ marginTop: '10px', padding: '8px 16px', backgroundColor: 'white', border: '1px solid #1a73e8', color: '#1a73e8', borderRadius: '20px', cursor: 'pointer', fontWeight: '600' }}>
               📱 Upload straight from Phone
             </button>
           </div>
        )}
        
        {preview && (
          <div style={{ margin: '20px 0', border: '1px solid #f0f0f0', borderRadius: '8px', padding: '8px', backgroundColor: '#fafafa' }}>
            <img src={preview} alt="Preview" style={{ maxWidth: '100%', maxHeight: '220px', borderRadius: '6px', objectFit: 'contain' }} />
          </div>
        )}

        {activeTab === 'protect' ? (
          <button onClick={handleUpload} disabled={!file || !session || isProcessing} style={btnStyle(!file || !session || isProcessing)}>
            {isProcessing ? 'Processing...' : 'Sanitize & Sign via PQC'}
          </button>
        ) : (
          <button onClick={handleVerify} disabled={!file || isProcessing} style={btnStyle(!file || isProcessing)}>
            {isProcessing ? 'Verifying...' : 'Verify Digital Signature'}
          </button>
        )}
      </div>

      {activeTab === 'verify' && verifyResult && (
        <div style={{ marginTop: '30px', padding: '20px', borderRadius: '8px', backgroundColor: verifyResult.verified ? '#e6f4ea' : '#fce8e6', border: `1px solid ${verifyResult.verified ? '#ceead6' : '#fad2cf'}`, textAlign: 'center' }}>
          <h3 style={{ margin: '0 0 10px 0', color: verifyResult.verified ? '#137333' : '#c5221f' }}>
            {verifyResult.verified ? 'Signature Valid' : 'Verification Failed'}
          </h3>
          <p style={{ margin: 0, fontSize: '14px', color: '#333' }}>{verifyResult.message}</p>
        </div>
      )}

      {activeTab === 'protect' && metadata && (
        <div style={{ marginTop: '30px', animation: 'fadeIn 0.3s ease' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', margin: 0, color: '#1a1a1a' }}>
              🔍 Original Image Metadata Analysis
            </h3>
          </div>
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
                    <tr key={key} style={{ borderBottom: index < Object.keys(metadata).length - 1 ? '1px solid #f1f3f4' : 'none', backgroundColor: index % 2 === 0 ? '#ffffff' : '#fafafa' }}>
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