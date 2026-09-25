import { useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import type { Capabilities, OcrOptions, OcrWord } from "../types";
import { SevenIcon } from "./SevenIcon";

interface OcrDialogProps {
  capabilities: Capabilities | null;
  documentPath?: string;
  documentId?: string;
  pageIndex: number;
  suspects: OcrWord[];
  loadingReview: boolean;
  onClose: () => void;
  onRunOcr: (output: string, options: OcrOptions) => void;
  onReview: (language: string, threshold: number) => void;
  onScan: (output: string, dpi: number) => void;
}

export function OcrDialog({
  capabilities,
  documentPath,
  documentId,
  pageIndex,
  suspects,
  loadingReview,
  onClose,
  onRunOcr,
  onReview,
  onScan,
}: OcrDialogProps) {
  const [tab, setTab] = useState<"ocr" | "review" | "scan">("ocr");
  const [language, setLanguage] = useState("por+eng");
  const [deskew, setDeskew] = useState(true);
  const [rotatePages, setRotatePages] = useState(true);
  const [outputType, setOutputType] = useState<OcrOptions["outputType"]>("auto");
  const [mode, setMode] = useState<OcrOptions["mode"]>("skip");
  const [threshold, setThreshold] = useState(80);
  const [scanDpi, setScanDpi] = useState(300);

  const runOcr = async () => {
    if (!documentPath) return;
    const output = await save({ title: "Salvar PDF com OCR", defaultPath: documentPath.replace(/\.pdf$/i, "-ocr.pdf"), filters: [{ name: "Documento PDF", extensions: ["pdf"] }] });
    if (!output) return;
    onRunOcr(output, { language, deskew, rotatePages, outputType, mode });
  };

  const scan = async () => {
    const output = await save({ title: "Salvar digitalização", defaultPath: "Digitalizacao-Seven.pdf", filters: [{ name: "Documento PDF", extensions: ["pdf"] }] });
    if (output) onScan(output, scanDpi);
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="workflow-dialog ocr-dialog" role="dialog" aria-modal="true">
        <header className="organizer-head"><div><span className="eyebrow">DIGITALIZAR E OCR</span><h2>Reconhecimento local</h2><p>OCR tradicional, camada de texto pesquisável e revisão de confiança.</p></div><button className="icon-button" onClick={onClose}><SevenIcon name="close" /></button></header>
        <div className="workflow-tabs">
          <button className={tab === "ocr" ? "active" : ""} onClick={() => setTab("ocr")}>OCR</button>
          <button className={tab === "review" ? "active" : ""} onClick={() => setTab("review")}>Revisar suspeitas</button>
          <button className={tab === "scan" ? "active" : ""} onClick={() => setTab("scan")}>Scanner</button>
        </div>
        <div className="workflow-body">
          {tab === "ocr" && (
            <>
              <label className="workflow-field"><span>Idiomas Tesseract</span><input value={language} onChange={(event) => setLanguage(event.target.value)} spellCheck={false} /><small>Ex.: por+eng, eng, spa.</small></label>
              <div className="two-column-fields">
                <label className="workflow-field"><span>Tipo de saída</span><select value={outputType} onChange={(event) => setOutputType(event.target.value as OcrOptions["outputType"])}><option value="auto">Automático / PDF-A quando seguro</option><option value="pdf">PDF normal</option><option value="pdfa">PDF/A-2b</option><option value="pdfa-1">PDF/A-1b</option><option value="pdfa-2">PDF/A-2b explícito</option><option value="pdfa-3">PDF/A-3b</option></select></label>
                <label className="workflow-field"><span>Texto existente</span><select value={mode} onChange={(event) => setMode(event.target.value as OcrOptions["mode"])}><option value="skip">Pular páginas com texto</option><option value="redo">Refazer camada OCR</option><option value="force">Forçar OCR completo</option></select></label>
              </div>
              <label className="toggle-row"><input type="checkbox" checked={deskew} onChange={(event) => setDeskew(event.target.checked)} /><span><strong>Corrigir inclinação</strong><small>Deskew antes do reconhecimento.</small></span></label>
              <label className="toggle-row"><input type="checkbox" checked={rotatePages} onChange={(event) => setRotatePages(event.target.checked)} /><span><strong>Detectar rotação</strong><small>Corrige orientação automaticamente.</small></span></label>
              <button className="primary-button workflow-submit" disabled={!capabilities?.ocr.available || !documentPath} onClick={() => void runOcr()}><SevenIcon name="ocr" /> Executar OCR</button>
            </>
          )}
          {tab === "review" && (
            <>
              <div className="two-column-fields"><label className="workflow-field"><span>Idioma</span><input value={language} onChange={(event) => setLanguage(event.target.value)} /></label><label className="workflow-field"><span>Confiança mínima</span><div className="range-row"><input type="range" min={10} max={99} value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} /><strong>{threshold}%</strong></div></label></div>
              <button className="secondary-light-button choose-wide" disabled={!capabilities?.tesseract.available || !documentId} onClick={() => onReview(language, threshold)}><SevenIcon name="search" /> Analisar página {pageIndex + 1}</button>
              {loadingReview && <div className="report-loading"><span className="loader-ring" /> Analisando confiança…</div>}
              {!loadingReview && suspects.length > 0 && <div className="suspect-list">{suspects.map((word, index) => <div className="suspect-row" key={`${word.text}-${word.left}-${index}`}><strong>{word.text}</strong><span>{word.confidence.toFixed(1)}%</span><small>x {word.left} · y {word.top} · {word.width}×{word.height}</small></div>)}</div>}
              {!loadingReview && suspects.length === 0 && <div className="empty-panel">Nenhuma palavra abaixo do limiar carregada. Execute a análise.</div>}
            </>
          )}
          {tab === "scan" && (
            <>
              <label className="workflow-field"><span>Resolução do scanner</span><div className="range-row"><input type="range" min={75} max={600} step={25} value={scanDpi} onChange={(event) => setScanDpi(Number(event.target.value))} /><strong>{scanDpi} DPI</strong></div></label>
              <div className="organizer-note"><SevenIcon name="scan" /><span>Linux usa SANE/scanimage. Em outros sistemas o botão permanece bloqueado até o adaptador nativo correspondente estar disponível.</span></div>
              <button className="primary-button workflow-submit" disabled={!capabilities?.scanner.available} onClick={() => void scan()}><SevenIcon name="scan" /> Digitalizar uma página</button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
