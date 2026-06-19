export default function Mascot() {
  return (
    <svg
      viewBox="0 0 80 100"
      width="80"
      height="100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="SAP Assessor mascot"
    >
      {/* Hard hat brim */}
      <ellipse cx="40" cy="28" rx="22" ry="5" fill="#FFD700" stroke="#000" strokeWidth="3" strokeLinejoin="round" />
      {/* Hard hat dome */}
      <path d="M20 28 Q18 14 40 12 Q62 14 60 28 Z" fill="#FFD700" stroke="#000" strokeWidth="3" strokeLinejoin="round" />
      {/* Hard hat stripe */}
      <path d="M28 20 Q40 18 52 20" stroke="#000" strokeWidth="1.5" strokeLinecap="round" />

      {/* Body */}
      <rect x="14" y="30" width="52" height="48" rx="10" ry="10" fill="#FFF8F0" stroke="#000" strokeWidth="3" />

      {/* Left eye */}
      <circle cx="29" cy="46" r="7" fill="white" stroke="#000" strokeWidth="2.5" />
      <circle cx="30" cy="47" r="3" fill="#000" />
      <circle cx="31.5" cy="45.5" r="1" fill="white" />

      {/* Right eye */}
      <circle cx="51" cy="46" r="7" fill="white" stroke="#000" strokeWidth="2.5" />
      <circle cx="52" cy="47" r="3" fill="#000" />
      <circle cx="53.5" cy="45.5" r="1" fill="white" />

      {/* Smile */}
      <path d="M32 60 Q40 67 48 60" stroke="#000" strokeWidth="2.5" strokeLinecap="round" fill="none" />

      {/* Left arm */}
      <path d="M14 52 Q6 54 5 62" stroke="#000" strokeWidth="3" strokeLinecap="round" />

      {/* Right arm */}
      <path d="M66 52 Q74 50 76 44" stroke="#000" strokeWidth="3" strokeLinecap="round" />
      {/* Ruler */}
      <rect x="70" y="34" width="8" height="22" rx="2" fill="#FFF8F0" stroke="#000" strokeWidth="2" transform="rotate(20 74 45)" />
      <line x1="72" y1="38" x2="75" y2="39" stroke="#000" strokeWidth="1" transform="rotate(20 74 45)" />
      <line x1="72" y1="42" x2="75" y2="43" stroke="#000" strokeWidth="1" transform="rotate(20 74 45)" />
      <line x1="72" y1="46" x2="75" y2="47" stroke="#000" strokeWidth="1" transform="rotate(20 74 45)" />

      {/* Left leg */}
      <rect x="22" y="76" width="12" height="16" rx="4" fill="#FFF8F0" stroke="#000" strokeWidth="3" />
      <ellipse cx="28" cy="92" rx="8" ry="4" fill="#FFD700" stroke="#000" strokeWidth="2.5" />

      {/* Right leg */}
      <rect x="46" y="76" width="12" height="16" rx="4" fill="#FFF8F0" stroke="#000" strokeWidth="3" />
      <ellipse cx="52" cy="92" rx="8" ry="4" fill="#FFD700" stroke="#000" strokeWidth="2.5" />
    </svg>
  );
}
