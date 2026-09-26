import { useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { Capabilities, OcrLanguageDetection, OcrOptions, OcrWord, ScannedPage } from "../types";
import { nativeAssetUrl } from "../lib/native";
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
  onDetectLanguage: (candidates: string[]) => Promise<OcrLanguageDetection>;
  onScanPage: (dpi: number, colorMode: "color" | "gray" | "lineart") => Promise<ScannedPage>;
  onDeleteScanPages: (inputs: string[]) => Promise<void> | void;
  onFinalizeScan: (inputs: string[], output: string, dpi: number, options?: OcrOptions) => Promise<void> | void;
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
  onDetectLanguage,
  onScanPage,
  onDeleteScanPages,
  onFinalizeScan,
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
  const [scanColorMode, setScanColorMode] = useState<"color" | "gray" | "lineart">("color");
  const [scanPages, setScanPages] = useState<ScannedPage[]>([]);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanError, setScanError] = useState("");
  const [scanOcrAfter, setScanOcrAfter] = useState(true);
  const [detectingLanguage, setDetectingLanguage] = useState(false);
  const [languageDetection, setLanguageDetection] = useState<OcrLanguageDetection | null>(null);

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

  const detectLanguage = async () => {
    if (!documentId) return;
    const preferred = language
      .split("+")
      .map((value) => value.trim())
      .filter(Boolean);
    const candidates = Array.from(new Set([
      ...preferred,
      "por", "eng", "spa", "fra", "deu", "ita",
    ])).slice(0, 12);
    try {
      setDetectingLanguage(true);
      setLanguageDetection(null);
      const result = await onDetectLanguage(candidates);
      setLanguage(result.language);
      setLanguageDetection(result);
    } finally {
      setDetectingLanguage(false);
    }
  };

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

  const captureScan = async () => {
    try {
      setScanBusy(true);
      setScanError("");
      const captured = await onScanPage(scanDpi, scanColorMode);
      setScanPages((current) => [...current, captured]);
    } catch {
      setScanError("A captura não foi concluída. Verifique o scanner/driver e tente novamente.");
    } finally {
      setScanBusy(false);
    }
  };

  const removeScanPage = async (index: number) => {
    const page = scanPages[index];
    if (!page) return;
    await onDeleteScanPages([page.cachePath]);
    setScanPages((current) => current.filter((_, currentIndex) => currentIndex !== index));
  };

  const moveScanPage = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= scanPages.length) return;
    setScanPages((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const finishScan = async () => {
    if (!scanPages.length) return;
    const output = await save({
      title: "Salvar digitalização",
      defaultPath: "Digitalizacao-Seven.pdf",
      filters: [{ name: "Documento PDF", extensions: ["pdf"] }],
    });
    if (!output) return;
    try {
      setScanBusy(true);
      setScanError("");
      const options = scanOcrAfter
        ? { ...buildOptions(), pageRange: undefined, sidecar: undefined }
        : undefined;
      await onFinalizeScan(
        scanPages.map((page) => page.cachePath),
        output,
        scanDpi,
        options,
      );
      setScanPages([]);
    } catch {
      setScanError("Não foi possível finalizar a digitalização.");
    } finally {
      setScanBusy(false);
    }
  };

  const closeDialog = async () => {
    if (scanPages.length) {
      await onDeleteScanPages(scanPages.map((page) => page.cachePath));
      setScanPages([]);
    }
    onClose();
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && void closeDialog()}>
      <section className="workflow-dialog ocr-dialog" role="dialog" aria-modal="true">
        <header className="organizer-head"><div><span className="eyebrow">DIGITALIZAR E OCR</span><h2>Reconhecimento local</h2><p>OCR tradicional, camada de texto pesquisável e revisão de confiança.</p></div><button className="icon-button" onClick={() => void closeDialog()}><SevenIcon name="close" /></button></header>
        <div className="workflow-tabs">
          <button className={tab === "ocr" ? "active" : ""} onClick={() => setTab("ocr")}>OCR</button>
          <button className={tab === "review" ? "active" : ""} onClick={() => setTab("review")}>Revisar suspeitas</button>
          <button className={tab === "scan" ? "active" : ""} onClick={() => setTab("scan")}>Scanner</button>
        </div>
        <div className="workflow-body">
          {tab === "ocr" && (
            <>
              <div className="ocr-language-row">
                <label className="workflow-field"><span>Idiomas Tesseract</span><input value={language} onChange={(event) => { setLanguage(event.target.value); setLanguageDetection(null); }} spellCheck={false} /><small>Ex.: por+eng, eng, spa.</small></label>
                <button className="secondary-light-button" disabled={!capabilities?.tesseract.available || !documentId || detectingLanguage} onClick={() => void detectLanguage()}>
                  <SevenIcon name="search" /> {detectingLanguage ? "Detectando…" : "Detectar automaticamente"}
                </button>
              </div>
              {languageDetection && <div className="capability-inline ok"><SevenIcon name="ocr" /><div><strong>Idioma detectado: {languageDetection.language}</strong><small>Confiança média {languageDetection.confidence.toFixed(1)}% · {languageDetection.evaluated.length} modelo(s) avaliado(s).</small></div></div>}
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
              <div className="two-column-fields">
                <label className="workflow-field">
                  <span>Resolução do scanner</span>
                  <div className="range-row"><input type="range" min={75} max={600} step={25} value={scanDpi} onChange={(event) => setScanDpi(Number(event.target.value))} /><strong>{scanDpi} DPI</strong></div>
                </label>
                <label className="workflow-field">
                  <span>Modo de cor</span>
                  <select value={scanColorMode} onChange={(event) => setScanColorMode(event.target.value as typeof scanColorMode)}>
                    <option value="color">Colorido</option>
                    <option value="gray">Escala de cinza</option>
                    <option value="lineart">Preto e branco / Lineart</option>
                  </select>
                </label>
              </div>

              <label className="toggle-row">
                <input type="checkbox" checked={scanOcrAfter} disabled={!capabilities?.ocr.available} onChange={(event) => setScanOcrAfter(event.target.checked)} />
                <span><strong>Aplicar OCR após finalizar</strong><small>Usa as opções configuradas na aba OCR e gera camada pesquisável.</small></span>
              </label>

              <div className="organizer-note"><SevenIcon name="scan" /><span>Linux usa SANE/scanimage. Windows usa WIA. Cada captura fica no cache isolado até você finalizar ou fechar esta janela.</span></div>

              <button className="primary-button choose-wide" disabled={!capabilities?.scanner.available || scanBusy} onClick={() => void captureScan()}>
                <SevenIcon name="scan" /> {scanBusy ? "Digitalizando…" : scanPages.length ? "Digitalizar mais uma página" : "Digitalizar primeira página"}
              </button>

              {scanError && <div className="dependency-note">{scanError}</div>}

              {scanPages.length > 0 && (
                <>
                  <div className="section-mini-title">Páginas capturadas ({scanPages.length})</div>
                  <div className="scan-page-list">
                    {scanPages.map((scanPage, index) => (
                      <article className="scan-page-row" key={scanPage.cachePath}>
                        <img src={nativeAssetUrl(scanPage.cachePath)} alt={`Digitalização ${index + 1}`} />
                        <div>
                          <strong>Página {index + 1}</strong>
                          <small>{scanPage.width} × {scanPage.height} px · {scanDpi} DPI</small>
                        </div>
                        <div className="scan-page-actions">
                          <button disabled={index === 0 || scanBusy} onClick={() => moveScanPage(index, -1)} title="Mover para cima">↑</button>
                          <button disabled={index === scanPages.length - 1 || scanBusy} onClick={() => moveScanPage(index, 1)} title="Mover para baixo">↓</button>
                          <button className="danger-quiet" disabled={scanBusy} onClick={() => void removeScanPage(index)}>Remover</button>
                        </div>
                      </article>
                    ))}
                  </div>
                  <button className="primary-button workflow-submit" disabled={scanBusy} onClick={() => void finishScan()}>
                    <SevenIcon name={scanOcrAfter ? "ocr" : "save"} /> {scanOcrAfter ? "Finalizar e aplicar OCR" : "Finalizar PDF"}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
