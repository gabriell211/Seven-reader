import { useEffect, useMemo, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import type {
  GeospatialCoordinate,
  GeospatialViewportInfo,
  InteractiveAssetInfo,
} from "../types";
import { SevenIcon } from "./SevenIcon";

export type InteractiveMode = "rich-media" | "3d" | "geospatial";

interface InteractiveContentDialogProps {
  mode: InteractiveMode;
  pageIndex: number;
  assets: InteractiveAssetInfo[];
  viewports: GeospatialViewportInfo[];
  coordinate: GeospatialCoordinate | null;
  loading: boolean;
  onClose: () => void;
  onReload: () => void;
  onExtract: (objectId: string, destination: string) => void;
  onOpenMedia: (asset: InteractiveAssetInfo) => void;
  onResolve: (pageIndex: number, normalizedX: number, normalizedY: number) => void;
}

function bytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / 1024 / 1024).toFixed(1)} MiB`;
}

export function InteractiveContentDialog({
  mode,
  pageIndex,
  assets,
  viewports,
  coordinate,
  loading,
  onClose,
  onReload,
  onExtract,
  onOpenMedia,
  onResolve,
}: InteractiveContentDialogProps) {
  const [geoPage, setGeoPage] = useState(pageIndex + 1);
  const [x, setX] = useState(0.5);
  const [y, setY] = useState(0.5);

  useEffect(() => { onReload(); }, [mode]);

  const filteredAssets = useMemo(
    () => assets.filter((asset) => mode === "3d" ? asset.kind === "3d" : asset.kind !== "3d"),
    [assets, mode],
  );

  const title =
    mode === "3d" ? "Conteúdo 3D" :
      mode === "geospatial" ? "Dados geoespaciais" :
        "Rich Media";

  const extract = async (asset: InteractiveAssetInfo) => {
    const destination = await save({
      title: `Extrair ${asset.name}`,
      defaultPath: asset.name,
    });
    if (destination) onExtract(asset.objectId, destination);
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="workflow-dialog interactive-content-dialog" role="dialog" aria-modal="true">
        <header className="organizer-head">
          <div>
            <span className="eyebrow">CONTEÚDO INTERATIVO</span>
            <h2>{title}</h2>
            <p>Inspeção e extração local. O Seven Reader não executa automaticamente mídia, 3D, scripts ou Launch actions.</p>
          </div>
          <button className="icon-button" onClick={onClose}><SevenIcon name="close" /></button>
        </header>

        <div className="workflow-body">
          {loading && <div className="report-loading"><span className="loader-ring" /> Lendo objetos e streams…</div>}

          {!loading && mode !== "geospatial" && (
            <>
              <div className="interactive-asset-list">
                {filteredAssets.map((asset) => (
                  <article className="interactive-asset-row" key={asset.objectId}>
                    <span><SevenIcon name={asset.kind === "3d" ? "layers" : "attachment"} /></span>
                    <div>
                      <strong>{asset.name}</strong>
                      <small>Página {asset.pageIndex + 1} · {asset.subtype || asset.mime} · {bytes(asset.size)}</small>
                      <code>SHA-256 {asset.sha256.slice(0, 24)}…</code>
                    </div>
                    <div className="interactive-asset-actions">
                      {asset.safeToOpen && <button className="primary-button" onClick={() => onOpenMedia(asset)}><SevenIcon name="open" /> Abrir mídia</button>}
                      <button className="secondary-light-button" onClick={() => void extract(asset)}>Extrair</button>
                    </div>
                  </article>
                ))}
              </div>
              {filteredAssets.length === 0 && <div className="empty-panel">Nenhum stream compatível encontrado para esta categoria.</div>}
              <div className="organizer-note organizer-note--warning">
                <SevenIcon name="shield" />
                <span>{mode === "3d" ? "U3D/PRC pode ser extraído para análise em software externo; renderização 3D ativa não é executada dentro do Seven Reader." : "Áudio/vídeo em formatos permitidos pode ser aberto explicitamente no player padrão. Reprodução automática, scripts, Launch e tipos desconhecidos permanecem bloqueados."}</span>
              </div>
            </>
          )}

          {!loading && mode === "geospatial" && (
            <>
              <div className="geo-viewport-list">
                {viewports.map((viewport, index) => (
                  <article key={viewport.objectId ?? `${viewport.pageIndex}-${index}`}>
                    <strong>Página {viewport.pageIndex + 1}</strong>
                    <small>{viewport.coordinateKind === "projected" ? "Sistema projetado" : "Latitude/longitude"}{viewport.epsg ? ` · EPSG:${viewport.epsg}` : ""}</small>
                    <code>BBox [{viewport.bbox.map((value) => value.toFixed(2)).join(", ")}] · {viewport.gpts.length} pontos de controle</code>
                    {viewport.wkt && <details><summary>WKT</summary><pre>{viewport.wkt}</pre></details>}
                  </article>
                ))}
              </div>
              {!viewports.length && <div className="empty-panel">Nenhum Viewport geoespacial com Measure/GPTS/LPTS compatível encontrado.</div>}

              {viewports.length > 0 && (
                <section className="geo-resolver">
                  <div className="section-mini-title">Resolver coordenada da página</div>
                  <div className="three-column-fields">
                    <label className="workflow-field"><span>Página</span><input type="number" min={1} value={geoPage} onChange={(event) => setGeoPage(Math.max(1, Number(event.target.value) || 1))} /></label>
                    <label className="workflow-field"><span>X normalizado</span><input type="number" min={0} max={1} step={0.001} value={x} onChange={(event) => setX(Math.max(0, Math.min(1, Number(event.target.value) || 0)))} /></label>
                    <label className="workflow-field"><span>Y normalizado</span><input type="number" min={0} max={1} step={0.001} value={y} onChange={(event) => setY(Math.max(0, Math.min(1, Number(event.target.value) || 0)))} /></label>
                  </div>
                  <button className="primary-button workflow-submit" onClick={() => onResolve(geoPage - 1, x, y)}>
                    <SevenIcon name="pages" /> Resolver coordenada
                  </button>
                  {coordinate && (
                    <div className="geo-coordinate-result">
                      <span>{coordinate.coordinateKind === "projected" ? "Coordenada projetada" : "Latitude / longitude"}</span>
                      <strong>{coordinate.first.toFixed(8)}, {coordinate.second.toFixed(8)}</strong>
                      <small>Local {coordinate.localX.toFixed(5)}, {coordinate.localY.toFixed(5)}{coordinate.epsg ? ` · EPSG:${coordinate.epsg}` : ""}</small>
                    </div>
                  )}
                </section>
              )}
            </>
          )}

          <button className="secondary-light-button choose-wide" onClick={onReload}><SevenIcon name="history" /> Atualizar inspeção</button>
        </div>
      </section>
    </div>
  );
}
