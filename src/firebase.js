import { initializeApp } from 'firebase/app';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  connectFirestoreEmulator,
} from 'firebase/firestore';
import { getAuth, GoogleAuthProvider, connectAuthEmulator } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { getMessaging, isSupported } from 'firebase/messaging';

// Your live Firebase configuration (Connected to me-central2)
const firebaseConfig = {
  apiKey: "AIzaSyC7jSWh02umV06YJif-INiwvwXMriEw55U",
  authDomain: "al-tawoos-erp.firebaseapp.com",
  projectId: "al-tawoos-erp",
  storageBucket: "al-tawoos-erp.firebasestorage.app",
  messagingSenderId: "590660260784",
  appId: "1:590660260784:web:157103d90b04c9940bfc75"
};

// Initialize Firebase SDK
export const app = initializeApp(firebaseConfig);

// Initialize Firestore Database with persistent local multi-tab IndexedDB cache
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const functions = getFunctions(app, 'me-central2');

// Optional Firebase Local Emulator Suite hook (zero-cost local dev & rules/functions testing)
const useEmulatorsFlag =
  typeof import.meta !== 'undefined' && import.meta?.env?.VITE_USE_EMULATORS === 'true';

if (useEmulatorsFlag && typeof window !== 'undefined' && !window.__TAWOOS_EMULATORS_CONNECTED__) {
  try {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    connectFunctionsEmulator(functions, '127.0.0.1', 5001);
    window.__TAWOOS_EMULATORS_CONNECTED__ = true;
    console.info('[Firebase] Connected to Local Emulator Suite (Auth:9099, Firestore:8080, Functions:5001)');
  } catch (emuErr) {
    console.warn('[Firebase] Emulator connection warning:', emuErr?.message);
  }
}

let messagingInstance = null;
export async function getFirebaseMessaging() {
  if (typeof window === 'undefined') return null;
  try {
    const supported = await isSupported();
    if (!supported) return null;
    if (!messagingInstance) {
      messagingInstance = getMessaging(app);
    }
    return messagingInstance;
  } catch (e) {
    console.debug('Firebase Messaging isSupported error:', e);
    return null;
  }
}

/**
 * Helper: Converts any local PDF or image to a Base64 data attachment
 * to store directly in Firestore without needing a paid Cloud Storage bucket.
 * * @param {File} file - Native File object from <input type="file" />
 * @returns {Promise<{ name: string, size: string, type: string, url: string, uploadedAt: string }>}
 */
export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve(null);
      return;
    }

    // Safety limit: Firestore single document limit is 1MB
    if (file.size > 800 * 1024) {
      reject(
        new Error(
          'حجم الملف يتجاوز الحد المسموح (800 كيلوبايت) للتخزين السحابي المباشر. يرجى اختيار ملف أصغر أو ضغط الملف.'
        )
      );
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        name: file.name,
        size: (file.size / 1024).toFixed(1) + ' KB',
        type: file.type,
        url: reader.result, // Native Base64 URL (opens PDFs & images in browser tabs)
        uploadedAt: new Date().toISOString()
      });
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

/**
 * Universal Document Viewer Helper
 * Converts Base64 Data URL to a native Blob URL to bypass browser top-frame navigation restrictions
 * @param {object|string} fileObj - The file object containing .url and .name
 */
export function openBase64Document(fileObj) {
  if (!fileObj) return;
  const dataUrl = typeof fileObj === 'object' ? fileObj.url : fileObj;
  if (!dataUrl) return;

  // If it's already an HTTPS link
  if (dataUrl.startsWith('http://') || dataUrl.startsWith('https://')) {
    window.open(dataUrl, '_blank', 'noopener,noreferrer');
    return;
  }

  // If it's a Base64 data URL
  try {
    const parts = dataUrl.split(',');
    const mimeMatch = parts[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'application/pdf';
    const bstr = atob(parts[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);

    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }

    const blob = new Blob([u8arr], { type: mime });
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, '_blank');
  } catch (error) {
    console.error('Error opening Base64 document:', error);
    // Fallback: trigger download
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = (typeof fileObj === 'object' && fileObj.name) ? fileObj.name : 'document';
    link.click();
  }
}