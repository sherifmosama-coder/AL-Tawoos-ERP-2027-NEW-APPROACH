import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X,
  Download,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  RotateCw,
  FileText,
  FileImage,
  Paperclip
} from 'lucide-react';

export default function AttachmentViewerModal({
  attachment,
  isOpen,
  onClose
}) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  // Reset zoom & rotation on new attachment
  useEffect(() => {
    setZoom(1);
    setRotation(0);
  }, [attachment]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !attachment) return null;

  const url = typeof attachment === 'string' ? attachment : (attachment.url || attachment.dataUrl || '');
  const name = typeof attachment === 'string' ? 'Attachment' : (attachment.name || 'مستند مرفق');
  const type = typeof attachment === 'object' ? (attachment.type || '') : '';
  const isImage = type.startsWith('image/') || url.startsWith('data:image/') || /\.(png|jpe?g|webp|gif|svg)$/i.test(url) || /\.(png|jpe?g|webp|gif|svg)$/i.test(name);
  const isPdf = type === 'application/pdf' || url.startsWith('data:application/pdf') || /\.pdf$/i.test(url) || /\.pdf$/i.test(name);

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = url;
    link.download = name || 'attachment';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleOpenNewTab = () => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="fixed inset-0 z-[100000] bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-between p-4 overflow-hidden animate-fadeIn">
      {/* Top Bar */}
      <div className="w-full max-w-5xl bg-slate-900/90 text-white px-5 py-3 rounded-2xl border border-slate-700/80 shadow-2xl flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center gap-3 truncate max-w-md">
          {isImage ? (
            <FileImage className="h-5 w-5 text-blue-400 shrink-0" />
          ) : isPdf ? (
            <FileText className="h-5 w-5 text-rose-400 shrink-0" />
          ) : (
            <Paperclip className="h-5 w-5 text-slate-400 shrink-0" />
          )}
          <div className="truncate">
            <h3 className="text-sm font-extrabold truncate" title={name}>
              {name}
            </h3>
            {attachment.size && (
              <span className="text-[10px] text-slate-400 font-mono">
                {attachment.size}
              </span>
            )}
          </div>
        </div>

        {/* Toolbar Controls */}
        <div className="flex items-center gap-2">
          {isImage && (
            <>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
                className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer"
                title={isAr ? 'تكبير' : 'Zoom In'}
              >
                <ZoomIn className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
                className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer"
                title={isAr ? 'تصغير' : 'Zoom Out'}
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setRotation((r) => (r + 90) % 360)}
                className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer"
                title={isAr ? 'تدوير' : 'Rotate'}
              >
                <RotateCw className="h-4 w-4" />
              </button>
              <div className="h-4 w-px bg-slate-700 mx-1" />
            </>
          )}

          <button
            type="button"
            onClick={handleDownload}
            className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer flex items-center gap-1.5 text-xs font-bold"
            title={isAr ? 'تحميل' : 'Download'}
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">{isAr ? 'تحميل' : 'Download'}</span>
          </button>

          <button
            type="button"
            onClick={handleOpenNewTab}
            className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer"
            title={isAr ? 'فتح في تبويب مستقل' : 'Open in New Tab'}
          >
            <ExternalLink className="h-4 w-4" />
          </button>

          <div className="h-4 w-px bg-slate-700 mx-1" />

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition cursor-pointer"
            title={isAr ? 'إغلاق (Esc)' : 'Close (Esc)'}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="w-full flex-1 flex items-center justify-center p-4 overflow-auto">
        {isImage ? (
          <div className="transition-transform duration-200 flex items-center justify-center max-w-full max-h-full">
            <img
              src={url}
              alt={name}
              style={{
                transform: `scale(${zoom}) rotate(${rotation}deg)`,
                maxHeight: '80vh',
                maxWidth: '90vw'
              }}
              className="object-contain rounded-xl shadow-2xl transition-transform border border-slate-700"
            />
          </div>
        ) : isPdf ? (
          <div className="w-full max-w-5xl h-[80vh] bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-slate-700">
            <iframe
              src={url}
              title={name}
              className="w-full h-full border-none rounded-2xl"
            />
          </div>
        ) : (
          <div className="text-center p-8 bg-slate-900 border border-slate-800 rounded-3xl text-slate-300 space-y-4 max-w-md">
            <Paperclip className="h-12 w-12 text-slate-500 mx-auto" />
            <h4 className="font-extrabold text-base text-white">{name}</h4>
            <p className="text-xs text-slate-400">
              {isAr
                ? 'لا يدعم المتصفح المعاينة المباشرة لهذا النوع من الملفات. يرجى تحميل الملف.'
                : 'Direct preview is not supported for this file type. Please download to view.'}
            </p>
            <button
              type="button"
              onClick={handleDownload}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold shadow-lg inline-flex items-center gap-2 cursor-pointer"
            >
              <Download className="h-4 w-4" />
              <span>{isAr ? 'تحميل الملف الآن' : 'Download File Now'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Bottom Hint */}
      <div className="text-[11px] text-slate-400 font-medium py-1">
        {isAr ? 'اضغط Esc للإغلاق أو انقر بالخارج' : 'Press Esc to close or click backdrop'}
      </div>
    </div>
  );
}
