import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

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
const app = initializeApp(firebaseConfig);

// Initialize Firestore Database (me-central2)
export const db = getFirestore(app);

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