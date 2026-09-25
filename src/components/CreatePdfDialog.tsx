import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { Capabilities } from "../types";
import { SevenIcon } from "./SevenIcon";

export type BlankPageSize = "a4" | "letter" | "legal";
type CreateMode = "blank" | "images" | "text" | "clipboard" | "file" | "web";

interface CreatePdfDialogProps {
  capabilities: Capabilities | null;
  onClose: () => void;
  onCreate: (pageSize: BlankPageSize, pageCount: number) => void;
  onCreateImages: (inputs: string[], dpi: number) => void;
  onCreateText: (text: string, pageSize: BlankPageSize, fontSize: number) => void;
  onCreateFile: (input: string, outputDirectory: string) => void;
  onCreateWeb: (url: string) => void;
}

const sizes: Array<{ id: BlankPageSize; name: string; detail: string }> = [
  { id: "a4", name: "A4", detail: "210 × 297 mm" },
  { id: "letter", name: "Carta", detail: "8,5 × 11 pol." },
  { id: "legal", name: "Ofício / Legal", detail: "8,5 × 14 pol." },
];

const sourceTabs: Array<{ id: CreateMode; label: string }> = [
  { id: "blank", label: "Em branco" },
  { id: "images", label: "Imagens" },
  { id: "text", label: "Texto" },
  { id: "clipboard", label: "Clipboard" },
  { id: "file", label: "Arquivo" },
  { id: "web", label: "Web" },
];

export function CreatePdfDialog({
  capabilities,
  onClose,
  onCreate,
  onCreateImages,
  onCreateText,
  onCreateFile,
  onCreateWeb,
}: CreatePdfDialogProps) {
  const [mode, setMode] = useState<CreateMode>("blank");
  const [pageSize, setPageSize] = useState<BlankPageSize>("a4");
  const [pageCount, setPageCount] = useState(1);
  const [images, setImages] = useState<string[]>([]);
  const [dpi, setDpi] = useState(150);
  const [text, setText] = useState("");
  const [fontSize, setFontSize] = useState(11);
  const [fileInput, setFileInput] = useState("");
  const [fileOutputDirectory, setFileOutputDirectory] = useState("");
  const [url, setUrl] = useState("");
  const [clipboardError, setClipboardError] = useState("");

  const chooseImages = async () => {
    const selected = await open({
      title: "Selecionar imagens",
      multiple: true,
      directory: false,
      filters: [{ name: "Imagens", extensions: ["png", "jpg", "jpeg", "tif", "tiff", "bmp", "webp"] }],
    });
    if (Array.isArray(selected)) setImages(selected);
    else if (typeof selected === "string") setImages([selected]);
  };

  const chooseFile = async () => {
    const selected = await open({
      title: "Selecionar documento para converter",
      multiple: false,
      directory: false,
      filters: [{
        name: "Documentos",
        extensions: ["doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp", "rtf", "txt", "html", "htm"],
      }],
    });
    if (typeof selected === "string") setFileInput(selected);
  };

  const chooseOutputDirectory = async () => {
    const selected = await open({ title: "Pasta de saída", directory: true, multiple: false });
    if (typeof selected === "string") setFileOutputDirectory(selected);
  };

  const readClipboard = async () => {
    try {
      const value = await navigator.clipboard.readText();
      setText(value);
      setClipboardError(value ? "" : "A área de transferência não contém texto.");
    } catch {
      setClipboardError("O sistema não permitiu ler texto da área de transferência.");
    }
  };

  const valid =
    mode === "blank" ? pageCount >= 1 :
      mode === "images" ? images.length > 0 :
        mode === "text" || mode === "clipboard" ? text.trim().length > 0 :
          mode === "file" ? Boolean(fileInput && fileOutputDirectory && capabilities?.office.available) :
            Boolean(url.trim() && capabilities?.web_pdf.available);

  const submit = () => {
    if (mode === "blank") onCreate(pageSize, pageCount);
    else if (mode === "images") onCreateImages(images, dpi);
    else if (mode === "text" || mode === "clipboard") onCreateText(text, pageSize, fontSize);
    else if (mode === "file") onCreateFile(fileInput, fileOutputDirectory);
    else onCreateWeb(url.trim());
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="create-dialog create-dialog--wide" role="dialog" aria-modal="true" aria-labelledby="create-pdf-title">
        <header className="organizer-head">
          <div>
            <span className="eyebrow">NOVO DOCUMENTO</span>
            <h2 id="create-pdf-title">Criar PDF</h2>
            <p>Criação local para fontes locais; páginas web são acessadas somente quando você solicita.</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Fechar"><SevenIcon name="close" /></button>
        </header>

        <div className="create-source-tabs" role="tablist" aria-label="Origem do PDF">
          {sourceTabs.map((tab) => (
            <button
              key={tab.id}
              className={mode === tab.id ? "active" : ""}
              onClick={() => setMode(tab.id)}
              role="tab"
              aria-selected={mode === tab.id}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {mode === "blank" && (
          <div className="create-body">
            <div className="paper-preview" aria-hidden="true">
              <div className={`paper-sheet paper-${pageSize}`}>
                <span>{pageCount}</span><small>{pageCount === 1 ? "página" : "páginas"}</small>
              </div>
            </div>
            <div className="create-options">
              <fieldset><legend>Tamanho da página</legend><div className="paper-size-grid">{sizes.map((size) => (
                <button key={size.id} type="button" className={pageSize === size.id ? "paper-size active" : "paper-size"} onClick={() => setPageSize(size.id)}>
                  <strong>{size.name}</strong><small>{size.detail}</small>
                </button>
              ))}</div></fieldset>
              <label>
                <span>Quantidade de páginas</span>
                <input type="number" min={1} max={500} value={pageCount} onChange={(event) => setPageCount(Math.max(1, Math.min(500, Number(event.target.value) || 1)))} />
                <small>Entre 1 e 500 páginas.</small>
              </label>
            </div>
          </div>
        )}

        {mode === "images" && (
          <div className="workflow-body">
            <button className="image-drop" onClick={() => void chooseImages()}>
              <SevenIcon name="open" />
              <strong>{images.length ? `${images.length} imagem(ns) selecionada(s)` : "Selecionar imagens"}</strong>
              <small>PNG, JPEG, TIFF, BMP e WebP · a ordem selecionada vira a ordem das páginas.</small>
            </button>
            <label className="workflow-field">
              <span>DPI usado para calcular o tamanho físico da página</span>
              <div className="range-row">
                <input type="range" min={72} max={600} step={6} value={dpi} onChange={(event) => setDpi(Number(event.target.value))} />
                <strong>{dpi} DPI</strong>
              </div>
            </label>
          </div>
        )}

        {(mode === "text" || mode === "clipboard") && (
          <div className="workflow-body">
            {mode === "clipboard" && (
              <div className="clipboard-actions">
                <button className="secondary-light-button" onClick={() => void readClipboard()}>
                  <SevenIcon name="open" /> Ler texto da área de transferência
                </button>
                {clipboardError && <small className="dependency-note">{clipboardError}</small>}
              </div>
            )}
            <label className="workflow-field">
              <span>Conteúdo do documento</span>
              <textarea
                className="document-textarea"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder={mode === "clipboard" ? "Use o botão acima ou cole o texto aqui." : "Digite ou cole o texto que será gravado no PDF."}
                spellCheck
              />
              <small>O texto é gravado como texto pesquisável, não como imagem.</small>
            </label>
            <div className="two-column-fields">
              <label className="workflow-field">
                <span>Tamanho da página</span>
                <select value={pageSize} onChange={(event) => setPageSize(event.target.value as BlankPageSize)}>
                  {sizes.map((size) => <option value={size.id} key={size.id}>{size.name} · {size.detail}</option>)}
                </select>
              </label>
              <label className="workflow-field">
                <span>Tamanho da fonte</span>
                <input type="number" min={8} max={36} value={fontSize} onChange={(event) => setFontSize(Math.max(8, Math.min(36, Number(event.target.value) || 11)))} />
              </label>
            </div>
          </div>
        )}

        {mode === "file" && (
          <div className="workflow-body">
            <div className="workflow-feature compact-feature">
              <span className="feature-icon"><SevenIcon name="convert" /></span>
              <div>
                <h3>Office, OpenDocument, RTF, texto ou HTML</h3>
                <p>A conversão usa LibreOffice headless detectado no computador.</p>
              </div>
              <button className="primary-button" disabled={!capabilities?.office.available} onClick={() => void chooseFile()}>
                Escolher arquivo
              </button>
              {!capabilities?.office.available && <small className="dependency-note">LibreOffice não detectado.</small>}
            </div>
            {fileInput && <div className="selected-path"><strong>Entrada</strong><span>{fileInput}</span></div>}
            <button className="secondary-light-button choose-wide" disabled={!fileInput} onClick={() => void chooseOutputDirectory()}>
              <SevenIcon name="folder" /> {fileOutputDirectory || "Escolher pasta de saída"}
            </button>
          </div>
        )}

        {mode === "web" && (
          <div className="workflow-body">
            <label className="workflow-field">
              <span>Endereço da página</span>
              <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://exemplo.com/documento" />
              <small>A página é aberta por um navegador local em modo headless e impressa diretamente para PDF.</small>
            </label>
            <div className={capabilities?.web_pdf.available ? "capability-inline ok" : "capability-inline"}>
              <SevenIcon name="shield" />
              <div>
                <strong>{capabilities?.web_pdf.available ? "Navegador compatível detectado" : "Navegador compatível não detectado"}</strong>
                <small>{capabilities?.web_pdf.detail || "Chrome, Chromium ou Edge é necessário para esta fonte."}</small>
              </div>
            </div>
          </div>
        )}

        <footer className="organizer-actions">
          <button className="secondary-light-button" onClick={onClose}>Cancelar</button>
          <button className="primary-button" disabled={!valid} onClick={submit}>
            <SevenIcon name="create" /> Criar documento
          </button>
        </footer>
      </section>
    </div>
  );
}
