interface BrandMarkProps {
  size?: number;
  withWordmark?: boolean;
}

export function BrandMark({ size = 34, withWordmark = false }: BrandMarkProps) {
  return (
    <div className="brand-lockup" aria-label="Seven Reader">
      <svg
        className="brand-mark"
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="brand-violet" x1="12" y1="8" x2="53" y2="58" gradientUnits="userSpaceOnUse">
            <stop stopColor="#956CFF" />
            <stop offset=".55" stopColor="#7144F3" />
            <stop offset="1" stopColor="#4D24C8" />
          </linearGradient>
        </defs>
        <rect x="4" y="4" width="56" height="56" rx="15" fill="#111318" />
        <path d="M18 11h22l10 10v32H18a5 5 0 0 1-5-5V16a5 5 0 0 1 5-5Z" fill="url(#brand-violet)" />
        <path d="M40 11v7.5a2.5 2.5 0 0 0 2.5 2.5H50" fill="#C6B2FF" opacity=".72" />
        <path d="M21 24h25l-2.8 5.4-7.5 2.4L27 51h-7l9.4-20.7H21V24Z" fill="#F8F5FF" />
        <path d="M29.5 38.5h11" stroke="#CBBEFF" strokeWidth="2.8" strokeLinecap="round" opacity=".55" />
      </svg>
      {withWordmark && (
        <div className="brand-wordmark">
          <strong>Seven</strong><span>Reader</span>
        </div>
      )}
    </div>
  );
}
