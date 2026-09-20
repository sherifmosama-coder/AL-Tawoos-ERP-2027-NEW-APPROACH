import React from 'react';

export default function PeacockLoader({
  size = 'md', // 'sm' | 'md' | 'lg' | 'xl'
  fullScreen = false,
  text = '',
  className = '',
}) {
  // Dimension presets
  const sizeClasses = {
    sm: 'w-12 h-auto',
    md: 'w-24 h-auto',
    lg: 'w-36 h-auto',
    xl: 'w-48 h-auto',
  };

  const loaderGraphic = (
    <div className={`flex flex-col items-center justify-center gap-3 select-none ${className}`}>
      {/* Scoped High-Frame-Rate Hardware-Accelerated CSS Keyframes */}
      <style>{`
        @keyframes fanSweepRotation {
          0% {
            transform: rotate(-105deg);
            opacity: 0;
          }
          12% {
            opacity: 1;
          }
          88% {
            opacity: 1;
          }
          100% {
            transform: rotate(105deg);
            opacity: 0;
          }
        }

        @keyframes pivotGlowPulse {
          0%, 100% {
            transform: scale(0.9);
            opacity: 0.25;
          }
          50% {
            transform: scale(1.15);
            opacity: 0.55;
          }
        }

        .fan-sweep-beam {
          transform-origin: 338.315px 348.84px;
          animation: fanSweepRotation 2.2s cubic-bezier(0.45, 0.05, 0.25, 0.95) infinite;
          will-change: transform, opacity;
        }

        .pivot-glow {
          animation: pivotGlowPulse 2.2s ease-in-out infinite;
          will-change: transform, opacity;
        }
      `}</style>

      {/* SVG Container */}
      <div className={`relative flex items-center justify-center ${sizeClasses[size] || sizeClasses.md}`}>
        {/* Soft Ambient Radial Pivot Aura */}
        <div className="absolute -bottom-2 w-3/4 h-1/2 bg-[#0D6CBA]/30 rounded-full blur-xl pivot-glow pointer-events-none" />

        <svg
          viewBox="0 0 676.63 348.84"
          className="w-full h-auto overflow-visible relative z-10"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Reusable Master Peacock Path */}
            <path
              id="peacock-master-path"
              d="M298.85,237.94c-.02-4.1,.02-7.11,.12-8.64l-43.16-116.35c-2.52-8.38-6.57-16.5-12.09-23.87-26.39-35.42-76.42-42.72-111.74-16.4-35.42,26.29-42.72,76.39-16.39,111.71,5.69,7.64,12.42,13.97,19.89,18.92l.4,.27,108.3,76.56-116.92-75.45c-7.07-5.18-15.12-9.39-23.94-12.09-42.25-12.89-86.89,10.81-99.82,53.02-12.89,42.15,10.81,86.79,52.96,99.72,9.16,2.76,18.35,3.8,27.27,3.4h.4l104.65-.03c61.06-.02,110.31-49.72,110.06-110.78Zm-90.38-71.33l-41.58-30.94h-.07c-1.55-1.04-2.93-2.42-4.14-3.97-5.52-7.47-3.91-18.01,3.57-23.47,7.47-5.52,18.01-3.91,23.46,3.57,1.14,1.55,2.02,3.27,2.52,5.05l17.44,48.88-1.21,.87Zm-79.25,121.57l-51.81-.34h-.07c-1.89,.1-3.84-.17-5.69-.81-8.85-2.76-13.8-12.19-10.97-21.04,2.76-8.82,12.19-13.7,21.04-10.94,1.85,.57,3.5,1.45,4.95,2.59l43.03,29.16-.47,1.38Zm543.88-42.55c-12.89-42.22-57.64-65.92-99.79-53.02-8.86,2.69-16.9,6.9-23.94,12.09l-117.13,75.62,108.57-76.73,.34-.27c7.48-4.95,14.21-11.28,19.9-18.92,26.3-35.32,18.99-85.41-16.33-111.71-35.42-26.33-85.51-19.02-111.81,16.4-5.52,7.37-9.6,15.49-12.19,23.87l-33.77,91.1-2.46,6.7c.57,4.44,.91,9.06,2.29,12.56,3.03,7.68,8.17,9.56,11.04,17.07,1.73,4.52,1.83,8.71,1.65,11.51-3.88-2.42-7.77-4.85-11.65-7.27-1.03-.58-2.62-1.43-4.61-2.3-8.79-3.83-13.02-2.65-21.71-4.43-12.79-2.63-22.19-7.92-24.65-5.22-1.12,1.23-1.69,2.93-1.69,2.93s-.43,1.39-.43,2.96c0,60.82,49.3,110.14,110.12,110.15l147.59,.04h.4c9.02,.4,18.21-.64,27.2-3.4,42.22-12.93,65.95-57.57,53.02-99.72ZM485.38,116.86c.57-1.78,1.38-3.5,2.52-5.05,5.52-7.47,15.99-9.09,23.46-3.57,7.47,5.45,9.09,15.99,3.57,23.47-1.14,1.55-2.59,2.93-4.14,3.97h-.1l-41.58,30.94-1.11-.87,17.37-48.88Zm118.47,161.67c-1.88,.57-3.84,.81-5.69,.74h-.07l-51.81,.3-.51-1.38,42.96-29.05c1.48-1.14,3.17-2.05,5.05-2.59,8.86-2.76,18.25,2.09,21.01,10.94,2.76,8.85-2.09,18.28-10.94,21.04ZM338.32,0c-44.1,0-79.82,35.72-79.82,79.89,0,4.65,.3,9.09,1.14,13.57,.13,1.04,.4,2.12,.64,3.27,.4,2.19,.98,4.28,1.62,6.46,.4,1.08,.74,2.05,1.04,3.1,.1,.17,.17,.4,.27,.64l28.51,92.15,7.71,24.95c1.65-15.62,6.13-28.68,16.56-37.34,1.21-1.01,2.49-1.92,3.74-2.76-2.59-2.69-8.11-11.04-9.93-12.76-5.39-.47-10.81,1.18-14.58-3.67-6.8-8.58,2.12-19.66,12.05-15.25,6.53,2.86,4.65,10,7.61,15.42,1.05,1.82,7.31,10.2,9.6,13.7,2.26-1.08,4.61-1.89,7.04-2.56-1.48-5.29-3.37-17.54-5.45-21.01-1.41-2.36-4.61-2.02-6.9-4.68-11.89-13.74,15.25-25.69,17.54-9.23,1.04,7.31-3.23,8.55-3.57,11.55-.44,3.74,3.13,14.95,3.54,19.83,.13,.84,.13,1.68,.13,2.46,2.66-.34,5.32-.51,7.98-.4,.17-1.55,.31-3.33,.4-3.97,.57-4.92,4.21-15.39,2.73-19.53-.98-2.9-3.87-3.97-3.44-8.62,1.48-15.25,25.79-10.84,19.46,5.35-1.95,4.98-4.71,3.91-7.31,6.13-2.56,2.12-4.75,14.91-6.13,21.11,2.63,.37,5.15,.98,7.64,1.78,3.03-4.41,9.26-12.42,9.9-14.04,1.89-4.65,.07-9.73,5.62-12.96,14.11-8.18,22.29,17.14,5.56,18.42-1.82,.1-3.97-.71-4.88-.51-2.83,.64-7.17,7.68-10.74,11.24,9.29,4.44,16.7,12.09,19.69,22.66l.64-2.05,3.6-11.65,1.89-5.99v-.03l24.07-77.74,.17-.64c.34-1.04,.74-2.02,1.05-3.1,.67-2.19,1.25-4.38,1.72-6.46,.24-1.14,.4-2.22,.57-3.27,.81-4.38,1.21-8.92,1.21-13.57C418.22,35.72,382.43,0,338.32,0Zm15.82,61.31l-14.95,49.69h-1.45l-15.18-49.52v-.1c-.64-1.68-1.04-3.64-1.04-5.69,0-10,8.86-17.94,19.17-16.54,8.13,1.11,14.44,8.36,14.43,16.56,0,1.94-.34,3.82-.98,5.6Z"
            />

            {/* Soft Fan-Wedge Gradient Mask */}
            <linearGradient id="fanBeamGradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
              <stop offset="55%" stopColor="#ffffff" stopOpacity="0.35" />
              <stop offset="90%" stopColor="#ffffff" stopOpacity="1" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0.1" />
            </linearGradient>

            {/* Hand-Fan Rotating Sweep Mask */}
            <mask id="fan-hand-sweep-mask">
              <rect width="676.63" height="348.84" fill="#000000" />
              <g className="fan-sweep-beam">
                {/* 60-degree light fan sector pivoting at bottom center (338.315, 348.84) */}
                <path
                  d="M338.315,348.84 L138,-150 L538,-150 Z"
                  fill="url(#fanBeamGradient)"
                />
              </g>
            </mask>

            {/* Luminous Glow Filter for Highlight Sweep */}
            <filter id="sapphire-bloom" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* 1. Base Resting Silhouette (Clean, Solid #0D6CBA) */}
          <use
            href="#peacock-master-path"
            fill="#0D6CBA"
            opacity="0.22"
          />

          {/* 2. Sweeping Light Fan Wave (Masked, Luminous #0D6CBA) */}
          <g mask="url(#fan-hand-sweep-mask)">
            <use
              href="#peacock-master-path"
              fill="#0D6CBA"
              filter="url(#sapphire-bloom)"
              opacity="1"
            />
          </g>
        </svg>
      </div>

      {/* Optional Loading Caption */}
      {text && (
        <span className="text-xs font-bold text-[#0D6CBA] tracking-wide animate-pulse mt-0.5">
          {text}
        </span>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-[99999] animate-in fade-in duration-200">
        <div className="bg-white/95 border border-slate-200/80 p-8 rounded-3xl shadow-2xl flex flex-col items-center space-y-3">
          {loaderGraphic}
        </div>
      </div>
    );
  }

  return loaderGraphic;
}