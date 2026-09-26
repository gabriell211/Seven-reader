import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { SevenIcon } from "./SevenIcon";

export type GuidedActionKind =
  | "ocr"
  | "optimize"
  | "convert"
  | "sanitize"
  | "metadata"
  | "watermark"
  | "header"
  | "footer"
  | "bates"
  | "redact"
  | "encrypt"
  | "split"
  | "extract"
  | "rename"
  | "validate-pdfa"
  | "preflight";

export interface GuidedActionRunOptions {
  text: string;
  query: string;
  prefix: string;
  suffix: string;
  startNumber: number;
  digits: number;
  matchCase: boolean;
  wholeWord: boolean;
  userPassword: string;
  ownerPassword: string;
  pagesPerFile: number;
  pageRange: string;
  renamePrefix: string;
  renameSuffix: string;
  pdfaFlavour: string;
  sanitize: {
    removeJavascript: boolean;
    removeOpenActions: boolean;
    removeEmbeddedFiles: boolean;
    removeMetadata: boolean;
    removeXfa: boolean;
    removeAnnotations: boolean;
    removeForms: boolean;
    removeMultimedia: boolean;
    cleanupStructure: boolean;
  };
}

export interface GuidedActionPreset {
  id: string;
  name: string;
  kind: GuidedActionKind;
}

interface GuidedActionsDialogProps {
  onClose: () => void;
  onRun: (kind: GuidedActionKind, inputs: string[], outputDirectory: string, options: GuidedActionRunOptions) => void;
}

const STORAGE_KEY = "seven-reader:guided-actions:v1";

const defaults: GuidedActionPreset[] = [
  { id: "ocr-batch", name: "OCR em vários PDFs", kind: "ocr" },
  { id: "optimize-batch", name: "Otimizar vários PDFs", kind: "optimize" },
  { id: "convert-batch", name: "Converter documentos para PDF", kind: "convert" },
  { id: "sanitize-batch", name: "Sanitizar PDFs", kind: "sanitize" },
  { id: "metadata-batch", name: "Remover metadados", kind: "metadata" },
  { id: "watermark-batch", name: "Marca d'água em lote", kind: "watermark" },
  { id: "header-batch", name: "Cabeçalho em lote", kind: "header" },
  { id: "footer-batch", name: "Rodapé em lote", kind: "footer" },
  { id: "bates-batch", name: "Numeração Bates em lote", kind: "bates" },
  { id: "redact-batch", name: "Redação por busca", kind: "redact" },
  { id: "encrypt-batch", name: "Proteger com senha AES-256", kind: "encrypt" },
  { id: "split-batch", name: "Dividir PDFs", kind: "split" },
  { id: "extract-batch", name: "Extrair páginas em lote", kind: "extract" },
  { id: "rename-batch", name: "Renomear cópias em lote", kind: "rename" },
  { id: "pdfa-batch", name: "Validar PDF/A em lote", kind: "validate-pdfa" },
  { id: "preflight-batch", name: "Preflight em lote", kind: "preflight" },
];

function loadPresets(): GuidedActionPreset[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    const custom = Array.isArray(parsed)
      ? parsed.filter((item): item is GuidedActionPreset =>
          Boolean(item)
          && typeof item.id === "string"
          && item.id.startsWith("custom-")
          && typeof item.name === "string"
          && typeof item.kind === "string")
      : [];
    return [...defaults, ...custom];
  } catch {
    return defaults;
  }
}

export function GuidedActionsDialog({ onClose, onRun }: GuidedActionsDialogProps) {
  const [presets, setPresets] = useState<GuidedActionPreset[]>(loadPresets);
  const [selected, setSelected] = useState(presets[0]?.id ?? "ocr-batch");
  const [inputs, setInputs] = useState<string[]>([]);
  const [outputDirectory, setOutputDirectory] = useState("");
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<GuidedActionKind>("ocr");
  const [text, setText] = useState("CONFIDENCIAL");
  const [query, setQuery] = useState("");
  const [prefix, setPrefix] = useState("DOC-");
  const [suffix, setSuffix] = useState("");
  const [startNumber, setStartNumber] = useState(1);
  const [digits, setDigits] = useState(6);
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [userPassword, setUserPassword] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [pagesPerFile, setPagesPerFile] = useState(10);
  const [pageRange, setPageRange] = useState("1-z");
  const [renamePrefix, setRenamePrefix] = useState("");
  const [renameSuffix, setRenameSuffix] = useState("-processado");
  const [pdfaFlavour, setPdfaFlavour] = useState("2b");
  const [sanitize, setSanitize] = useState<GuidedActionRunOptions["sanitize"]>({
    removeJavascript: true,
    removeOpenActions: true,
    removeEmbeddedFiles: false,
    removeMetadata: false,
    removeXfa: false,
    removeAnnotations: false,
    removeForms: false,
    removeMultimedia: true,
    cleanupStructure: true,
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  }, [presets]);

  const current = presets.find((preset) => preset.id === selected) ?? presets[0];

  const runOptions: GuidedActionRunOptions = {
    text,
    query,
    prefix,
    suffix,
    startNumber,
    digits,
    matchCase,
    wholeWord,
    userPassword,
    ownerPassword,
    pagesPerFile,
    pageRange,
    renamePrefix,
    renameSuffix,
    pdfaFlavour,
    sanitize,
  };

  const requiresText = current?.kind === "watermark" || current?.kind === "header" || current?.kind === "footer";
  const requiresQuery = current?.kind === "redact";
  const sanitizeHasSelection = Object.values(sanitize).some(Boolean);
  const configurationValid =
    (!requiresText || text.trim().length > 0)
    && (!requiresQuery || query.trim().length > 0)
    && (current?.kind !== "sanitize" || sanitizeHasSelection)
    && (current?.kind !== "encrypt" || (userPassword.length > 0 && ownerPassword.length > 0))
    && (current?.kind !== "split" || (pagesPerFile >= 1 && pagesPerFile <= 500))
    && (current?.kind !== "extract" || pageRange.trim().length > 0)
    && (current?.kind !== "rename" || renamePrefix.trim().length > 0 || renameSuffix.trim().length > 0);

  const chooseInputs = async () => {
    if (!current) return;
    const isConvert = current.kind === "convert";
    const selectedFiles = await open({
      title: isConvert ? "Selecionar documentos" : "Selecionar PDFs",
      multiple: true,
      directory: false,
      filters: [{
        name: isConvert ? "Documentos" : "Documentos PDF",
        extensions: isConvert
          ? ["doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp", "rtf", "txt", "html", "htm"]
          : ["pdf"],
      }],
    });
    if (Array.isArray(selectedFiles)) setInputs(selectedFiles);
    else if (typeof selectedFiles === "string") setInputs([selectedFiles]);
  };

  const chooseOutput = async () => {
    const selectedFolder = await open({ title: "Selecionar pasta de saída", directory: true, multiple: false });
    if (typeof selectedFolder === "string") setOutputDirectory(selectedFolder);
  };

  const addPreset = () => {
    const name = newName.trim();
    if (!name) return;
    const preset: GuidedActionPreset = {
      id: `custom-${Date.now()}`,
      name,
      kind: newKind,
    };
    setPresets((currentPresets) => [...currentPresets, preset]);
    setSelected(preset.id);
    setNewName("");
  };

  const removePreset = (id: string) => {
    const next = presets.filter((preset) => preset.id !== id);
    const safe = next.length ? next : defaults;
    setPresets(safe);
    if (selected === id) setSelected(safe[0].id);
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="workflow-dialog guided-actions-dialog" role="dialog" aria-modal="true">
        <header className="organizer-head">
          <div>
            <span className="eyebrow">AÇÕES GUIADAS</span>
            <h2>Automatizar tarefas repetitivas</h2>
            <p>Presets locais executam operações reais em vários arquivos usando a fila de tarefas do Seven Reader.</p>
          </div>
          <button className="icon-button" onClick={onClose}><SevenIcon name="close" /></button>
        </header>

        <div className="workflow-body">
          <div className="guided-layout">
            <aside className="guided-presets">
              {presets.map((preset) => (
                <div className={selected === preset.id ? "guided-preset active" : "guided-preset"} key={preset.id}>
                  <button onClick={() => { setSelected(preset.id); setInputs([]); }}>
                    <SevenIcon name={preset.kind === "ocr" ? "ocr" : preset.kind === "optimize" ? "compress" : preset.kind === "convert" ? "convert" : preset.kind === "redact" ? "redact" : preset.kind === "split" || preset.kind === "extract" ? "pages" : preset.kind === "rename" ? "edit" : preset.kind === "sanitize" || preset.kind === "metadata" || preset.kind === "encrypt" || preset.kind === "validate-pdfa" || preset.kind === "preflight" ? "shield" : "edit"} />
                    <span><strong>{preset.name}</strong><small>{preset.kind}</small></span>
                  </button>
                  {preset.id.startsWith("custom-") && <button className="guided-delete" onClick={() => removePreset(preset.id)}><SevenIcon name="close" /></button>}
                </div>
              ))}
            </aside>

            <div className="guided-work">
              {current && (
                <>
                  <div className="guided-summary">
                    <SevenIcon name={current.kind === "ocr" ? "ocr" : current.kind === "optimize" ? "compress" : current.kind === "convert" ? "convert" : current.kind === "redact" ? "redact" : current.kind === "split" || current.kind === "extract" ? "pages" : current.kind === "rename" ? "edit" : current.kind === "sanitize" || current.kind === "metadata" || current.kind === "encrypt" || current.kind === "validate-pdfa" || current.kind === "preflight" ? "shield" : "edit"} />
                    <div><strong>{current.name}</strong><small>Processamento local · saída em nova pasta · original preservado.</small></div>
                  </div>

                  <button className="image-drop" onClick={() => void chooseInputs()}>
                    <SevenIcon name="open" />
                    <strong>{inputs.length ? `${inputs.length} arquivo(s) selecionado(s)` : "Selecionar arquivos"}</strong>
                    <small>{current.kind === "convert" ? "Office, OpenDocument, RTF, TXT e HTML." : "Somente PDFs."}</small>
                  </button>

                  <button className="secondary-light-button choose-wide" disabled={!inputs.length} onClick={() => void chooseOutput()}>
                    <SevenIcon name="folder" /> {outputDirectory || "Selecionar pasta de saída"}
                  </button>

                  {current.kind === "sanitize" && (
                    <section className="guided-options-box">
                      <div className="section-mini-title">Categorias de sanitização</div>
                      {[
                        ["removeJavascript", "JavaScript"],
                        ["removeOpenActions", "Open/Launch actions"],
                        ["removeEmbeddedFiles", "Anexos"],
                        ["removeMetadata", "Metadados"],
                        ["removeXfa", "XFA"],
                        ["removeAnnotations", "Comentários"],
                        ["removeForms", "Formulários"],
                        ["removeMultimedia", "Rich Media / 3D"],
                        ["cleanupStructure", "Limpeza estrutural"],
                      ].map(([key, label]) => (
                        <label className="toggle-row" key={key}>
                          <input
                            type="checkbox"
                            checked={sanitize[key as keyof GuidedActionRunOptions["sanitize"]]}
                            onChange={(event) => setSanitize((currentOptions) => ({
                              ...currentOptions,
                              [key]: event.target.checked,
                            }))}
                          />
                          <span><strong>{label}</strong></span>
                        </label>
                      ))}
                    </section>
                  )}

                  {(current.kind === "watermark" || current.kind === "header" || current.kind === "footer") && (
                    <section className="guided-options-box">
                      <label className="workflow-field">
                        <span>Texto</span>
                        <input value={text} onChange={(event) => setText(event.target.value)} placeholder={current.kind === "watermark" ? "CONFIDENCIAL" : "Use {page}, {pages} e {date}"} />
                      </label>
                    </section>
                  )}

                  {current.kind === "bates" && (
                    <section className="guided-options-box">
                      <div className="three-column-fields">
                        <label className="workflow-field"><span>Prefixo</span><input value={prefix} onChange={(event) => setPrefix(event.target.value)} /></label>
                        <label className="workflow-field"><span>Início</span><input type="number" min={1} value={startNumber} onChange={(event) => setStartNumber(Math.max(1, Number(event.target.value) || 1))} /></label>
                        <label className="workflow-field"><span>Dígitos</span><input type="number" min={1} max={20} value={digits} onChange={(event) => setDigits(Math.max(1, Math.min(20, Number(event.target.value) || 1)))} /></label>
                      </div>
                      <label className="workflow-field"><span>Sufixo</span><input value={suffix} onChange={(event) => setSuffix(event.target.value)} /></label>
                    </section>
                  )}

                  {current.kind === "redact" && (
                    <section className="guided-options-box">
                      <label className="workflow-field"><span>Texto a redigir permanentemente</span><input value={query} onChange={(event) => setQuery(event.target.value)} /></label>
                      <div className="two-column-fields">
                        <label className="toggle-row"><input type="checkbox" checked={matchCase} onChange={(event) => setMatchCase(event.target.checked)} /><span><strong>Diferenciar maiúsculas/minúsculas</strong></span></label>
                        <label className="toggle-row"><input type="checkbox" checked={wholeWord} onChange={(event) => setWholeWord(event.target.checked)} /><span><strong>Palavra inteira</strong></span></label>
                      </div>
                      <div className="organizer-note organizer-note--warning"><SevenIcon name="shield" /><span>A redação remove objetos sobrepostos e verifica se o texto continua recuperável antes de concluir cada arquivo.</span></div>
                    </section>
                  )}

                  {current.kind === "metadata" && (
                    <div className="organizer-note"><SevenIcon name="shield" /><span>Remove metadados estruturais e informações do documento, preservando o conteúdo visível.</span></div>
                  )}

                  {current.kind === "encrypt" && (
                    <section className="guided-options-box">
                      <div className="two-column-fields">
                        <label className="workflow-field"><span>Senha de abertura</span><input type="password" autoComplete="new-password" value={userPassword} onChange={(event) => setUserPassword(event.target.value)} /></label>
                        <label className="workflow-field"><span>Senha de proprietário</span><input type="password" autoComplete="new-password" value={ownerPassword} onChange={(event) => setOwnerPassword(event.target.value)} /></label>
                      </div>
                      <div className="organizer-note"><SevenIcon name="lock" /><span>AES-256 via qpdf. O lote preserva permissões completas por padrão; as senhas não são salvas no preset.</span></div>
                    </section>
                  )}

                  {current.kind === "split" && (
                    <section className="guided-options-box">
                      <label className="workflow-field">
                        <span>Máximo de páginas por arquivo</span>
                        <input type="number" min={1} max={500} value={pagesPerFile} onChange={(event) => setPagesPerFile(Math.max(1, Math.min(500, Number(event.target.value) || 1)))} />
                        <small>Cada PDF ganha uma subpasta própria com partes numeradas.</small>
                      </label>
                    </section>
                  )}

                  {current.kind === "extract" && (
                    <section className="guided-options-box">
                      <label className="workflow-field">
                        <span>Intervalo de páginas</span>
                        <input value={pageRange} onChange={(event) => setPageRange(event.target.value)} placeholder="1-5,8,10-z" />
                        <small>O mesmo intervalo é aplicado a cada PDF. Use a sintaxe de páginas do qpdf.</small>
                      </label>
                    </section>
                  )}

                  {current.kind === "rename" && (
                    <section className="guided-options-box">
                      <div className="two-column-fields">
                        <label className="workflow-field"><span>Prefixo</span><input value={renamePrefix} onChange={(event) => setRenamePrefix(event.target.value)} placeholder="2026-" /></label>
                        <label className="workflow-field"><span>Sufixo</span><input value={renameSuffix} onChange={(event) => setRenameSuffix(event.target.value)} placeholder="-processado" /></label>
                      </div>
                      <div className="organizer-note"><SevenIcon name="shield" /><span>Cria cópias renomeadas na pasta de saída. Os arquivos originais não são movidos nem apagados.</span></div>
                    </section>
                  )}

                  {current.kind === "validate-pdfa" && (
                    <section className="guided-options-box">
                      <label className="workflow-field">
                        <span>Perfil PDF/A</span>
                        <select value={pdfaFlavour} onChange={(event) => setPdfaFlavour(event.target.value)}>
                          <option value="1b">PDF/A-1b</option>
                          <option value="2b">PDF/A-2b</option>
                          <option value="2u">PDF/A-2u</option>
                          <option value="3b">PDF/A-3b</option>
                          <option value="3u">PDF/A-3u</option>
                          <option value="4">PDF/A-4</option>
                          <option value="4e">PDF/A-4e</option>
                          <option value="4f">PDF/A-4f</option>
                        </select>
                        <small>Gera um relatório JSON veraPDF por documento.</small>
                      </label>
                    </section>
                  )}

                  {current.kind === "preflight" && (
                    <div className="organizer-note"><SevenIcon name="shield" /><span>Analisa fontes, caixas de página, OutputIntent, espaços de cor, transparência, overprint e spot colors; gera um JSON por PDF.</span></div>
                  )}

                  <button className="primary-button workflow-submit" disabled={!inputs.length || !outputDirectory || !configurationValid} onClick={() => onRun(current.kind, inputs, outputDirectory, runOptions)}>
                    <SevenIcon name="automation" /> Executar ação
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="guided-create">
            <div><strong>Criar preset</strong><small>Presets personalizados reutilizam os motores reais já integrados.</small></div>
            <input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Nome do preset" />
            <select value={newKind} onChange={(event) => setNewKind(event.target.value as GuidedActionKind)}>
              <option value="ocr">OCR em lote</option>
              <option value="optimize">Otimização em lote</option>
              <option value="convert">Conversão em lote</option>
              <option value="sanitize">Sanitização em lote</option>
              <option value="metadata">Remover metadados</option>
              <option value="watermark">Marca d'água</option>
              <option value="header">Cabeçalho</option>
              <option value="footer">Rodapé</option>
              <option value="bates">Bates</option>
              <option value="redact">Redação por busca</option>
              <option value="encrypt">Proteger com senha AES-256</option>
              <option value="split">Dividir PDFs</option>
              <option value="extract">Extrair páginas</option>
              <option value="rename">Renomear cópias</option>
              <option value="validate-pdfa">Validar PDF/A</option>
              <option value="preflight">Preflight</option>
            </select>
            <button className="secondary-light-button" disabled={!newName.trim()} onClick={addPreset}><SevenIcon name="create" /> Adicionar</button>
          </div>
        </div>
      </section>
    </div>
  );
}
