import { useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
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
  onRunBatchOcr: (inputs: string[], outputDirectory: string, options: OcrOptions) => void;
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
  onRunBatchOcr,
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
  const [pageScope, setPageScope] = useState<"all" | "current" | "range">("all");
  const [pageRange, setPageRange] = useState("");
  const [clean, setClean] = useState(false);
  const [cleanFinal, setCleanFinal] = useState(false);
  const [removeBackground, setRemoveBackground] = useState(false);
  const [oversampleEnabled, setOversampleEnabled] = useState(false);
  const [oversample, setOversample] = useState(300);
  const [optimize, setOptimize] = useState<0 | 1 | 2 | 3>(1);
  const [rotatePagesThreshold, setRotatePagesThreshold] = useState(14);
  const [sidecarEnabled, setSidecarEnabled] = useState(false);
  const [scanDpi, setScanDpi] = useState(300);

  const buildOptions = (sidecar?: string): OcrOptions => ({
    language,
    deskew,
    rotatePages,
    outputType,
    mode,
    sidecar,
    pageRange:
      pageScope === "current" ? String(pageIndex + 1)
        : pageScope === "range" ? pageRange.trim() || undefined
          : undefined,
    clean,
    cleanFinal,
    removeBackground,
    oversample: oversampleEnabled ? oversample : undefined,
    optimize,
    rotatePagesThreshold,
  });

  const runOcr = async () => {
    if (!documentPath) return;
    const output = await save({
      title: "Salvar PDF com OCR",
      defaultPath: documentPath.replace(/\.pdf$/i, "-ocr.pdf"),
      filters: [{ name: "Documento PDF", extensions: ["pdf"] }],
    });
    if (!output) return;

    let sidecar: string | undefined;
    if (sidecarEnabled) {
      const selected = await save({
        title: "Salvar texto reconhecido",
        defaultPath: documentPath.replace(/\.pdf$/i, "-ocr.txt"),
        filters: [{ name: "Texto", extensions: ["txt"] }],
      });
      if (!selected) return;
      sidecar = selected;
    }
    onRunOcr(output, buildOptions(sidecar));
  };

  const runBatchOcr = async () => {
    const selected = await open({
      title: "Selecionar PDFs para OCR em lote",
      multiple: true,
      directory: false,
      filters: [{ name: "Documentos PDF", extensions: ["pdf"] }],
    });
    const inputs = Array.isArray(selected) ? selected : typeof selected === "string" ? [selected] : [];
    if (!inputs.length) return;
    const outputDirectory = await open({ title: "Pasta de saída do OCR", directory: true, multiple: false });
    if (typeof outputDirectory !== "string") return;
    onRunBatchOcr(inputs, outputDirectory, { ...buildOptions(), pageRange: undefined, sidecar: undefined });
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
              <section className="ocr-section">
                <div className="section-mini-title">Páginas</div>
                <div className="segmented">
                  <button className={pageScope === "all" ? "active" : ""} onClick={() => setPageScope("all")}>Documento inteiro</button>
                  <button className={pageScope === "current" ? "active" : ""} onClick={() => setPageScope("current")}>Página {pageIndex + 1}</button>
                  <button className={pageScope === "range" ? "active" : ""} onClick={() => setPageScope("range")}>Intervalo</button>
                </div>
                {pageScope === "range" && (
                  <label className="workflow-field">
                    <span>Intervalo</span>
                    <input value={pageRange} onChange={(event) => setPageRange(event.target.value)} placeholder="1-5,8,11-14" spellCheck={false} />
                    <small>Use páginas e intervalos separados por vírgula.</small>
                  </label>
                )}
              </section>

              <section className="ocr-section">
                <div className="section-mini-title">Pré-processamento</div>
                <label className="toggle-row"><input type="checkbox" checked={deskew} onChange={(event) => setDeskew(event.target.checked)} /><span><strong>Corrigir inclinação</strong><small>Deskew antes do reconhecimento.</small></span></label>
                <label className="toggle-row"><input type="checkbox" checked={rotatePages} onChange={(event) => setRotatePages(event.target.checked)} /><span><strong>Detectar rotação</strong><small>Corrige orientação automaticamente.</small></span></label>
                {rotatePages && (
                  <label className="workflow-field"><span>Confiança para rotação</span><div className="range-row"><input type="range" min={0} max={100} step={1} value={rotatePagesThreshold} onChange={(event) => setRotatePagesThreshold(Number(event.target.value))} /><strong>{rotatePagesThreshold}</strong></div></label>
                )}
                <label className="toggle-row"><input type="checkbox" checked={clean} disabled={!capabilities?.unpaper.available} onChange={(event) => setClean(event.target.checked)} /><span><strong>Despeckle / limpar para OCR</strong><small>Usa unpaper somente na imagem enviada ao OCR.</small></span></label>
                <label className="toggle-row"><input type="checkbox" checked={cleanFinal} disabled={!capabilities?.unpaper.available} onChange={(event) => setCleanFinal(event.target.checked)} /><span><strong>Aplicar limpeza ao PDF final</strong><small>Usa unpaper também na imagem final; requer revisão visual.</small></span></label>
                {!capabilities?.unpaper.available && <small className="dependency-note">unpaper não detectado; limpeza/despeckle permanece desabilitada.</small>}
                <label className="toggle-row"><input type="checkbox" checked={removeBackground} onChange={(event) => setRemoveBackground(event.target.checked)} /><span><strong>Remover fundo</strong><small>Útil em scans com papel manchado; pode afetar fotografias coloridas.</small></span></label>
                <label className="toggle-row"><input type="checkbox" checked={oversampleEnabled} onChange={(event) => setOversampleEnabled(event.target.checked)} /><span><strong>Oversample antes do OCR</strong><small>Aumenta a resolução usada pelo reconhecedor.</small></span></label>
                {oversampleEnabled && <label className="workflow-field"><span>Oversample</span><div className="range-row"><input type="range" min={72} max={1200} step={12} value={oversample} onChange={(event) => setOversample(Number(event.target.value))} /><strong>{oversample} DPI</strong></div></label>}
              </section>

              <section className="ocr-section">
                <div className="section-mini-title">Saída e otimização</div>
                <label className="workflow-field"><span>Nível de otimização</span><select value={optimize} onChange={(event) => setOptimize(Number(event.target.value) as 0 | 1 | 2 | 3)}><option value={0}>0 · sem otimização</option><option value={1}>1 · lossless padrão</option><option value={2}>2 · maior compactação</option><option value={3}>3 · compactação agressiva</option></select></label>
                <label className="toggle-row"><input type="checkbox" checked={sidecarEnabled} onChange={(event) => setSidecarEnabled(event.target.checked)} /><span><strong>Gerar TXT sidecar</strong><small>Salva o texto reconhecido separadamente no OCR deste PDF.</small></span></label>
              </section>

              <div className="workflow-submit-group">
                <button className="secondary-light-button" disabled={!capabilities?.ocr.available} onClick={() => void runBatchOcr()}><SevenIcon name="pages" /> OCR em vários arquivos</button>
                <button className="primary-button" disabled={!capabilities?.ocr.available || !documentPath} onClick={() => void runOcr()}><SevenIcon name="ocr" /> Executar neste PDF</button>
              </div>
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
              <div className="organizer-note"><SevenIcon name="scan" /><span>Linux usa SANE/scanimage. Windows usa WIA quando o driver do scanner está disponível. A captura é local.</span></div>
              <button className="primary-button workflow-submit" disabled={!capabilities?.scanner.available} onClick={() => void scan()}><SevenIcon name="scan" /> Digitalizar uma página</button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
