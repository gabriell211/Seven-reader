interface BrandMarkProps {
  size?: number;
  withWordmark?: boolean;
}

export function BrandMark({ size = 34, withWordmark = false }: BrandMarkProps) {
  return (
    <div className="brand-lockup" aria-label="Seven Reader">
      <img
        className="brand-mark"
        src="/seven-reader-brand.webp"
        width={size}
        height={size}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
      {withWordmark && (
        <div className="brand-wordmark">
          <strong>Seven</strong><span>Reader</span>
        </div>
      )}
    </div>
  );
}
