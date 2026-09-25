import { useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { ReviewTransferReport } from "../types";
import { SevenIcon } from "./SevenIcon";

interface SharedReviewDialogProps {
  documentPath: string;
  lastReport: ReviewTransferReport | null;
  onClose: () => void;
  onExport: (destination: string) => void;
  onImport: (xfdf: string) => void;
}

export function SharedReviewDialog({
  documentPath,
  lastReport,
  onClose,
  onExport,
  onImport,
}: SharedReviewDialogProps) {
  const [mode, setMode] = useState<"export" | "import">("export");

  const exportFile = async () => {
    const destination = await save({
      title: "Exportar comentários XFDF",
      defaultPath: documentPath.replace(/\.pdf$/i, "-comentarios.xfdf"),
      filters: [{ name: "XFDF", extensions: ["xfdf"] }],
    });
    if (destination) onExport(destination);
  };

  const importFile = async () => {
    const selected = await open({
      title: "Importar comentários XFDF",
      multiple: false,
      directory: false,
      filters: [{ name: "XFDF", extensions: ["xfdf"] }],
    });
    if (typeof selected === "string") onImport(selected);
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="workflow-dialog shared-review-dialog" role="dialog" aria-modal="true">
        <header className="organizer-head">
          <div>
            <span className="eyebrow">REVISÃO COMPARTILHADA</span>
            <h2>Comentários interoperáveis</h2>
            <p>Importe e exporte anotações em XFDF sem enviar o PDF para serviços externos.</p>
          </div>
          <button className="icon-button" onClick={onClose}><SevenIcon name="close" /></button>
        </header>

        <div className="workflow-tabs">
          <button className={mode === "export" ? "active" : ""} onClick={() => setMode("export")}>Exportar</button>
          <button className={mode === "import" ? "active" : ""} onClick={() => setMode("import")}>Importar</button>
        </div>

        <div className="workflow-body">
          {mode === "export" ? (
            <div className="workflow-feature">
              <span className="feature-icon"><SevenIcon name="comment" /></span>
              <div>
                <h3>Exportar comentários para XFDF</h3>
                <p>Notas, destaques, sublinhados, tachados, carimbos e texto livre compatíveis são gravados em um arquivo separado.</p>
              </div>
              <button className="primary-button" onClick={() => void exportFile()}>Escolher destino</button>
            </div>
          ) : (
            <div className="workflow-feature">
              <span className="feature-icon"><SevenIcon name="open" /></span>
              <div>
                <h3>Importar comentários XFDF</h3>
                <p>Os comentários são adicionados à revisão atual do documento e entram no histórico Desfazer/Refazer.</p>
              </div>
              <button className="primary-button" onClick={() => void importFile()}>Selecionar XFDF</button>
            </div>
          )}

          {lastReport && (
            <div className="organizer-note">
              <SevenIcon name="comment" />
              <span>{lastReport.annotations} anotação(ões) processada(s){lastReport.skipped ? `; ${lastReport.skipped} ignorada(s) por incompatibilidade.` : "."}</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
