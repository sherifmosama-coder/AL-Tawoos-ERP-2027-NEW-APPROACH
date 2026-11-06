import React, { useState, useRef } from 'react';
import { Lock, Unlock } from 'lucide-react';
import { LEDGER_MODES } from '../utils/dualLedgerEngine.js';

export default function SecretLockButton({
  isUnlocked = false,
  activeMode = LEDGER_MODES.OFFICIAL,
  onLongPress = () => {},
  onLock = () => {},
  onToggleMode = () => {},
  isAr = true
}) {
  const [isPressing, setIsPressing] = useState(false);
  const [pressProgress, setPressProgress] = useState(0);
  const timerRef = useRef(null);
  const progressIntervalRef = useRef(null);

  const startPress = () => {
    if (isUnlocked) return;
    setIsPressing(true);
    setPressProgress(0);

    const startTime = Date.now();
    const duration = 2000; // 2 seconds

    progressIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min((elapsed / duration) * 100, 100);
      setPressProgress(pct);
    }, 50);

    timerRef.current = setTimeout(() => {
      clearTimers();
      onLongPress();
    }, duration);
  };

  const clearTimers = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    setIsPressing(false);
    setPressProgress(0);
  };

  const handleMouseUpOrLeave = () => {
    clearTimers();
  };

  if (!isUnlocked) {
    return (
      <div className="relative inline-flex items-center">
        <button
          type="button"
          onMouseDown={startPress}
          onMouseUp={handleMouseUpOrLeave}
          onMouseLeave={handleMouseUpOrLeave}
          onTouchStart={startPress}
          onTouchEnd={handleMouseUpOrLeave}
          onClick={(e) => e.preventDefault()}
          className="relative p-2 rounded-xl border border-slate-200/80 bg-slate-50/70 hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition shadow-2xs cursor-default select-none group"
          title={isAr ? 'مؤمن' : 'Secured'}
        >
          <Lock className="h-3.5 w-3.5" />
          {isPressing && (
            <span
              className="absolute inset-0 rounded-xl border-2 border-amber-400/80 transition-all pointer-events-none"
              style={{ opacity: pressProgress / 100 }}
            />
          )}
        </button>
      </div>
    );
  }

  // Unlocked State: Neutral switcher + Lock button
  return (
    <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-300 shadow-2xs text-xs font-bold">
      <button
        type="button"
        onClick={() => onToggleMode(LEDGER_MODES.OFFICIAL)}
        className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
          activeMode === LEDGER_MODES.OFFICIAL
            ? 'bg-white text-slate-800 shadow-xs border border-slate-200'
            : 'text-slate-500 hover:text-slate-800'
        }`}
      >
        {isAr ? 'العرض القياسي' : 'Standard'}
      </button>

      <button
        type="button"
        onClick={() => onToggleMode(LEDGER_MODES.MASTER)}
        className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
          activeMode === LEDGER_MODES.MASTER
            ? 'bg-slate-900 text-white shadow-xs font-black'
            : 'text-slate-500 hover:text-slate-800'
        }`}
      >
        {isAr ? 'العرض الموسع' : 'Consolidated'}
      </button>

      <button
        type="button"
        onClick={onLock}
        className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
        title={isAr ? 'إعادة القفل' : 'Lock'}
      >
        <Unlock className="h-3.5 w-3.5 text-amber-600" />
      </button>
    </div>
  );
}
