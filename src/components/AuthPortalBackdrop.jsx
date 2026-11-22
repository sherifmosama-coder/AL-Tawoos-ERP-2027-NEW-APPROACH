import React from 'react';

/**
 * Clean corporate white backdrop with subtle pale-navy abstract geometry
 * shared across Sign-In and Custom Password Reset / Auth Action portals.
 */
export default function AuthPortalBackdrop({ isAr = true, children }) {
  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      style={{ fontFamily: "'Cairo', sans-serif" }}
      className="min-h-screen bg-white relative flex items-center justify-center p-4 sm:p-6 overflow-hidden"
    >
      {/* Subtle White / Slight Pale-Navy Abstract Background */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(circle at 14% 16%, rgba(1, 78, 168, 0.055) 0%, transparent 45%), radial-gradient(circle at 86% 84%, rgba(6, 33, 71, 0.05) 0%, transparent 48%), linear-gradient(180deg, #ffffff 0%, #f8fafd 100%)',
          }}
        />
        <svg
          viewBox="0 0 1440 900"
          preserveAspectRatio="xMidYMid slice"
          className="w-full h-full opacity-90"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M-120,160 C240,40 480,320 920,180 C1180,95 1340,20 1560,110 L1560,-100 L-120,-100 Z"
            fill="rgba(6, 33, 71, 0.032)"
          />
          <path
            d="M-80,820 C260,640 580,880 1020,700 C1250,605 1410,640 1560,720 L1560,1000 L-80,1000 Z"
            fill="rgba(1, 78, 168, 0.038)"
          />
          <circle
            cx="1260"
            cy="140"
            r="240"
            fill="none"
            stroke="rgba(6, 33, 71, 0.05)"
            strokeWidth="1.2"
          />
          <circle
            cx="1260"
            cy="140"
            r="340"
            fill="none"
            stroke="rgba(13, 108, 186, 0.035)"
            strokeWidth="1"
          />
          <circle
            cx="180"
            cy="740"
            r="210"
            fill="none"
            stroke="rgba(6, 33, 71, 0.045)"
            strokeWidth="1.2"
          />
        </svg>
      </div>

      <div className="relative z-10 w-full flex items-center justify-center">{children}</div>
    </div>
  );
}
