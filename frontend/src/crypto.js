import mlkem from 'mlkem-wasm';

export async function prepareSecurePayload(file, base64ServerPubKey) {
  // Decode Server Public Key
  const binaryString = window.atob(base64ServerPubKey);
  const serverPubKeyBytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    serverPubKeyBytes[i] = binaryString.charCodeAt(i);
  }

  // Import to WASM
  const serverPublicKey = await mlkem.importKey(
    "raw-public",
    serverPubKeyBytes,
    { name: "ML-KEM-768" },
    true,
    ["encapsulateBits"]
  );

  // Encapsulate
  const { ciphertext, sharedKey } = await mlkem.encapsulateBits(
    { name: "ML-KEM-768" },
    serverPublicKey
  );

  // AES setup
  const aesKey = await window.crypto.subtle.importKey(
    "raw",
    sharedKey,
    { name: "AES-GCM", length: 256 },
    false, 
    ["encrypt", "decrypt"] // Retain decrypt for the server's response
  );

  // Encrypt File
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const fileBuffer = await file.arrayBuffer();
  
  const encryptedFileBuffer = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    aesKey,
    fileBuffer
  );

  // Package into FormData
  const formData = new FormData();
  formData.append("ciphertext", new Blob([ciphertext]));
  formData.append("iv", new Blob([iv]));
  formData.append("file", new Blob([encryptedFileBuffer]));

  // Return both formData for HTTP POST and the AES Key for later decryption
  return { formData, aesKey };
}
// --- MOBILE BRIDGE CRYPTO ---

// 1. Generates a random room ID and AES key for the QR code
export async function generateBridgeCredentials() {
  const roomBytes = window.crypto.getRandomValues(new Uint8Array(4));
  const room = Array.from(roomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
  
  const keyBytes = window.crypto.getRandomValues(new Uint8Array(32));
  const keyHex = Array.from(keyBytes).map(b => b.toString(16).padStart(2, '0')).join('');
  
  return { room, keyHex };
}

// 2. Used by the PHONE to lock the file before sending to the server
export async function bridgeEncrypt(file, keyHex) {
  const keyBytes = new Uint8Array(keyHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
  const aesKey = await window.crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt"]);
  
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const fileBuffer = await file.arrayBuffer();
  const encrypted = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, fileBuffer);
  
  // Combine IV and Ciphertext into one binary blob
  const payload = new Uint8Array(iv.length + encrypted.byteLength);
  payload.set(iv, 0);
  payload.set(new Uint8Array(encrypted), iv.length);
  return payload;
}

// 3. Used by the DESKTOP to unlock the file after fetching from the server
export async function bridgeDecrypt(payloadBuffer, keyHex, originalMimeType = 'image/jpeg') {
  const keyBytes = new Uint8Array(keyHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
  const aesKey = await window.crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["decrypt"]);
  
  const payload = new Uint8Array(payloadBuffer);
  const iv = payload.slice(0, 12);
  const ciphertext = payload.slice(12);
  
  const decrypted = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv }, aesKey, ciphertext);
  
  // Reconstruct the file so React can use it exactly as if it was uploaded via the <input>
  return new File([decrypted], "mobile_upload.jpg", { type: originalMimeType });
}
