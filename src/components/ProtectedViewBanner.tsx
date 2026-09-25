import { SevenIcon } from "./SevenIcon";

interface ProtectedViewBannerProps {
  reasons: string[];
  onTrustOnce: () => void;
  onTrustLocation: () => void;
}

export function ProtectedViewBanner({ reasons, onTrustOnce, onTrustLocation }: ProtectedViewBannerProps) {
  return (
    <div className="protected-banner" role="alert">
      <SevenIcon name="shield" />
      <div><strong>Visualização protegida</strong><span>{reasons.length ? `Detectado: ${reasons.join(", ")}.` : "Arquivo aberto como não confiável."} Operações que alteram o PDF estão bloqueadas.</span></div>
      <button onClick={onTrustOnce}>Confiar uma vez</button>
      <button onClick={onTrustLocation}>Confiar nesta pasta</button>
    </div>
  );
}
