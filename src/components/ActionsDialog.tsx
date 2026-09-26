import { useEffect, useState } from "react";
import type { PageActionInfo, PageActionInput, PdfActionInfo } from "../types";
import { SevenIcon } from "./SevenIcon";

interface ActionsDialogProps {
  actions: PdfActionInfo[];
  pageActions: PageActionInfo[];
  pageIndex: number;
  pageCount: number;
  loading: boolean;
  onClose: () => void;
  onReload: () => void;
  onSetPageAction: (request: PageActionInput) => void;
  onRemovePageAction: (pageIndex: number, trigger: string) => void;
  onExecute: (action: PdfActionInfo) => void;
}

export function ActionsDialog({
  actions,
  pageActions,
  pageIndex,
  pageCount,
  loading,
  onClose,
  onReload,
  onSetPageAction,
  onRemovePageAction,
  onExecute,
}: ActionsDialogProps) {
  const [tab, setTab] = useState<"inspect" | "page">("inspect");
  const [targetPage, setTargetPage] = useState(pageIndex + 1);
  const [trigger, setTrigger] = useState<PageActionInput["trigger"]>("open");
  const [actionType, setActionType] = useState<PageActionInput["actionType"]>("uri");
  const [target, setTarget] = useState("");
  const [gotoPage, setGotoPage] = useState(Math.min(pageCount, pageIndex + 2));

  useEffect(() => { onReload(); }, []);
  useEffect(() => setTargetPage(pageIndex + 1), [pageIndex]);

  const automatic = actions.filter((action) => action.automatic).length;
  const blocked = actions.filter((action) => action.blocked).length;

  const submit = () => {
    onSetPageAction({
      pageIndex: Math.max(0, Math.min(pageCount - 1, targetPage - 1)),
      trigger,
      actionType,
      target,
      targetPage: actionType === "goto" ? Math.max(0, Math.min(pageCount - 1, gotoPage - 1)) : undefined,
    });
  };

  const targetRequired = !["goto", "reset"].includes(actionType);
  const canSubmit = targetPage >= 1
    && targetPage <= pageCount
    && (!targetRequired || target.trim().length > 0);

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="workflow-dialog actions-dialog actions-dialog--wide" role="dialog" aria-modal="true">
        <header className="organizer-head">
          <div>
            <span className="eyebrow">AÇÕES PDF</span>
            <h2>Ações, eventos e segurança</h2>
            <p>URI/GoTo podem ser executadas somente por ação explícita. JavaScript, Launch, ImportData e SubmitForm não são executados automaticamente.</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Fechar"><SevenIcon name="close" /></button>
        </header>

        <div className="workflow-tabs">
          <button className={tab === "inspect" ? "active" : ""} onClick={() => setTab("inspect")}>Inspecionar ({actions.length})</button>
          <button className={tab === "page" ? "active" : ""} onClick={() => setTab("page")}>Page Open / Close</button>
        </div>

        <div className="workflow-body">
          {tab === "inspect" ? (
            <>
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
                  {actions.map((action) => {
                    const executable = !action.blocked && !action.objectId.startsWith("inline:");
                    return (
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
                        <button
                          className={executable ? "secondary-light-button" : "secondary-light-button action-disabled"}
                          disabled={!executable}
                          onClick={() => onExecute(action)}
                        >
                          {action.blocked ? "Bloqueada" : executable ? "Executar" : "Somente inspeção"}
                        </button>
                      </article>
                    );
                  })}
                </div>
              )}

              <div className="organizer-note organizer-note--warning">
                <SevenIcon name="lock" />
                <span>O Seven nunca executa uma action dictionary durante a abertura do PDF. Mesmo URI e navegação interna exigem clique explícito nesta interface ou em um link autorizado.</span>
              </div>
            </>
          ) : (
            <>
              <section className="page-action-editor">
                <div className="three-column-fields">
                  <label className="workflow-field">
                    <span>Página</span>
                    <input type="number" min={1} max={pageCount} value={targetPage} onChange={(event) => setTargetPage(Math.max(1, Math.min(pageCount, Number(event.target.value) || 1)))} />
                  </label>
                  <label className="workflow-field">
                    <span>Gatilho</span>
                    <select value={trigger} onChange={(event) => setTrigger(event.target.value as PageActionInput["trigger"])}>
                      <option value="open">Page Open</option>
                      <option value="close">Page Close</option>
                    </select>
                  </label>
                  <label className="workflow-field">
                    <span>Ação</span>
                    <select value={actionType} onChange={(event) => setActionType(event.target.value as PageActionInput["actionType"])}>
                      <option value="uri">Open URL</option>
                      <option value="goto">Go to page</option>
                      <option value="named">Go to named destination</option>
                      <option value="reset">Reset form</option>
                      <option value="submit">Submit form</option>
                      <option value="javascript">JavaScript (execução bloqueada)</option>
                    </select>
                  </label>
                </div>

                {actionType === "goto" ? (
                  <label className="workflow-field"><span>Página de destino</span><input type="number" min={1} max={pageCount} value={gotoPage} onChange={(event) => setGotoPage(Math.max(1, Math.min(pageCount, Number(event.target.value) || 1)))} /></label>
                ) : actionType === "reset" ? (
                  <div className="organizer-note"><SevenIcon name="history" /><span>Cria uma action dictionary /ResetForm. O Seven só executa reset por ação explícita do usuário.</span></div>
                ) : (
                  <label className="workflow-field">
                    <span>{actionType === "javascript" ? "Código JavaScript" : actionType === "named" ? "Nome do destino" : "Destino"}</span>
                    {actionType === "javascript"
                      ? <textarea rows={8} value={target} onChange={(event) => setTarget(event.target.value)} spellCheck={false} />
                      : <input value={target} onChange={(event) => setTarget(event.target.value)} placeholder={actionType === "uri" || actionType === "submit" ? "https://..." : ""} />}
                  </label>
                )}

                {(actionType === "javascript" || actionType === "submit") && (
                  <div className="organizer-note organizer-note--warning">
                    <SevenIcon name="lock" />
                    <span>{actionType === "javascript"
                      ? "O código será preservado no PDF para compatibilidade, mas não será executado até existir sandbox JavaScript restrita."
                      : "SubmitForm é gravado no PDF, mas o Seven não envia dados sem um fluxo explícito de revisão e confirmação."}</span>
                  </div>
                )}

                <button className="primary-button workflow-submit" disabled={!canSubmit} onClick={submit}>
                  <SevenIcon name="automation" /> Gravar ação de página
                </button>
              </section>

              <div className="section-mini-title">Ações Page Open / Close existentes ({pageActions.length})</div>
              {loading && <div className="report-loading"><span className="loader-ring" /> Lendo ações de páginas…</div>}
              {!loading && pageActions.length === 0 && <div className="empty-panel">Nenhuma ação Page Open/Close encontrada.</div>}
              {!loading && pageActions.length > 0 && (
                <div className="page-action-list">
                  {pageActions.map((action) => (
                    <article className={action.blocked ? "page-action-row blocked" : "page-action-row"} key={`${action.pageIndex}-${action.trigger}`}>
                      <span><SevenIcon name={action.blocked ? "lock" : "automation"} /></span>
                      <div>
                        <strong>Página {action.pageIndex + 1} · {action.trigger === "open" ? "Open" : "Close"} · {action.actionType}</strong>
                        <small>{action.target || "Sem alvo textual"}</small>
                      </div>
                      <button className="danger-quiet" onClick={() => onRemovePageAction(action.pageIndex, action.trigger)}>Remover</button>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
