import { useEffect, useState } from "react";
import type { DocumentMetadata, MetadataUpdate } from "../types";
import { SevenIcon } from "./SevenIcon";

interface PropertiesDialogProps {
  metadata: DocumentMetadata | null;
  loading: boolean;
  onClose: () => void;
  onReload: () => void;
  onSave: (update: MetadataUpdate) => void;
}

export function PropertiesDialog({ metadata, loading, onClose, onReload, onSave }: PropertiesDialogProps) {
  const [form, setForm] = useState<MetadataUpdate>({ title: "", author: "", subject: "", keywords: "" });

  useEffect(() => {
    if (metadata) setForm({ title: metadata.title, author: metadata.author, subject: metadata.subject, keywords: metadata.keywords });
  }, [metadata]);

  useEffect(() => { onReload(); }, [onReload]);

  const submit = () => onSave(form);

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="workflow-dialog" role="dialog" aria-modal="true">
        <header className="organizer-head"><div><span className="eyebrow">PROPRIEDADES</span><h2>Metadados do documento</h2><p>{metadata ? `PDF ${metadata.pdfVersion} · ${metadata.pageCount} páginas` : "Lendo estrutura..."}</p></div><button className="icon-button" onClick={onClose}><SevenIcon name="close" /></button></header>
        <div className="workflow-body">
          {loading || !metadata ? <div className="report-loading"><span className="loader-ring" /> Lendo propriedades…</div> : (
            <>
              <div className="metadata-grid">
                {(["title", "author", "subject", "keywords"] as const).map((key) => (
                  <label className="workflow-field" key={key}><span>{{ title: "Título", author: "Autor", subject: "Assunto", keywords: "Palavras-chave" }[key]}</span><input value={form[key]} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} /></label>
                ))}
              </div>
              <div className="metadata-readonly"><span><strong>Criador:</strong> {metadata.creator || "—"}</span><span><strong>Produtor:</strong> {metadata.producer || "—"}</span><span><strong>Criptografado:</strong> {metadata.encrypted ? "Sim" : "Não"}</span></div>
              <button className="primary-button workflow-submit" onClick={submit}><SevenIcon name="edit" /> Aplicar à sessão</button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
