import React, { useState, useEffect, useRef } from 'react';
import {
  Lock,
  Unlock,
  KeyRound,
  X,
  AlertTriangle
} from 'lucide-react';
import {
  verifyMasterPin,
  unlockMasterLedger
} from '../utils/dualLedgerEngine.js';

export default function SecretDoorModal({
  isOpen,
  onClose,
  onSuccess,
  isAr = true,
  currentUser = null
}) {
  const [pinDigits, setPinDigits] = useState(['', '', '', '']);
  const [errorMsg, setErrorMsg] = useState('');

  const inputRefs = [useRef(null), useRef(null), useRef(null), useRef(null)];

  // Focus first input on open
  useEffect(() => {
    if (isOpen) {
      setPinDigits(['', '', '', '']);
      setErrorMsg('');
      setTimeout(() => {
        if (inputRefs[0]?.current) {
          inputRefs[0].current.focus();
        }
      }, 100);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDigitChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;
    const cleanVal = value.slice(-1);
    const newDigits = [...pinDigits];
    newDigits[index] = cleanVal;
    setPinDigits(newDigits);
    setErrorMsg('');

    // Auto-advance to next input
    if (cleanVal && index < 3) {
      inputRefs[index + 1]?.current?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !pinDigits[index] && index > 0) {
      inputRefs[index - 1]?.current?.focus();
    }
  };

  const handleUnlock = (e) => {
    if (e) e.preventDefault();
    const entered = pinDigits.join('');
    if (entered.length < 4) {
      setErrorMsg(isAr ? 'يرجى إدخال رمز الأمان المكون من ٤ أرقام' : 'Please enter the 4-digit passcode');
      return;
    }

    if (verifyMasterPin(entered)) {
      unlockMasterLedger();
      if (onSuccess) onSuccess();
      onClose();
    } else {
      setErrorMsg(isAr ? 'رمز الأمان غير صحيح. يرجى إعادة المحاولة' : 'Invalid passcode. Please try again.');
      setPinDigits(['', '', '', '']);
      setTimeout(() => {
        inputRefs[0]?.current?.focus();
      }, 50);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/70 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden text-slate-100 flex flex-col my-auto">
        {/* Header */}
        <div className="p-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-slate-800 text-slate-300 border border-slate-700">
              <KeyRound className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-bold text-xs tracking-wide text-white">
                {isAr ? 'التحقق من رمز الأمان' : 'Security Verification'}
              </h3>
              <p className="text-[10px] text-slate-400">
                {isAr ? 'أدخل رمز المرور الإداري للمتابعة' : 'Enter administrative passcode'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleUnlock} className="p-5 space-y-5">
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-3 dir-ltr" style={{ direction: 'ltr' }}>
              {pinDigits.map((digit, idx) => (
                <input
                  key={idx}
                  ref={inputRefs[idx]}
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleDigitChange(idx, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(idx, e)}
                  className="w-12 h-14 text-center text-2xl font-mono font-black bg-slate-800 border-2 border-slate-700 focus:border-amber-400 focus:outline-none rounded-xl text-amber-300 transition shadow-inner"
                  placeholder="•"
                />
              ))}
            </div>

            {errorMsg && (
              <div className="p-2.5 rounded-xl bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-bold flex items-center justify-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:bg-slate-800 transition cursor-pointer"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-white text-slate-900 transition active:scale-95 flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Unlock className="h-3.5 w-3.5" />
              <span>{isAr ? 'تأكيد' : 'Confirm'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
