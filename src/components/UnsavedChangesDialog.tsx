import { SevenIcon } from "./SevenIcon";

interface UnsavedChangesDialogProps {
  documentName?: string;
  count: number;
  scope: "tab" | "others" | "quit";
  busy: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

export function UnsavedChangesDialog({
  documentName,
  count,
  scope,
  busy,
  onSave,
  onDiscard,
  onCancel,
}: UnsavedChangesDialogProps) {
  const multiple = count > 1;
  const title =
    scope === "quit"
      ? "Salvar alterações antes de sair?"
      : scope === "others"
        ? "Salvar alterações antes de fechar as outras abas?"
        : "Salvar alterações antes de fechar?";

  const detail = multiple
    ? `${count} documentos possuem alterações não salvas.`
    : documentName
      ? `“${documentName}” possui alterações não salvas.`
      : "Este documento possui alterações não salvas.";

  return (
    <div className="modal-backdrop unsaved-backdrop" role="presentation">
      <section className="unsaved-dialog" role="alertdialog" aria-modal="true" aria-labelledby="unsaved-title">
        <span className="unsaved-icon"><SevenIcon name="save" /></span>
        <div className="unsaved-copy">
          <span className="eyebrow">ALTERAÇÕES NÃO SALVAS</span>
          <h2 id="unsaved-title">{title}</h2>
          <p>{detail} Salvar grava a revisão atual no arquivo original. Descartar mantém o arquivo original como estava.</p>
        </div>
        <footer className="unsaved-actions">
          <button className="secondary-light-button" disabled={busy} onClick={onCancel}>Cancelar</button>
          <button className="danger-outline-button" disabled={busy} onClick={onDiscard}>
            Descartar{multiple ? " todas" : ""}
          </button>
          <button className="primary-button" disabled={busy} onClick={onSave}>
            {busy ? <span className="mini-spinner" /> : <SevenIcon name="save" />}
            Salvar{multiple ? " todas" : ""}
          </button>
        </footer>
      </section>
    </div>
  );
}
