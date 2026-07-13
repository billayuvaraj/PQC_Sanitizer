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
    ["encrypt", "decrypt"] // Need decrypt for the return trip!
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

  // Return both formData and the AES Key
  return { formData, aesKey };
}