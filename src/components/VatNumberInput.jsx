import React, { useRef, useMemo } from 'react';

/**
 * VatNumberInput
 * Standardized 3-section input for Egyptian Tax/VAT registration numbers (XXX-XXX-XXX).
 * Strictly maintains LTR orientation regardless of page language (RTL/LTR)
 * to prevent bidirectional number scrambling.
 *
 * Props:
 * - value: string (e.g. "498-871-282" or "498871282" or "")
 * - onChange: (formattedValue: string) => void (emits "XXX-XXX-XXX" or "")
 * - disabled?: boolean
 * - required?: boolean
 * - className?: string
 */
export default function VatNumberInput({
  value = '',
  onChange,
  disabled = false,
  required = false,
  className = ''
}) {
  const input1Ref = useRef(null);
  const input2Ref = useRef(null);
  const input3Ref = useRef(null);

  // Parse value into 3 sections of 3 digits
  const { part1, part2, part3 } = useMemo(() => {
    if (!value) return { part1: '', part2: '', part3: '' };
    const digitsOnly = String(value).replace(/\D/g, '');
    return {
      part1: digitsOnly.slice(0, 3),
      part2: digitsOnly.slice(3, 6),
      part3: digitsOnly.slice(6, 9)
    };
  }, [value]);

  const triggerChange = (p1, p2, p3) => {
    if (!onChange) return;
    const clean1 = p1.replace(/\D/g, '').slice(0, 3);
    const clean2 = p2.replace(/\D/g, '').slice(0, 3);
    const clean3 = p3.replace(/\D/g, '').slice(0, 3);

    if (!clean1 && !clean2 && !clean3) {
      onChange('');
      return;
    }

    // Format as XXX-XXX-XXX
    let formatted = clean1;
    if (clean2 || clean3) {
      formatted += `-${clean2}`;
    }
    if (clean3) {
      formatted += `-${clean3}`;
    }
    onChange(formatted);
  };

  const handleInputChange = (partIndex, e) => {
    const rawVal = e.target.value.replace(/\D/g, '');
    if (rawVal.length > 3) {
      // User might have typed or entered more
      handlePasteValue(rawVal, partIndex);
      return;
    }

    if (partIndex === 1) {
      triggerChange(rawVal, part2, part3);
      if (rawVal.length === 3) {
        input2Ref.current?.focus();
        input2Ref.current?.select();
      }
    } else if (partIndex === 2) {
      triggerChange(part1, rawVal, part3);
      if (rawVal.length === 3) {
        input3Ref.current?.focus();
        input3Ref.current?.select();
      }
    } else if (partIndex === 3) {
      triggerChange(part1, part2, rawVal);
    }
  };

  const handleKeyDown = (partIndex, e) => {
    if (e.key === 'Backspace') {
      if (partIndex === 3 && !part3) {
        input2Ref.current?.focus();
      } else if (partIndex === 2 && !part2) {
        input1Ref.current?.focus();
      }
    } else if (e.key === 'ArrowRight') {
      if (partIndex === 1 && input1Ref.current?.selectionStart === 3) {
        input2Ref.current?.focus();
      } else if (partIndex === 2 && input2Ref.current?.selectionStart === 3) {
        input3Ref.current?.focus();
      }
    } else if (e.key === 'ArrowLeft') {
      if (partIndex === 3 && input3Ref.current?.selectionStart === 0) {
        input2Ref.current?.focus();
      } else if (partIndex === 2 && input2Ref.current?.selectionStart === 0) {
        input1Ref.current?.focus();
      }
    }
  };

  const handlePasteValue = (pastedText, startPart = 1) => {
    const digitsOnly = pastedText.replace(/\D/g, '').slice(0, 9);
    if (!digitsOnly) return;

    if (digitsOnly.length >= 6) {
      const p1 = digitsOnly.slice(0, 3);
      const p2 = digitsOnly.slice(3, 6);
      const p3 = digitsOnly.slice(6, 9);
      triggerChange(p1, p2, p3);
      if (digitsOnly.length === 9) {
        input3Ref.current?.focus();
      } else if (digitsOnly.length >= 6) {
        input3Ref.current?.focus();
      }
    } else if (startPart === 1) {
      const p1 = digitsOnly.slice(0, 3);
      const p2 = digitsOnly.slice(3, 6);
      triggerChange(p1, p2, part3);
      if (p1.length === 3) input2Ref.current?.focus();
    } else if (startPart === 2) {
      const p2 = digitsOnly.slice(0, 3);
      const p3 = digitsOnly.slice(3, 6);
      triggerChange(part1, p2, p3);
      if (p2.length === 3) input3Ref.current?.focus();
    } else if (startPart === 3) {
      const p3 = digitsOnly.slice(0, 3);
      triggerChange(part1, part2, p3);
    }
  };

  const handlePaste = (partIndex, e) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');
    handlePasteValue(pastedText, partIndex);
  };

  return (
    <div
      dir="ltr"
      className={`flex items-center justify-between gap-1 w-full h-[38px] px-1.5 bg-white border border-slate-300 rounded-lg focus-within:ring-2 focus-within:ring-emerald-500 focus-within:border-emerald-500 transition-all ${disabled ? 'opacity-60 bg-slate-50 cursor-not-allowed' : ''} ${className}`}
    >
      {/* Box 1 (Leftmost 3 digits) */}
      <input
        ref={input1Ref}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={3}
        placeholder="###"
        value={part1}
        disabled={disabled}
        required={required}
        onChange={(e) => handleInputChange(1, e)}
        onKeyDown={(e) => handleKeyDown(1, e)}
        onPaste={(e) => handlePaste(1, e)}
        className="flex-1 min-w-0 h-[28px] text-center font-mono font-bold text-slate-800 bg-slate-50 hover:bg-slate-100/80 focus:bg-emerald-50/60 rounded border border-slate-200 focus:border-emerald-500 focus:outline-none text-xs sm:text-sm tracking-wider select-all"
        title="القسم الأول (3 أرقام)"
      />

      <span className="text-slate-400 font-mono font-bold select-none px-0.5 shrink-0">-</span>

      {/* Box 2 (Middle 3 digits) */}
      <input
        ref={input2Ref}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={3}
        placeholder="###"
        value={part2}
        disabled={disabled}
        onChange={(e) => handleInputChange(2, e)}
        onKeyDown={(e) => handleKeyDown(2, e)}
        onPaste={(e) => handlePaste(2, e)}
        className="flex-1 min-w-0 h-[28px] text-center font-mono font-bold text-slate-800 bg-slate-50 hover:bg-slate-100/80 focus:bg-emerald-50/60 rounded border border-slate-200 focus:border-emerald-500 focus:outline-none text-xs sm:text-sm tracking-wider select-all"
        title="القسم الثاني (3 أرقام)"
      />

      <span className="text-slate-400 font-mono font-bold select-none px-0.5 shrink-0">-</span>

      {/* Box 3 (Rightmost 3 digits) */}
      <input
        ref={input3Ref}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={3}
        placeholder="###"
        value={part3}
        disabled={disabled}
        onChange={(e) => handleInputChange(3, e)}
        onKeyDown={(e) => handleKeyDown(3, e)}
        onPaste={(e) => handlePaste(3, e)}
        className="flex-1 min-w-0 h-[28px] text-center font-mono font-bold text-slate-800 bg-slate-50 hover:bg-slate-100/80 focus:bg-emerald-50/60 rounded border border-slate-200 focus:border-emerald-500 focus:outline-none text-xs sm:text-sm tracking-wider select-all"
        title="القسم الثالث (3 أرقام)"
      />
    </div>
  );
}
