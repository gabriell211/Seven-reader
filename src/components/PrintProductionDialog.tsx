import { useMemo, useState } from "react";
import type { PageBoxUpdate, PrintPreflightReport } from "../types";
import { SevenIcon } from "./SevenIcon";

interface PrintProductionDialogProps {
  report: PrintPreflightReport | null;
  loading: boolean;
  pageCount: number;
  onClose: () => void;
  onReload: () => void;
  onSetBoxes: (update: PageBoxUpdate) => void;
}

const MM_TO_PT = 72 / 25.4;

function mm(value: number): string {
  return (value / MM_TO_PT).toFixed(1);
}

function boxText(box?: [number, number, number, number]): string {
  if (!box) return "—";
  return box.map((value) => value.toFixed(1)).join(" · ");
}

export function PrintProductionDialog({
  report,
  loading,
  pageCount,
  onClose,
  onReload,
  onSetBoxes,
}: PrintProductionDialogProps) {
  const [tab, setTab] = useState<"preflight" | "fonts" | "pages">("preflight");
  const [pageStart, setPageStart] = useState(1);
  const [pageEnd, setPageEnd] = useState(pageCount);
  const [trimMm, setTrimMm] = useState(3);
  const [bleedMm, setBleedMm] = useState(0);
  const [cropToTrim, setCropToTrim] = useState(false);

  const unembedded = useMemo(
    () => report?.fonts.filter((font) => !font.embedded).length ?? 0,
    [report],
  );

  const applyBoxes = () => {
    onSetBoxes({
      pageStart,
      pageEnd,
      trimInsetPt: trimMm * MM_TO_PT,
      bleedInsetPt: bleedMm * MM_TO_PT,
      cropToTrim,
    });
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="workflow-dialog print-production-dialog" role="dialog" aria-modal="true">
        <header className="organizer-head">
          <div>
            <span className="eyebrow">PRODUÇÃO DE IMPRESSÃO</span>
            <h2>Preflight e boxes</h2>
            <p>Inspeção estrutural local de cores, fontes, transparência, overprint, OutputIntent e caixas de página.</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Fechar"><SevenIcon name="close" /></button>
        </header>

        <div className="workflow-tabs">
          <button className={tab === "preflight" ? "active" : ""} onClick={() => setTab("preflight")}>Preflight</button>
          <button className={tab === "fonts" ? "active" : ""} onClick={() => setTab("fonts")}>Fontes</button>
          <button className={tab === "pages" ? "active" : ""} onClick={() => setTab("pages")}>Boxes</button>
        </div>

        <div className="workflow-body">
          <div className="production-toolbar">
            <button className="secondary-light-button" onClick={onReload}><SevenIcon name="history" /> Reanalisar</button>
            {report && <span>PDF {report.pdfVersion} · {report.pageCount} páginas</span>}
          </div>

          {loading && <div className="report-loading"><span className="loader-ring" /> Executando preflight estrutural…</div>}

          {!loading && report && tab === "preflight" && (
            <>
              <div className="production-summary-grid">
                <div><span>OutputIntent</span><strong>{report.hasOutputIntent ? "Sim" : "Não"}</strong></div>
                <div><span>RGB</span><strong>{report.usesDeviceRgb ? "DeviceRGB" : "—"}</strong></div>
                <div><span>CMYK</span><strong>{report.usesDeviceCmyk ? "DeviceCMYK" : "—"}</strong></div>
                <div><span>ICC</span><strong>{report.usesIcc ? "Detectado" : "—"}</strong></div>
                <div><span>Transparência</span><strong>{report.hasTransparency ? "Sim" : "Não"}</strong></div>
                <div><span>Overprint</span><strong>{report.hasOverprint ? "Sim" : "Não"}</strong></div>
                <div><span>Spot colors</span><strong>{report.spotColors.length}</strong></div>
                <div><span>Fontes não embutidas</span><strong>{unembedded}</strong></div>
              </div>

              {report.spotColors.length > 0 && (
                <div className="spot-color-list">
                  <strong>Cores especiais</strong>
                  <div>{report.spotColors.map((name) => <span key={name}>{name}</span>)}</div>
                </div>
              )}

              <div className="preflight-warnings">
                {report.warnings.length === 0
                  ? <div className="preflight-ok"><SevenIcon name="shield" /><span>Nenhum alerta estrutural básico detectado.</span></div>
                  : report.warnings.map((warning, index) => (
                    <div key={index}><SevenIcon name="comment" /><span>{warning}</span></div>
                  ))}
              </div>
            </>
          )}

          {!loading && report && tab === "fonts" && (
            <div className="preflight-table-wrap">
              <table className="preflight-table">
                <thead><tr><th>Fonte</th><th>Tipo</th><th>Embutida</th><th>Subset</th><th>Objeto</th></tr></thead>
                <tbody>
                  {report.fonts.map((font) => (
                    <tr key={font.objectId}>
                      <td>{font.name}</td>
                      <td>{font.subtype || "—"}</td>
                      <td>{font.embedded ? "Sim" : "Não"}</td>
                      <td>{font.subset ? "Sim" : "Não"}</td>
                      <td>{font.objectId}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!report.fonts.length && <div className="empty-panel">Nenhum objeto /Font listado.</div>}
            </div>
          )}

          {!loading && report && tab === "pages" && (
            <>
              <div className="page-box-editor">
                <div className="two-column-fields">
                  <label className="workflow-field"><span>Da página</span><input type="number" min={1} max={pageCount} value={pageStart} onChange={(e) => setPageStart(Math.max(1, Math.min(pageCount, Number(e.target.value) || 1)))} /></label>
                  <label className="workflow-field"><span>Até</span><input type="number" min={pageStart} max={pageCount} value={pageEnd} onChange={(e) => setPageEnd(Math.max(pageStart, Math.min(pageCount, Number(e.target.value) || pageStart)))} /></label>
                </div>
                <div className="two-column-fields">
                  <label className="workflow-field"><span>TrimBox inset</span><div className="measurement-input"><input type="number" min={0} step={0.1} value={trimMm} onChange={(e) => setTrimMm(Math.max(0, Number(e.target.value) || 0))} /><small>mm</small></div></label>
                  <label className="workflow-field"><span>BleedBox inset</span><div className="measurement-input"><input type="number" min={0} max={trimMm} step={0.1} value={bleedMm} onChange={(e) => setBleedMm(Math.max(0, Math.min(trimMm, Number(e.target.value) || 0)))} /><small>mm</small></div></label>
                </div>
                <label className="toggle-row"><input type="checkbox" checked={cropToTrim} onChange={(e) => setCropToTrim(e.target.checked)} /><span><strong>CropBox = TrimBox</strong><small>Útil para revisar a área final; não altera MediaBox.</small></span></label>
                <div className="organizer-note"><SevenIcon name="pages" /><span>O inset é medido para dentro do MediaBox. Ex.: MediaBox inclui 3 mm de sangria → TrimBox inset 3 mm e BleedBox inset 0 mm.</span></div>
                <button className="primary-button workflow-submit" disabled={pageStart > pageEnd || bleedMm > trimMm} onClick={applyBoxes}><SevenIcon name="edit" /> Aplicar boxes à sessão</button>
              </div>

              <div className="preflight-table-wrap">
                <table className="preflight-table page-box-table">
                  <thead><tr><th>Pág.</th><th>Tamanho</th><th>MediaBox</th><th>TrimBox</th><th>BleedBox</th><th>CropBox</th></tr></thead>
                  <tbody>{report.pages.map((item) => (
                    <tr key={item.pageIndex}>
                      <td>{item.pageIndex + 1}</td>
                      <td>{mm(item.widthPt)} × {mm(item.heightPt)} mm</td>
                      <td>{boxText(item.mediaBox)}</td>
                      <td>{boxText(item.trimBox)}</td>
                      <td>{boxText(item.bleedBox)}</td>
                      <td>{boxText(item.cropBox)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
