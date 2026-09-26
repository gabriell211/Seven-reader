import { useMemo, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import type {
  Capabilities,
  ConversionOptions,
  ConversionPreset,
  WatchFolderConfig,
  WatchFolderEvent,
} from "../types";
import {
  applyPdfStandardRules,
  BUILT_IN_CONVERSION_PRESETS,
  defaultConversionOptions,
  loadCustomConversionPresets,
  newConversionPresetId,
  normalizeConversionPreset,
  saveCustomConversionPresets,
} from "../lib/conversionPresets";
import { exportConversionPresets, importConversionPresets } from "../lib/native";
import { SevenIcon } from "./SevenIcon";

interface ConversionDialogProps {
  capabilities: Capabilities | null;
  currentPdf?: string;
  watchFolders: WatchFolderConfig[];
  watchFolderEvents: WatchFolderEvent[];
  onClose: () => void;
  onConvertToPdf: (input: string, outputDirectory: string, options?: ConversionOptions) => void;
  onBatchConvertToPdf: (inputs: string[], outputDirectory: string, options?: ConversionOptions) => void;
  onExport: (input: string, output: string, format: "png" | "jpeg" | "tiff" | "txt" | "ps", dpi?: number) => void;
  onUpsertWatchFolder: (config: WatchFolderConfig) => void;
  onToggleWatchFolder: (id: string, enabled: boolean) => void;
  onRemoveWatchFolder: (id: string) => void;
}

type Mode = "to-pdf" | "from-pdf" | "presets" | "watch";

const defaultExtensions = [
  "doc", "docx", "xls", "xlsx", "ppt", "pptx",
  "odt", "ods", "odp", "rtf", "txt", "html", "htm",
];

const standardLabel = (value: ConversionOptions["pdfStandard"]) => ({
  pdf: "PDF",
  "pdfa-1b": "PDF/A-1b",
  "pdfa-2b": "PDF/A-2b",
  "pdfa-3b": "PDF/A-3b",
  "pdfx-3": "PDF/X-3",
}[value]);

const colorLabel = (value: ConversionOptions["colorStrategy"]) => ({
  preserve: "Preservar",
  rgb: "RGB",
  cmyk: "CMYK",
  gray: "Gray",
}[value]);

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
  const [mode, setMode] = useState<Mode>(currentPdf ? "from-pdf" : "to-pdf");
  const [format, setFormat] = useState<"png" | "jpeg" | "tiff" | "txt" | "ps">("png");
  const [dpi, setDpi] = useState(150);
  const [customPresets, setCustomPresets] = useState<ConversionPreset[]>(loadCustomConversionPresets);
  const [selectedPresetId, setSelectedPresetId] = useState("standard");
  const [editingPreset, setEditingPreset] = useState<ConversionPreset | null>(null);
  const [presetNotice, setPresetNotice] = useState("");

  const [watchId, setWatchId] = useState("");
  const [watchName, setWatchName] = useState("");
  const [watchInput, setWatchInput] = useState("");
  const [watchOutput, setWatchOutput] = useState("");
  const [watchRecursive, setWatchRecursive] = useState(false);
  const [watchEnabled, setWatchEnabled] = useState(true);
  const [watchPreset, setWatchPreset] = useState("standard");
  const [watchExtensions, setWatchExtensions] = useState<string[]>(defaultExtensions);

  const presets = useMemo(
    () => [...BUILT_IN_CONVERSION_PRESETS, ...customPresets],
    [customPresets],
  );

  const watchPresetChoices = useMemo(() => {
    const result = [...presets];
    const known = new Set(result.map((preset) => preset.id));
    for (const config of watchFolders) {
      if (!known.has(config.preset) && config.conversionOptions) {
        result.push({
          id: config.preset,
          name: config.presetName || "Preset salvo no Watch Folder",
          builtIn: false,
          options: config.conversionOptions,
        });
        known.add(config.preset);
      }
    }
    return result;
  }, [presets, watchFolders]);

  const selectedPreset = presets.find((preset) => preset.id === selectedPresetId) ?? presets[0];
  const imageAvailable = Boolean(capabilities?.ghostscript.available);
  const textAvailable = Boolean(capabilities?.pdftotext.available);
  const officeAvailable = Boolean(capabilities?.office.available);
  const selectedNeedsGhostscript = selectedPreset.options.postProcess || selectedPreset.options.pdfStandard !== "pdf";
  const selectedNeedsOutputIntent = selectedPreset.options.pdfStandard !== "pdf";
  const selectedPresetReady =
    officeAvailable
    && (!selectedNeedsGhostscript || imageAvailable)
    && (!selectedNeedsOutputIntent || Boolean(selectedPreset.options.outputProfile));
  const editingPresetReady = Boolean(
    editingPreset?.name.trim()
    && (editingPreset.options.pdfStandard === "pdf" || editingPreset.options.outputProfile),
  );

  const persistCustomPresets = (items: ConversionPreset[]) => {
    const normalized = items.map((preset) => ({ ...normalizeConversionPreset(preset), builtIn: false }));
    setCustomPresets(normalized);
    saveCustomConversionPresets(normalized);
  };

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
    const options = selectedPreset.options;
    if (inputs.length === 1) onConvertToPdf(inputs[0], outputDirectory, options);
    else onBatchConvertToPdf(inputs, outputDirectory, options);
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

  const beginCreatePreset = () => {
    setEditingPreset({
      id: newConversionPresetId(),
      name: "Novo preset",
      builtIn: false,
      options: { ...defaultConversionOptions(), postProcess: true },
    });
    setPresetNotice("");
  };

  const beginEditPreset = (preset: ConversionPreset) => {
    setEditingPreset({
      id: preset.builtIn ? newConversionPresetId() : preset.id,
      name: preset.builtIn ? preset.name + " personalizado" : preset.name,
      builtIn: false,
      options: { ...preset.options },
    });
    setPresetNotice(preset.builtIn ? "Presets nativos são preservados; a edição cria uma cópia personalizada." : "");
  };

  const duplicatePreset = (preset: ConversionPreset) => {
    const copy: ConversionPreset = {
      id: newConversionPresetId(),
      name: preset.name + " · cópia",
      builtIn: false,
      options: { ...preset.options },
    };
    persistCustomPresets([...customPresets, copy]);
    setSelectedPresetId(copy.id);
    setEditingPreset(copy);
    setPresetNotice("Preset duplicado.");
  };

  const deletePreset = (preset: ConversionPreset) => {
    if (preset.builtIn) return;
    persistCustomPresets(customPresets.filter((item) => item.id !== preset.id));
    if (selectedPresetId === preset.id) setSelectedPresetId("standard");
    if (editingPreset?.id === preset.id) setEditingPreset(null);
    setPresetNotice('Preset "' + preset.name + '" excluído. Watch Folders existentes mantêm sua cópia da configuração.');
  };

  const saveEditingPreset = () => {
    if (!editingPreset) return;
    const normalized = normalizeConversionPreset({
      ...editingPreset,
      name: editingPreset.name.trim(),
      builtIn: false,
      options: applyPdfStandardRules(editingPreset.options),
    });
    if (!normalized.name) {
      setPresetNotice("Informe um nome para o preset.");
      return;
    }
    const next = [
      ...customPresets.filter((preset) => preset.id !== normalized.id),
      normalized,
    ].sort((left, right) => left.name.localeCompare(right.name));
    persistCustomPresets(next);
    setSelectedPresetId(normalized.id);
    setEditingPreset(null);
    setPresetNotice('Preset "' + normalized.name + '" salvo.');
  };

  const importPresets = async () => {
    try {
      const selected = await open({
        title: "Importar presets de conversão",
        multiple: false,
        directory: false,
        filters: [{ name: "Seven Reader Presets", extensions: ["json"] }],
      });
      if (typeof selected !== "string") return;
      const imported = await importConversionPresets(selected);
      const used = new Set(presets.map((preset) => preset.id));
      const normalized = imported.map((preset) => {
        const candidate = normalizeConversionPreset({ ...preset, builtIn: false });
        if (used.has(candidate.id)) candidate.id = newConversionPresetId();
        used.add(candidate.id);
        return candidate;
      });
      persistCustomPresets([...customPresets, ...normalized]);
      setPresetNotice(String(normalized.length) + " preset(s) importado(s) e validado(s).");
    } catch (error) {
      setPresetNotice(error instanceof Error ? error.message : String(error));
    }
  };

  const exportPresets = async () => {
    if (!customPresets.length) {
      setPresetNotice("Não há presets personalizados para exportar.");
      return;
    }
    try {
      const destination = await save({
        title: "Exportar presets de conversão",
        defaultPath: "Seven-Reader-Presets.json",
        filters: [{ name: "Seven Reader Presets", extensions: ["json"] }],
      });
      if (!destination) return;
      await exportConversionPresets(destination, customPresets);
      setPresetNotice(String(customPresets.length) + " preset(s) exportado(s).");
    } catch (error) {
      setPresetNotice(error instanceof Error ? error.message : String(error));
    }
  };

  const patchEditorOption = <K extends keyof ConversionOptions>(key: K, value: ConversionOptions[K]) => {
    setEditingPreset((current) => current
      ? { ...current, options: { ...current.options, [key]: value } }
      : current);
  };

  const changeStandard = (value: ConversionOptions["pdfStandard"]) => {
    setEditingPreset((current) => current
      ? {
          ...current,
          options: applyPdfStandardRules({ ...current.options, pdfStandard: value }),
        }
      : current);
  };

  const chooseProfile = async (
    key: "rgbProfile" | "cmykProfile" | "grayProfile" | "outputProfile",
  ) => {
    const selected = await open({
      title: "Selecionar perfil ICC",
      multiple: false,
      directory: false,
      filters: [{ name: "Perfil ICC", extensions: ["icc", "icm"] }],
    });
    if (typeof selected === "string") patchEditorOption(key, selected);
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
    const preset = watchPresetChoices.find((item) => item.id === watchPreset) ?? BUILT_IN_CONVERSION_PRESETS[0];
    const needsGhostscript = preset.options.postProcess || preset.options.pdfStandard !== "pdf";
    if (needsGhostscript && !imageAvailable) return;
    if (preset.options.pdfStandard !== "pdf" && !preset.options.outputProfile) return;
    onUpsertWatchFolder({
      id: watchId,
      name: watchName.trim(),
      inputDirectory: watchInput,
      outputDirectory: watchOutput,
      recursive: watchRecursive,
      enabled: watchEnabled,
      preset: preset.id,
      presetName: preset.name,
      conversionOptions: { ...preset.options },
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

  const renderProfileRow = (
    label: string,
    key: "rgbProfile" | "cmykProfile" | "grayProfile" | "outputProfile",
  ) => {
    if (!editingPreset) return null;
    const value = editingPreset.options[key];
    return (
      <div className="conversion-profile-row" key={key}>
        <div>
          <strong>{label}</strong>
          <small title={value}>{value || "Não definido"}</small>
        </div>
        {value && <button className="danger-quiet" onClick={() => patchEditorOption(key, undefined)}>Limpar</button>}
        <button className="secondary-light-button" onClick={() => void chooseProfile(key)}><SevenIcon name="folder" /> Selecionar</button>
      </div>
    );
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="workflow-dialog conversion-dialog--wide" role="dialog" aria-modal="true" aria-labelledby="conversion-title">
        <header className="organizer-head">
          <div>
            <span className="eyebrow">CONVERSÃO</span>
            <h2 id="conversion-title">Converter documentos</h2>
            <p>Conversão local com presets reutilizáveis, perfis ICC e processamento profissional em background.</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Fechar"><SevenIcon name="close" /></button>
        </header>

        <div className="workflow-tabs">
          <button className={mode === "to-pdf" ? "active" : ""} onClick={() => setMode("to-pdf")}>Arquivo → PDF</button>
          <button className={mode === "from-pdf" ? "active" : ""} onClick={() => setMode("from-pdf")}>PDF → outro formato</button>
          <button className={mode === "presets" ? "active" : ""} onClick={() => setMode("presets")}>Presets</button>
          <button className={mode === "watch" ? "active" : ""} onClick={() => setMode("watch")}>Pastas monitoradas</button>
        </div>

        <div className="workflow-body">
          {mode === "to-pdf" ? (
            <div className="conversion-to-pdf-layout">
              <section className="workflow-feature">
                <span className="feature-icon"><SevenIcon name="convert" /></span>
                <div>
                  <h3>Office, OpenDocument, RTF, texto e HTML</h3>
                  <p>O documento é convertido pelo LibreOffice. Presets avançados passam por uma segunda etapa Ghostscript antes da publicação do PDF final.</p>
                </div>
              </section>

              <section className="conversion-selected-preset">
                <div className="section-mini-title">Preset de saída</div>
                <label className="workflow-field">
                  <span>Preset</span>
                  <select value={selectedPresetId} onChange={(event) => setSelectedPresetId(event.target.value)}>
                    {presets.map((preset) => {
                      const unavailable = (preset.options.postProcess || preset.options.pdfStandard !== "pdf") && !imageAvailable;
                      return <option key={preset.id} value={preset.id} disabled={unavailable}>{preset.name}{preset.builtIn ? " · nativo" : ""}</option>;
                    })}
                  </select>
                </label>
                <div className="conversion-preset-summary">
                  <span>{selectedPreset.options.postProcess ? "LibreOffice → Ghostscript" : "LibreOffice direto"}</span>
                  <span>{standardLabel(selectedPreset.options.pdfStandard)}</span>
                  <span>{selectedPreset.options.compatibility === "2.0" ? "PDF 2.0" : "PDF " + selectedPreset.options.compatibility}</span>
                  <span>{selectedPreset.options.colorDpi} DPI cor</span>
                  <span>{colorLabel(selectedPreset.options.colorStrategy)}</span>
                </div>
                {selectedNeedsGhostscript && !imageAvailable && (
                  <div className="organizer-note organizer-note--warning"><SevenIcon name="compress" /><span>Este preset exige Ghostscript, mas o conversor não foi detectado.</span></div>
                )}
                {selectedNeedsOutputIntent && !selectedPreset.options.outputProfile && (
                  <div className="organizer-note organizer-note--warning"><SevenIcon name="shield" /><span>{standardLabel(selectedPreset.options.pdfStandard)} exige um perfil ICC de OutputIntent. Edite o preset antes de converter.</span></div>
                )}
                <button className="secondary-light-button" onClick={() => { beginEditPreset(selectedPreset); setMode("presets"); }}>
                  <SevenIcon name="settings" /> {selectedPreset.builtIn ? "Personalizar preset" : "Editar preset"}
                </button>
              </section>

              <button className="primary-button workflow-submit" disabled={!selectedPresetReady} onClick={() => void convertToPdf()}>
                <SevenIcon name="open" /> Selecionar arquivo(s) e converter
              </button>
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
                    <SevenIcon name={id === "txt" ? "text" : "pages"} />
                    <strong>{label}</strong>
                    <small>{available ? "Disponível" : "Conversor ausente"}</small>
                  </button>
                ))}
              </div>
              {(format === "png" || format === "jpeg" || format === "tiff") && (
                <label className="workflow-field">
                  <span>Resolução</span>
                  <div className="range-row">
                    <input type="range" min={72} max={600} step={6} value={dpi} onChange={(event) => setDpi(Number(event.target.value))} />
                    <strong>{dpi} DPI</strong>
                  </div>
                </label>
              )}
              <button className="primary-button workflow-submit" onClick={() => void exportPdf()}><SevenIcon name="open" /> Escolher saída</button>
            </>
          ) : mode === "presets" ? (
            <div className="conversion-presets-layout">
              <aside className="conversion-preset-sidebar">
                <div className="conversion-preset-toolbar">
                  <button className="primary-button" onClick={beginCreatePreset}><SevenIcon name="create" /> Novo</button>
                  <button className="secondary-light-button" onClick={() => void importPresets()}><SevenIcon name="open" /> Importar</button>
                  <button className="secondary-light-button" onClick={() => void exportPresets()}><SevenIcon name="save" /> Exportar</button>
                </div>

                <div className="conversion-preset-list">
                  {presets.map((preset) => (
                    <article className={selectedPresetId === preset.id ? "conversion-preset-card active" : "conversion-preset-card"} key={preset.id}>
                      <button className="conversion-preset-main" onClick={() => setSelectedPresetId(preset.id)}>
                        <strong>{preset.name}</strong>
                        <small>{preset.builtIn ? "Nativo" : "Personalizado"} · {standardLabel(preset.options.pdfStandard)} · {preset.options.colorDpi} DPI</small>
                      </button>
                      <div className="conversion-preset-card-actions">
                        <button title={preset.builtIn ? "Criar versão personalizada" : "Editar"} onClick={() => beginEditPreset(preset)}><SevenIcon name="edit" /></button>
                        <button title="Duplicar" onClick={() => duplicatePreset(preset)}><SevenIcon name="pages" /></button>
                        {!preset.builtIn && <button title="Excluir" onClick={() => deletePreset(preset)}><SevenIcon name="close" /></button>}
                      </div>
                    </article>
                  ))}
                </div>
                {presetNotice && <div className="conversion-preset-notice">{presetNotice}</div>}
              </aside>

              <main className="conversion-preset-editor">
                {!editingPreset ? (
                  <div className="empty-panel conversion-preset-empty">
                    <SevenIcon name="settings" />
                    <strong>Selecione editar, duplicar ou criar um preset.</strong>
                    <span>Os presets nativos não são alterados; personalizá-los cria uma cópia.</span>
                  </div>
                ) : (
                  <>
                    <header className="conversion-editor-head">
                      <div>
                        <span className="eyebrow">PRESET PERSONALIZADO</span>
                        <h3>{editingPreset.name || "Sem nome"}</h3>
                      </div>
                      <div className="conversion-editor-actions">
                        <button className="secondary-light-button" onClick={() => setEditingPreset(null)}>Cancelar</button>
                        <button className="primary-button" disabled={!editingPresetReady} onClick={saveEditingPreset}><SevenIcon name="save" /> Salvar preset</button>
                      </div>
                    </header>

                    <label className="workflow-field">
                      <span>Nome</span>
                      <input maxLength={120} value={editingPreset.name} onChange={(event) => setEditingPreset({ ...editingPreset, name: event.target.value })} />
                    </label>

                    <section className="optimizer-section">
                      <div className="section-mini-title">Padrão e compatibilidade</div>
                      <div className="three-column-fields">
                        <label className="workflow-field">
                          <span>Padrão PDF</span>
                          <select value={editingPreset.options.pdfStandard} onChange={(event) => changeStandard(event.target.value as ConversionOptions["pdfStandard"])}>
                            <option value="pdf">PDF comum</option>
                            <option value="pdfa-1b">PDF/A-1b</option>
                            <option value="pdfa-2b">PDF/A-2b</option>
                            <option value="pdfa-3b">PDF/A-3b</option>
                            <option value="pdfx-3">PDF/X-3</option>
                          </select>
                        </label>
                        <label className="workflow-field">
                          <span>Compatibilidade</span>
                          <select
                            value={editingPreset.options.compatibility}
                            disabled={editingPreset.options.pdfStandard !== "pdf"}
                            onChange={(event) => patchEditorOption("compatibility", event.target.value as ConversionOptions["compatibility"])}
                          >
                            <option value="1.3">PDF 1.3</option>
                            <option value="1.4">PDF 1.4</option>
                            <option value="1.5">PDF 1.5</option>
                            <option value="1.6">PDF 1.6</option>
                            <option value="1.7">PDF 1.7</option>
                            <option value="2.0">PDF 2.0</option>
                          </select>
                        </label>
                        <label className="toggle-row">
                          <input
                            type="checkbox"
                            checked={editingPreset.options.postProcess}
                            disabled={editingPreset.options.pdfStandard !== "pdf"}
                            onChange={(event) => patchEditorOption("postProcess", event.target.checked)}
                          />
                          <span><strong>Pós-processar</strong><small>Aplica o preset no Ghostscript após o LibreOffice.</small></span>
                        </label>
                      </div>
                      {editingPreset.options.pdfStandard !== "pdf" && (
                        <div className="organizer-note">
                          <SevenIcon name="shield" />
                          <span>Standards usam política estrita. Se o documento não puder ser convertido de forma compatível, o job falha em vez de declarar sucesso.</span>
                        </div>
                      )}
                    </section>

                    <section className="optimizer-section">
                      <div className="section-mini-title">Imagens e compressão</div>
                      <div className="three-column-fields">
                        <label className="workflow-field"><span>Cor</span><input type="number" min={36} max={2400} value={editingPreset.options.colorDpi} onChange={(event) => patchEditorOption("colorDpi", Math.max(36, Math.min(2400, Number(event.target.value) || 150)))} /><small>DPI</small></label>
                        <label className="workflow-field"><span>Grayscale</span><input type="number" min={36} max={2400} value={editingPreset.options.grayscaleDpi} onChange={(event) => patchEditorOption("grayscaleDpi", Math.max(36, Math.min(2400, Number(event.target.value) || 150)))} /><small>DPI</small></label>
                        <label className="workflow-field"><span>Monocromático</span><input type="number" min={36} max={2400} value={editingPreset.options.monochromeDpi} onChange={(event) => patchEditorOption("monochromeDpi", Math.max(36, Math.min(2400, Number(event.target.value) || 300)))} /><small>DPI</small></label>
                      </div>
                      <div className="three-column-fields">
                        <label className="workflow-field">
                          <span>Downsampling</span>
                          <select value={editingPreset.options.downsample} onChange={(event) => patchEditorOption("downsample", event.target.value as ConversionOptions["downsample"])}>
                            <option value="bicubic">Bicúbico</option>
                            <option value="average">Average</option>
                            <option value="subsample">Subsample</option>
                          </select>
                        </label>
                        <label className="workflow-field">
                          <span>Compressão cor</span>
                          <select value={editingPreset.options.colorCompression} onChange={(event) => patchEditorOption("colorCompression", event.target.value as ConversionOptions["colorCompression"])}>
                            <option value="jpeg">JPEG</option>
                            <option value="flate">ZIP / Flate</option>
                          </select>
                        </label>
                        <label className="workflow-field">
                          <span>Compressão gray</span>
                          <select value={editingPreset.options.grayscaleCompression} onChange={(event) => patchEditorOption("grayscaleCompression", event.target.value as ConversionOptions["grayscaleCompression"])}>
                            <option value="jpeg">JPEG</option>
                            <option value="flate">ZIP / Flate</option>
                          </select>
                        </label>
                      </div>
                      <label className="workflow-field">
                        <span>Qualidade JPEG</span>
                        <div className="range-row">
                          <input type="range" min={1} max={100} value={editingPreset.options.jpegQuality} onChange={(event) => patchEditorOption("jpegQuality", Number(event.target.value))} />
                          <strong>{editingPreset.options.jpegQuality}%</strong>
                        </div>
                      </label>
                    </section>

                    <section className="optimizer-section">
                      <div className="section-mini-title">Fontes e metadados</div>
                      <div className="three-column-fields">
                        <label className="toggle-row">
                          <input type="checkbox" checked={editingPreset.options.embedFonts} disabled={editingPreset.options.pdfStandard !== "pdf"} onChange={(event) => patchEditorOption("embedFonts", event.target.checked)} />
                          <span><strong>Incorporar fontes</strong><small>Solicita embedding ao pdfwrite.</small></span>
                        </label>
                        <label className="toggle-row">
                          <input type="checkbox" checked={editingPreset.options.subsetFonts} onChange={(event) => patchEditorOption("subsetFonts", event.target.checked)} />
                          <span><strong>Subset</strong><small>Incorpora somente glifos usados quando possível.</small></span>
                        </label>
                        <label className="toggle-row">
                          <input type="checkbox" checked={editingPreset.options.preserveMetadata} disabled={editingPreset.options.pdfStandard !== "pdf"} onChange={(event) => patchEditorOption("preserveMetadata", event.target.checked)} />
                          <span><strong>Preservar metadados</strong><small>Quando desligado, omite XMP/datas no PDF gerado onde permitido.</small></span>
                        </label>
                      </div>
                    </section>

                    <section className="optimizer-section">
                      <div className="section-mini-title">Gerenciamento de cor</div>
                      <div className="three-column-fields">
                        <label className="workflow-field">
                          <span>Estratégia</span>
                          <select value={editingPreset.options.colorStrategy} onChange={(event) => patchEditorOption("colorStrategy", event.target.value as ConversionOptions["colorStrategy"])}>
                            <option value="preserve" disabled={editingPreset.options.pdfStandard !== "pdf"}>Preservar</option>
                            <option value="rgb" disabled={editingPreset.options.pdfStandard === "pdfx-3"}>RGB</option>
                            <option value="cmyk">CMYK</option>
                            <option value="gray" disabled={editingPreset.options.pdfStandard.startsWith("pdfa-")}>Gray</option>
                          </select>
                        </label>
                        <label className="workflow-field">
                          <span>Rendering intent</span>
                          <select value={editingPreset.options.renderingIntent} onChange={(event) => patchEditorOption("renderingIntent", event.target.value as ConversionOptions["renderingIntent"])}>
                            <option value="perceptual">Perceptual</option>
                            <option value="relative">Relative Colorimetric</option>
                            <option value="saturation">Saturation</option>
                            <option value="absolute">Absolute Colorimetric</option>
                          </select>
                        </label>
                        <label className="toggle-row">
                          <input type="checkbox" checked={editingPreset.options.preserveOverprint} onChange={(event) => patchEditorOption("preserveOverprint", event.target.checked)} />
                          <span><strong>Preservar overprint</strong><small>Mantém configurações de sobreimpressão quando suportadas.</small></span>
                        </label>
                      </div>

                      <div className="conversion-profile-list">
                        {renderProfileRow("Perfil padrão RGB", "rgbProfile")}
                        {renderProfileRow("Perfil padrão CMYK", "cmykProfile")}
                        {renderProfileRow("Perfil padrão Gray", "grayProfile")}
                        {renderProfileRow("OutputIntent / perfil de saída", "outputProfile")}
                      </div>

                      {editingPreset.options.pdfStandard !== "pdf" && !editingPreset.options.outputProfile && (
                        <div className="organizer-note organizer-note--warning">
                          <SevenIcon name="shield" />
                          <span>Selecione um OutputIntent ICC compatível com {colorLabel(editingPreset.options.colorStrategy)} antes de salvar/usar este standard.</span>
                        </div>
                      )}
                    </section>
                  </>
                )}
              </main>
            </div>
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
                    <select value={watchPreset} onChange={(event) => setWatchPreset(event.target.value)}>
                      {watchPresetChoices.map((preset) => (
                        <option key={preset.id} value={preset.id} disabled={(preset.options.postProcess || preset.options.pdfStandard !== "pdf") && !imageAvailable}>
                          {preset.name}{preset.builtIn ? " · nativo" : ""}
                        </option>
                      ))}
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
                  <button
                    className="primary-button"
                    disabled={
                      !officeAvailable
                      || !watchName.trim()
                      || !watchInput
                      || !watchOutput
                      || !watchExtensions.length
                      || Boolean(watchPresetChoices.find((preset) => {
                        if (preset.id !== watchPreset) return false;
                        const needsGhostscript = preset.options.postProcess || preset.options.pdfStandard !== "pdf";
                        const missingOutputIntent = preset.options.pdfStandard !== "pdf" && !preset.options.outputProfile;
                        return (needsGhostscript && !imageAvailable) || missingOutputIntent;
                      }))
                    }
                    onClick={saveWatch}
                  >
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
                        <span className="watch-preset-badge">{config.presetName || watchPresetChoices.find((preset) => preset.id === config.preset)?.name || config.preset}</span>
                      </header>
                      <div className="watch-folder-meta">
                        <span>{config.recursive ? "Com subpastas" : "Somente pasta raiz"}</span>
                        <span>{config.extensions.map((value) => "." + value).join(", ")}</span>
                      </div>
                      {events.length > 0 && (
                        <div className="watch-event-list">
                          {events.slice(0, 3).map((event, index) => (
                            <div key={event.state + "-" + (event.path ?? "") + "-" + String(index)}>
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
