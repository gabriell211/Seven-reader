import type { PdfActionInfo } from "../types";
import { SevenIcon } from "./SevenIcon";

interface ActionsDialogProps {
  actions: PdfActionInfo[];
  loading: boolean;
  onClose: () => void;
  onReload: () => void;
}

export function ActionsDialog({ actions, loading, onClose, onReload }: ActionsDialogProps) {
  const automatic = actions.filter((action) => action.automatic).length;
  const blocked = actions.filter((action) => action.blocked).length;

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="workflow-dialog actions-dialog" role="dialog" aria-modal="true">
        <header className="organizer-head">
          <div>
            <span className="eyebrow">AÇÕES PDF</span>
            <h2>JavaScript e ações</h2>
            <p>Inspeção somente leitura. O Seven Reader não executa JavaScript nem Launch automaticamente.</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Fechar"><SevenIcon name="close" /></button>
        </header>
        <div className="workflow-body">
          <div className="action-summary">
            <div><span>Total</span><strong>{actions.length}</strong></div>
            <div><span>Automáticas</span><strong>{automatic}</strong></div>
            <div><span>Bloqueadas</span><strong>{blocked}</strong></div>
            <button className="secondary-light-button" onClick={onReload}>Recarregar</button>
          </div>

          {loading && <div className="report-loading"><span className="loader-ring" /> Inspecionando dicionários de ação…</div>}
          {!loading && actions.length === 0 && <div className="empty-panel">Nenhuma action dictionary suportada foi encontrada.</div>}
          {!loading && actions.length > 0 && (
            <div className="pdf-action-list">
              {actions.map((action) => (
                <article className={action.blocked ? "pdf-action-row blocked" : "pdf-action-row"} key={action.objectId}>
                  <span className="action-glyph"><SevenIcon name={action.blocked ? "lock" : "automation"} /></span>
                  <div>
                    <div className="action-title">
                      <strong>{action.actionType}</strong>
                      {action.automatic && <span>OpenAction</span>}
                      {action.blocked && <span>Execução bloqueada</span>}
                    </div>
                    <p>{action.target || "Sem alvo textual inspecionável."}</p>
                    <small>Objeto {action.objectId}</small>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
