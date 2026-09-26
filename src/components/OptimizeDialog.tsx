import { useEffect, useMemo, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import type { OptimizationAudit, OptimizeOptions } from "../types";
import { SevenIcon } from "./SevenIcon";

interface OptimizeDialogProps {
  documentPath: string;
  audit: OptimizationAudit | null;
  loading: boolean;
  onClose: () => void;
  onAudit: () => void;
  onRun: (output: string, options: OptimizeOptions) => void;
}

interface SavedPreset {
  id: string;
  name: string;
  options: OptimizeOptions;
}

const KEY = "seven-reader:optimizer-presets:v1";

const defaultOptions: OptimizeOptions = {
  compatibility: "1.7",
  colorDpi: 150,
  grayscaleDpi: 150,
  monochromeDpi: 300,
  downsample: "bicubic",
  colorCompression: "jpeg",
  grayscaleCompression: "jpeg",
  jpegQuality: 82,
  embedFonts: true,
  subsetFonts: true,
  linearize: true,
  cleanup: true,
  removeJavascript: false,
  removeOpenActions: false,
  removeEmbeddedFiles: false,
  removeMetadata: false,
  removeXfa: false,
  removeAnnotations: false,
  removeForms: false,
  removeMultimedia: false,
};

function loadPresets(): SavedPreset[] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function bytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${(value / 1024 ** 3).toFixed(2)} GB`;
}

export function OptimizeDialog({
  documentPath,
  audit,
  loading,
  onClose,
  onAudit,
  onRun,
}: OptimizeDialogProps) {
  const [options, setOptions] = useState<OptimizeOptions>(defaultOptions);
  const [presets, setPresets] = useState<SavedPreset[]>(loadPresets);
  const [presetName, setPresetName] = useState("");

  useEffect(() => { onAudit(); }, []);
  useEffect(() => localStorage.setItem(KEY, JSON.stringify(presets)), [presets]);

  const estimatedSize = useMemo(() => {
    if (!audit) return null;
    const imageBytes = audit.imageStreamBytes;
    const nonImageBytes = Math.max(0, audit.fileSize - imageBytes);
    const dpiScale = Math.min(1, Math.max(0.08, (options.colorDpi / 300) ** 1.55));
    const qualityScale =
      options.colorCompression === "jpeg" || options.grayscaleCompression === "jpeg"
        ? Math.max(0.16, options.jpegQuality / 100)
        : 0.88;
    const imageEstimate = imageBytes * dpiScale * qualityScale;
    const cleanupScale = options.cleanup ? 0.93 : 1;
    const discardBytes =
      (options.removeEmbeddedFiles ? audit.embeddedFileBytes : 0)
      + (options.removeAnnotations || options.removeForms || options.removeMultimedia || options.removeMetadata ? audit.otherStreamBytes * 0.08 : 0);
    return Math.max(1024, (nonImageBytes + imageEstimate - discardBytes) * cleanupScale);
  }, [audit, options]);

  const categories = useMemo(() => audit ? [
    ["Imagens", audit.imageStreamBytes, `${audit.imageCount} imagem(ns)`],
    ["Fontes", audit.fontStreamBytes, `${audit.fontCount} stream(s)`],
    ["Anexos", audit.embeddedFileBytes, `${audit.embeddedFileCount} arquivo(s)`],
    ["Conteúdo de página", audit.pageContentBytes, "content streams"],
    ["Outros streams", audit.otherStreamBytes, "demais objetos"],
  ] as const : [], [audit]);

  const patch = <K extends keyof OptimizeOptions>(key: K, value: OptimizeOptions[K]) =>
    setOptions((current) => ({ ...current, [key]: value }));

  const execute = async () => {
    const output = await save({
      title: "Salvar PDF otimizado",
      defaultPath: documentPath.replace(/\.pdf$/i, "-otimizado.pdf"),
      filters: [{ name: "Documento PDF", extensions: ["pdf"] }],
    });
    if (output) onRun(output, options);
  };

  const savePreset = () => {
    const name = presetName.trim();
    if (!name) return;
    setPresets((current) => [
      ...current.filter((preset) => preset.name.toLocaleLowerCase() !== name.toLocaleLowerCase()),
      { id: `preset-${Date.now()}`, name, options },
    ]);
    setPresetName("");
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="optimizer-dialog" role="dialog" aria-modal="true">
        <header className="organizer-head">
          <div>
            <span className="eyebrow">OTIMIZADOR AVANÇADO</span>
            <h2>Compactação e Fast Web View</h2>
            <p>Auditoria local + pipeline Ghostscript/qpdf com parâmetros explícitos.</p>
          </div>
          <button className="icon-button" onClick={onClose}><SevenIcon name="close" /></button>
        </header>

        <div className="optimizer-layout">
          <aside className="optimizer-audit">
            <div className="section-heading section-heading--compact">
              <div><span className="eyebrow">AUDITORIA</span><h3>Uso de espaço</h3></div>
              <button className="icon-button" onClick={onAudit} title="Recalcular"><SevenIcon name="history" /></button>
            </div>
            {loading && <div className="report-loading"><span className="loader-ring" /> Analisando objetos…</div>}
            {!loading && audit && (
              <>
                <div className="audit-total"><span>Tamanho atual</span><strong>{bytes(audit.fileSize)}</strong><small>{audit.objectCount} objetos · {bytes(audit.streamBytes)} em streams</small></div>
                {estimatedSize !== null && (
                  <div className="audit-estimate">
                    <span>Estimativa com as opções atuais</span>
                    <strong>{bytes(Math.round(estimatedSize))}</strong>
                    <small>Estimativa heurística; o tamanho real só é conhecido após processar.</small>
                  </div>
                )}
                <div className="audit-categories">
                  {categories.map(([label, size, detail]) => (
                    <div key={label}><span>{label}<small>{detail}</small></span><strong>{bytes(size)}</strong></div>
                  ))}
                </div>
              </>
            )}
          </aside>

          <main className="optimizer-options">
            <div className="optimizer-presets">
              <button onClick={() => setOptions({ ...defaultOptions, colorDpi: 300, grayscaleDpi: 300, monochromeDpi: 600, jpegQuality: 92, linearize: false })}>Baixa compactação</button>
              <button onClick={() => setOptions(defaultOptions)}>Média</button>
              <button onClick={() => setOptions({ ...defaultOptions, colorDpi: 96, grayscaleDpi: 96, monochromeDpi: 200, jpegQuality: 65 })}>Alta compactação</button>
              {presets.map((preset) => (
                <button key={preset.id} onClick={() => setOptions(preset.options)}>{preset.name}</button>
              ))}
            </div>

            <section className="optimizer-section">
              <div className="section-mini-title">Compatibilidade e estrutura</div>
              <div className="two-column-fields">
                <label className="workflow-field"><span>Versão PDF alvo</span><select value={options.compatibility} onChange={(event) => patch("compatibility", event.target.value as OptimizeOptions["compatibility"])}><option value="1.4">PDF 1.4</option><option value="1.5">PDF 1.5</option><option value="1.6">PDF 1.6</option><option value="1.7">PDF 1.7</option><option value="2.0">PDF 2.0</option></select></label>
                <label className="toggle-row"><input type="checkbox" checked={options.linearize} onChange={(event) => patch("linearize", event.target.checked)} /><span><strong>Fast Web View</strong><small>Executa qpdf --linearize após a otimização.</small></span></label>
              </div>
              <label className="toggle-row"><input type="checkbox" checked={options.cleanup} onChange={(event) => patch("cleanup", event.target.checked)} /><span><strong>Clean Up estrutural</strong><small>Recomprime Flate em nível 9, gera object streams e compacta streams com qpdf.</small></span></label>
            </section>

            <section className="optimizer-section">
              <div className="section-mini-title">Imagens</div>
              <div className="three-column-fields">
                <label className="workflow-field"><span>Cor</span><input type="number" min={36} max={2400} value={options.colorDpi} onChange={(event) => patch("colorDpi", Math.max(36, Math.min(2400, Number(event.target.value) || 150)))} /><small>DPI</small></label>
                <label className="workflow-field"><span>Grayscale</span><input type="number" min={36} max={2400} value={options.grayscaleDpi} onChange={(event) => patch("grayscaleDpi", Math.max(36, Math.min(2400, Number(event.target.value) || 150)))} /><small>DPI</small></label>
                <label className="workflow-field"><span>Monocromática</span><input type="number" min={36} max={2400} value={options.monochromeDpi} onChange={(event) => patch("monochromeDpi", Math.max(36, Math.min(2400, Number(event.target.value) || 300)))} /><small>DPI</small></label>
              </div>
              <div className="three-column-fields">
                <label className="workflow-field"><span>Downsample</span><select value={options.downsample} onChange={(event) => patch("downsample", event.target.value as OptimizeOptions["downsample"])}><option value="bicubic">Bicúbico</option><option value="average">Average</option><option value="subsample">Subsampling</option></select></label>
                <label className="workflow-field"><span>Cor</span><select value={options.colorCompression} onChange={(event) => patch("colorCompression", event.target.value as OptimizeOptions["colorCompression"])}><option value="jpeg">JPEG</option><option value="flate">ZIP / Flate</option></select></label>
                <label className="workflow-field"><span>Grayscale</span><select value={options.grayscaleCompression} onChange={(event) => patch("grayscaleCompression", event.target.value as OptimizeOptions["grayscaleCompression"])}><option value="jpeg">JPEG</option><option value="flate">ZIP / Flate</option></select></label>
              </div>
              <label className="workflow-field"><span>Qualidade JPEG</span><div className="range-row"><input type="range" min={1} max={100} value={options.jpegQuality} onChange={(event) => patch("jpegQuality", Number(event.target.value))} /><strong>{options.jpegQuality}%</strong></div></label>
            </section>

            <section className="optimizer-section">
              <div className="section-mini-title">Fontes</div>
              <div className="two-column-fields">
                <label className="toggle-row"><input type="checkbox" checked={options.embedFonts} onChange={(event) => patch("embedFonts", event.target.checked)} /><span><strong>Incorporar fontes</strong><small>Solicita incorporação ao pdfwrite.</small></span></label>
                <label className="toggle-row"><input type="checkbox" checked={options.subsetFonts} onChange={(event) => patch("subsetFonts", event.target.checked)} /><span><strong>Subset fonts</strong><small>Reduz fontes incorporadas ao conjunto usado.</small></span></label>
              </div>
            </section>

            <section className="optimizer-section">
              <div className="section-mini-title">Discard User Data</div>
              <div className="optimizer-discard-grid">
                {([
                  ["removeJavascript", "JavaScript", "Remove /JS e árvores JavaScript."],
                  ["removeOpenActions", "Ações automáticas", "Remove OpenAction, AA, Launch e ações automáticas."],
                  ["removeEmbeddedFiles", "Anexos", "Remove referências a arquivos incorporados."],
                  ["removeMetadata", "Metadados", "Remove Info, XMP Metadata e PieceInfo."],
                  ["removeXfa", "XFA", "Remove pacotes XFA híbridos."],
                  ["removeAnnotations", "Comentários/anotações", "Remove anotações que não são widgets/multimídia."],
                  ["removeForms", "Formulários", "Remove widgets e AcroForm."],
                  ["removeMultimedia", "Multimídia/3D", "Remove RichMedia, 3D, Movie, Sound e Renditions."],
                ] as const).map(([key, label, detail]) => (
                  <label className="check-row" key={key}>
                    <input type="checkbox" checked={options[key]} onChange={(event) => patch(key, event.target.checked)} />
                    <span><strong>{label}</strong><small>{detail}</small></span>
                  </label>
                ))}
              </div>
              <div className="organizer-note organizer-note--warning">
                <SevenIcon name="shield" />
                <span>Itens marcados são removidos da cópia otimizada antes da compactação. O documento original permanece intacto.</span>
              </div>
            </section>

            <section className="optimizer-save-preset">
              <input value={presetName} onChange={(event) => setPresetName(event.target.value)} placeholder="Nome do preset" />
              <button className="secondary-light-button" disabled={!presetName.trim()} onClick={savePreset}><SevenIcon name="save" /> Salvar preset</button>
            </section>
          </main>
        </div>

        <footer className="organizer-actions">
          <button className="secondary-light-button" onClick={onClose}>Cancelar</button>
          <button className="primary-button" onClick={() => void execute()}><SevenIcon name="compress" /> Otimizar PDF</button>
        </footer>
      </section>
    </div>
  );
}
