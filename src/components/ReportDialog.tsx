import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { AccessibilityReport, CompareReport } from "../types";
import { SevenIcon } from "./SevenIcon";

interface ReportDialogProps {
  mode: "compare" | "accessibility";
  currentPdf: string;
  accessibility?: AccessibilityReport | null;
  comparison?: CompareReport | null;
  loading: boolean;
  onClose: () => void;
  onAccessibility: () => void;
  onCompare: (other: string) => void;
}

export function ReportDialog({ mode, currentPdf, accessibility, comparison, loading, onClose, onAccessibility, onCompare }: ReportDialogProps) {
  const [other, setOther] = useState("");

  const chooseOther = async () => {
    const selected = await open({ title: "Selecionar outra versão", multiple: false, directory: false, filters: [{ name: "Documento PDF", extensions: ["pdf"] }] });
    if (typeof selected === "string") { setOther(selected); onCompare(selected); }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="workflow-dialog report-dialog" role="dialog" aria-modal="true">
        <header className="organizer-head"><div><span className="eyebrow">{mode === "compare" ? "COMPARAÇÃO" : "ACESSIBILIDADE"}</span><h2>{mode === "compare" ? "Comparar documentos" : "Verificação de acessibilidade"}</h2><p>{currentPdf}</p></div><button className="icon-button" onClick={onClose}><SevenIcon name="close" /></button></header>
        <div className="workflow-body">
          {mode === "compare" ? (
            <>
              <button className="secondary-light-button choose-wide" onClick={() => void chooseOther()}><SevenIcon name="open" /> {other ? other : "Selecionar segunda versão"}</button>
              {loading && <div className="report-loading"><span className="loader-ring" /> Comparando texto página a página…</div>}
              {comparison && (
                <>
                  <div className="report-summary"><strong>{comparison.changedPages}</strong><span>páginas diferentes</span><small>{comparison.leftPages} páginas na versão atual · {comparison.rightPages} na outra</small></div>
                  <div className="compare-list">
                    {comparison.pages.length === 0 && <div className="empty-panel">Nenhuma diferença textual normalizada detectada.</div>}
                    {comparison.pages.map((item) => (
                      <article className="compare-item" key={item.pageIndex}><header>Página {item.pageIndex + 1}</header><div><p><b>Atual</b>{item.leftExcerpt || "Página ausente"}</p><p><b>Outra</b>{item.rightExcerpt || "Página ausente"}</p></div></article>
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              {!accessibility && !loading && <button className="primary-button" onClick={onAccessibility}><SevenIcon name="accessibility" /> Executar verificação</button>}
              {loading && <div className="report-loading"><span className="loader-ring" /> Inspecionando tags e propriedades…</div>}
              {accessibility && <div className="accessibility-list">{accessibility.checks.map((check) => (
                <div className={`accessibility-check ${check.passed ? "passed" : check.severity}`} key={check.id}><span>{check.passed ? "✓" : check.severity === "error" ? "!" : "i"}</span><div><strong>{check.label}</strong><small>{check.detail}</small></div></div>
              ))}</div>}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
