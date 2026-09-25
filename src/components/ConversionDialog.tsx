import { useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { Capabilities } from "../types";
import { SevenIcon } from "./SevenIcon";

interface ConversionDialogProps {
  capabilities: Capabilities | null;
  currentPdf?: string;
  onClose: () => void;
  onConvertToPdf: (input: string, outputDirectory: string) => void;
  onExport: (input: string, output: string, format: "png" | "jpeg" | "tiff" | "txt" | "ps", dpi?: number) => void;
}

export function ConversionDialog({
  capabilities,
  currentPdf,
  onClose,
  onConvertToPdf,
  onExport,
}: ConversionDialogProps) {
  const [mode, setMode] = useState<"to-pdf" | "from-pdf">(currentPdf ? "from-pdf" : "to-pdf");
  const [format, setFormat] = useState<"png" | "jpeg" | "tiff" | "txt" | "ps">("png");
  const [dpi, setDpi] = useState(150);

  const convertToPdf = async () => {
    const input = await open({
      title: "Selecionar documento para converter",
      multiple: false,
      directory: false,
      filters: [{ name: "Documentos", extensions: ["doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp", "rtf", "txt", "html", "htm"] }],
    });
    if (typeof input !== "string") return;
    const outputDirectory = await open({ title: "Pasta de saída", directory: true, multiple: false });
    if (typeof outputDirectory !== "string") return;
    onConvertToPdf(input, outputDirectory);
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

  const imageAvailable = Boolean(capabilities?.ghostscript.available);
  const textAvailable = Boolean(capabilities?.pdftotext.available);
  const officeAvailable = Boolean(capabilities?.office.available);

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="workflow-dialog" role="dialog" aria-modal="true" aria-labelledby="conversion-title">
        <header className="organizer-head">
          <div><span className="eyebrow">CONVERSÃO</span><h2 id="conversion-title">Converter documentos</h2><p>Processamento local, usando apenas conversores detectados no dispositivo.</p></div>
          <button className="icon-button" onClick={onClose} aria-label="Fechar"><SevenIcon name="close" /></button>
        </header>
        <div className="workflow-tabs">
          <button className={mode === "to-pdf" ? "active" : ""} onClick={() => setMode("to-pdf")}>Arquivo → PDF</button>
          <button className={mode === "from-pdf" ? "active" : ""} onClick={() => setMode("from-pdf")}>PDF → outro formato</button>
        </div>
        <div className="workflow-body">
          {mode === "to-pdf" ? (
            <div className="workflow-feature">
              <span className="feature-icon"><SevenIcon name="convert" /></span>
              <div><h3>Office, OpenDocument, RTF, texto e HTML</h3><p>O LibreOffice é executado em modo headless e grava o PDF diretamente na pasta escolhida.</p></div>
              <button className="primary-button" disabled={!officeAvailable} onClick={() => void convertToPdf()}>Selecionar arquivo</button>
              {!officeAvailable && <small className="dependency-note">LibreOffice não detectado.</small>}
            </div>
          ) : (
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
          )}
        </div>
      </section>
    </div>
  );
}
