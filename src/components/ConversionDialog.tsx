import { useMemo, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { Capabilities, WatchFolderConfig, WatchFolderEvent } from "../types";
import { SevenIcon } from "./SevenIcon";

interface ConversionDialogProps {
  capabilities: Capabilities | null;
  currentPdf?: string;
  watchFolders: WatchFolderConfig[];
  watchFolderEvents: WatchFolderEvent[];
  onClose: () => void;
  onConvertToPdf: (input: string, outputDirectory: string) => void;
  onBatchConvertToPdf: (inputs: string[], outputDirectory: string) => void;
  onExport: (input: string, output: string, format: "png" | "jpeg" | "tiff" | "txt" | "ps", dpi?: number) => void;
  onUpsertWatchFolder: (config: WatchFolderConfig) => void;
  onToggleWatchFolder: (id: string, enabled: boolean) => void;
  onRemoveWatchFolder: (id: string) => void;
}

const defaultExtensions = [
  "doc", "docx", "xls", "xlsx", "ppt", "pptx",
  "odt", "ods", "odp", "rtf", "txt", "html", "htm",
];

export function ConversionDialog({
  capabilities,
  currentPdf,
  watchFolders,
  watchFolderEvents,
  onClose,
  onConvertToPdf,
  onBatchConvertToPdf,
  onExport,
  onUpsertWatchFolder,
  onToggleWatchFolder,
  onRemoveWatchFolder,
}: ConversionDialogProps) {
  const [mode, setMode] = useState<"to-pdf" | "from-pdf" | "watch">(currentPdf ? "from-pdf" : "to-pdf");
  const [format, setFormat] = useState<"png" | "jpeg" | "tiff" | "txt" | "ps">("png");
  const [dpi, setDpi] = useState(150);

  const [watchId, setWatchId] = useState("");
  const [watchName, setWatchName] = useState("");
  const [watchInput, setWatchInput] = useState("");
  const [watchOutput, setWatchOutput] = useState("");
  const [watchRecursive, setWatchRecursive] = useState(false);
  const [watchEnabled, setWatchEnabled] = useState(true);
  const [watchPreset, setWatchPreset] = useState<WatchFolderConfig["preset"]>("standard");
  const [watchExtensions, setWatchExtensions] = useState<string[]>(defaultExtensions);

  const convertToPdf = async () => {
    const selected = await open({
      title: "Selecionar documento(s) para converter",
      multiple: true,
      directory: false,
      filters: [{ name: "Documentos", extensions: defaultExtensions }],
    });
    const inputs = Array.isArray(selected) ? selected : typeof selected === "string" ? [selected] : [];
    if (!inputs.length) return;
    const outputDirectory = await open({ title: "Pasta de saída", directory: true, multiple: false });
    if (typeof outputDirectory !== "string") return;
    if (inputs.length === 1) onConvertToPdf(inputs[0], outputDirectory);
    else onBatchConvertToPdf(inputs, outputDirectory);
  };

  const exportPdf = async () => {
    let input = currentPdf;
    if (!input) {
      const selected = await open({
        title: "Selecionar PDF",
        multiple: false,
        directory: false,
        filters: [{ name: "Documento PDF", extensions: ["pdf"] }],
      });
      if (typeof selected !== "string") return;
      input = selected;
    }

    if (format === "png" || format === "jpeg" || format === "tiff") {
      const folder = await open({ title: "Pasta para páginas exportadas", directory: true, multiple: false });
      if (typeof folder !== "string") return;
      onExport(input, folder, format, dpi);
      return;
    }

    const output = await save({
      title: format === "txt" ? "Exportar texto" : "Exportar PostScript",
      defaultPath: format === "txt" ? "Seven-Reader.txt" : "Seven-Reader.ps",
      filters: [{ name: format === "txt" ? "Texto" : "PostScript", extensions: [format] }],
    });
    if (!output) return;
    onExport(input, output, format);
  };

  const chooseWatchInput = async () => {
    const selected = await open({ title: "Pasta monitorada", directory: true, multiple: false });
    if (typeof selected === "string") {
      setWatchInput(selected);
      if (!watchName.trim()) setWatchName(selected.replace(/\\/g, "/").split("/").filter(Boolean).at(-1) || "Watch Folder");
    }
  };

  const chooseWatchOutput = async () => {
    const selected = await open({ title: "Pasta de saída dos PDFs", directory: true, multiple: false });
    if (typeof selected === "string") setWatchOutput(selected);
  };

  const resetWatchForm = () => {
    setWatchId("");
    setWatchName("");
    setWatchInput("");
    setWatchOutput("");
    setWatchRecursive(false);
    setWatchEnabled(true);
    setWatchPreset("standard");
    setWatchExtensions(defaultExtensions);
  };

  const editWatch = (config: WatchFolderConfig) => {
    setWatchId(config.id);
    setWatchName(config.name);
    setWatchInput(config.inputDirectory);
    setWatchOutput(config.outputDirectory);
    setWatchRecursive(config.recursive);
    setWatchEnabled(config.enabled);
    setWatchPreset(config.preset);
    setWatchExtensions(config.extensions);
  };

  const saveWatch = () => {
    if (!watchName.trim() || !watchInput || !watchOutput) return;
    onUpsertWatchFolder({
      id: watchId,
      name: watchName.trim(),
      inputDirectory: watchInput,
      outputDirectory: watchOutput,
      recursive: watchRecursive,
      enabled: watchEnabled,
      preset: watchPreset,
      extensions: watchExtensions,
    });
    resetWatchForm();
  };

  const toggleExtension = (extension: string) => {
    setWatchExtensions((current) =>
      current.includes(extension)
        ? current.filter((value) => value !== extension)
        : [...current, extension],
    );
  };

  const eventsByWatcher = useMemo(() => {
    const grouped = new Map<string, WatchFolderEvent[]>();
    for (const event of watchFolderEvents) {
      const items = grouped.get(event.watcherId) ?? [];
      items.push(event);
      grouped.set(event.watcherId, items.slice(0, 6));
    }
    return grouped;
  }, [watchFolderEvents]);

  const imageAvailable = Boolean(capabilities?.ghostscript.available);
  const textAvailable = Boolean(capabilities?.pdftotext.available);
  const officeAvailable = Boolean(capabilities?.office.available);

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="workflow-dialog conversion-dialog--wide" role="dialog" aria-modal="true" aria-labelledby="conversion-title">
        <header className="organizer-head">
          <div><span className="eyebrow">CONVERSÃO</span><h2 id="conversion-title">Converter documentos</h2><p>Processamento local, usando apenas conversores detectados no dispositivo.</p></div>
          <button className="icon-button" onClick={onClose} aria-label="Fechar"><SevenIcon name="close" /></button>
        </header>
        <div className="workflow-tabs">
          <button className={mode === "to-pdf" ? "active" : ""} onClick={() => setMode("to-pdf")}>Arquivo → PDF</button>
          <button className={mode === "from-pdf" ? "active" : ""} onClick={() => setMode("from-pdf")}>PDF → outro formato</button>
          <button className={mode === "watch" ? "active" : ""} onClick={() => setMode("watch")}>Pastas monitoradas</button>
        </div>
        <div className="workflow-body">
          {mode === "to-pdf" ? (
            <div className="workflow-feature">
              <span className="feature-icon"><SevenIcon name="convert" /></span>
              <div><h3>Office, OpenDocument, RTF, texto e HTML</h3><p>Selecione um ou vários arquivos. Em lote, a fila processa um documento por vez para manter o aplicativo responsivo.</p></div>
              <button className="primary-button" disabled={!officeAvailable} onClick={() => void convertToPdf()}>Selecionar arquivo(s)</button>
              {!officeAvailable && <small className="dependency-note">LibreOffice não detectado.</small>}
            </div>
          ) : mode === "from-pdf" ? (
            <>
              <div className="format-grid">
                {([
                  ["png", "PNG", imageAvailable],
                  ["jpeg", "JPEG", imageAvailable],
                  ["tiff", "TIFF", imageAvailable],
                  ["txt", "Texto", textAvailable],
                  ["ps", "PostScript", imageAvailable],
                ] as const).map(([id, label, available]) => (
                  <button key={id} className={format === id ? "format-card active" : "format-card"} disabled={!available} onClick={() => setFormat(id)}>
                    <SevenIcon name={id === "txt" ? "text" : "pages"} /><strong>{label}</strong><small>{available ? "Disponível" : "Conversor ausente"}</small>
                  </button>
                ))}
              </div>
              {(format === "png" || format === "jpeg" || format === "tiff") && (
                <label className="workflow-field">
                  <span>Resolução</span>
                  <div className="range-row"><input type="range" min={72} max={600} step={6} value={dpi} onChange={(event) => setDpi(Number(event.target.value))} /><strong>{dpi} DPI</strong></div>
                </label>
              )}
              <button className="primary-button workflow-submit" onClick={() => void exportPdf()}><SevenIcon name="open" /> Escolher saída</button>
            </>
          ) : (
            <>
              {!officeAvailable && (
                <div className="organizer-note organizer-note--warning">
                  <SevenIcon name="convert" />
                  <span>LibreOffice não foi detectado; Watch Folders ficam indisponíveis até o conversor estar instalado.</span>
                </div>
              )}

              <section className="watch-folder-editor">
                <div className="section-mini-title">{watchId ? "Editar Watch Folder" : "Novo Watch Folder"}</div>
                <label className="workflow-field"><span>Nome</span><input value={watchName} onChange={(event) => setWatchName(event.target.value)} placeholder="Ex.: Entrada comercial" /></label>
                <div className="watch-folder-paths">
                  <button className="secondary-light-button choose-wide" onClick={() => void chooseWatchInput()}><SevenIcon name="folder" /> {watchInput || "Selecionar pasta monitorada"}</button>
                  <button className="secondary-light-button choose-wide" onClick={() => void chooseWatchOutput()}><SevenIcon name="folder" /> {watchOutput || "Selecionar pasta de saída"}</button>
                </div>
                <div className="three-column-fields">
                  <label className="workflow-field">
                    <span>Preset</span>
                    <select value={watchPreset} onChange={(event) => setWatchPreset(event.target.value as WatchFolderConfig["preset"])}>
                      <option value="standard">Padrão · LibreOffice</option>
                      <option value="compact" disabled={!imageAvailable}>Compacto · + Ghostscript ebook</option>
                      <option value="print" disabled={!imageAvailable}>Impressão · + Ghostscript printer</option>
                    </select>
                  </label>
                  <label className="toggle-row"><input type="checkbox" checked={watchRecursive} onChange={(event) => setWatchRecursive(event.target.checked)} /><span><strong>Subpastas</strong><small>Monitora recursivamente.</small></span></label>
                  <label className="toggle-row"><input type="checkbox" checked={watchEnabled} onChange={(event) => setWatchEnabled(event.target.checked)} /><span><strong>Ativo</strong><small>Começa a monitorar após salvar.</small></span></label>
                </div>

                <div className="watch-extension-grid">
                  {defaultExtensions.map((extension) => (
                    <label key={extension} className={watchExtensions.includes(extension) ? "active" : ""}>
                      <input type="checkbox" checked={watchExtensions.includes(extension)} onChange={() => toggleExtension(extension)} />
                      <span>.{extension}</span>
                    </label>
                  ))}
                </div>

                <div className="watch-folder-editor-actions">
                  {watchId && <button className="secondary-light-button" onClick={resetWatchForm}>Cancelar edição</button>}
                  <button className="primary-button" disabled={!officeAvailable || !watchName.trim() || !watchInput || !watchOutput || !watchExtensions.length} onClick={saveWatch}>
                    <SevenIcon name="save" /> {watchId ? "Atualizar Watch Folder" : "Adicionar Watch Folder"}
                  </button>
                </div>
              </section>

              <section className="watch-folder-list">
                <div className="section-mini-title">Configuradas ({watchFolders.length})</div>
                {!watchFolders.length && <div className="empty-panel">Nenhuma pasta monitorada configurada.</div>}
                {watchFolders.map((config) => {
                  const events = eventsByWatcher.get(config.id) ?? [];
                  return (
                    <article className={config.enabled ? "watch-folder-row active" : "watch-folder-row"} key={config.id}>
                      <header>
                        <span className="watch-folder-state" />
                        <div>
                          <strong>{config.name}</strong>
                          <small>{config.inputDirectory} → {config.outputDirectory}</small>
                        </div>
                        <span className="watch-preset-badge">{config.preset}</span>
                      </header>
                      <div className="watch-folder-meta">
                        <span>{config.recursive ? "Com subpastas" : "Somente pasta raiz"}</span>
                        <span>{config.extensions.map((value) => `.${value}`).join(", ")}</span>
                      </div>
                      {events.length > 0 && (
                        <div className="watch-event-list">
                          {events.slice(0, 3).map((event, index) => (
                            <div key={`${event.state}-${event.path ?? ""}-${index}`}>
                              <b>{event.state}</b><span>{event.detail}</span>
                              {event.path && <small>{event.path}</small>}
                            </div>
                          ))}
                        </div>
                      )}
                      <footer>
                        <label className="toggle-row compact-toggle"><input type="checkbox" checked={config.enabled} onChange={(event) => onToggleWatchFolder(config.id, event.target.checked)} /><span><strong>{config.enabled ? "Monitorando" : "Desativado"}</strong></span></label>
                        <button className="secondary-light-button" onClick={() => editWatch(config)}>Editar</button>
                        <button className="danger-quiet" onClick={() => onRemoveWatchFolder(config.id)}>Remover</button>
                      </footer>
                    </article>
                  );
                })}
              </section>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
