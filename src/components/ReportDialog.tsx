import { useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type {
  AccessibilityProperties,
  AccessibilityReport,
  CompareReport,
  StructureTagInfo,
  StructureTagUpdate,
} from "../types";
import { SevenIcon } from "./SevenIcon";

interface ReportDialogProps {
  mode: "compare" | "accessibility";
  currentPdf: string;
  accessibility?: AccessibilityReport | null;
  accessibilityTags?: StructureTagInfo[];
  comparison?: CompareReport | null;
  loading: boolean;
  onClose: () => void;
  onAccessibility: () => void;
  onUpdateAccessibilityProperties?: (properties: AccessibilityProperties) => void;
  onUpdateAccessibilityTag?: (update: StructureTagUpdate) => void;
  onDeleteAccessibilityTag?: (objectId: string) => void;
  onMoveAccessibilityTag?: (objectId: string, direction: "up" | "down") => void;
  onAutoTag?: () => void;
  speechAvailable?: boolean;
  speechState?: "idle" | "speaking" | "paused";
  onReadAloud?: () => void;
  onPauseResumeReadAloud?: () => void;
  onStopReadAloud?: () => void;
  onCompare: (other: string) => void;
}

const tagTypes = [
  "Document","Part","Art","Sect","Div","BlockQuote","Caption",
  "P","H1","H2","H3","H4","H5","H6","L","LI","Lbl","LBody",
  "Table","TR","TH","TD","Span","Quote","Note","Reference","Code",
  "Link","Annot","Figure","Formula","Form","Artifact",
];

export function ReportDialog({
  mode,
  currentPdf,
  accessibility,
  accessibilityTags = [],
  comparison,
  loading,
  onClose,
  onAccessibility,
  onUpdateAccessibilityProperties,
  onUpdateAccessibilityTag,
  onDeleteAccessibilityTag,
  onMoveAccessibilityTag,
  onAutoTag,
  speechAvailable = false,
  speechState = "idle",
  onReadAloud,
  onPauseResumeReadAloud,
  onStopReadAloud,
  onCompare,
}: ReportDialogProps) {
  const [other, setOther] = useState("");
  const [accessibilityTab, setAccessibilityTab] = useState<"checker" | "properties" | "tags" | "reading">("checker");
  const [language, setLanguage] = useState("pt-BR");
  const [title, setTitle] = useState("");
  const [displayDocumentTitle, setDisplayDocumentTitle] = useState(true);
  const [selectedTagId, setSelectedTagId] = useState("");
  const [tagType, setTagType] = useState("P");
  const [tagTitle, setTagTitle] = useState("");
  const [tagAlt, setTagAlt] = useState("");
  const [tagActual, setTagActual] = useState("");

  useEffect(() => {
    if (mode === "accessibility" && !accessibility && !loading) onAccessibility();
  }, [mode]);

  useEffect(() => {
    if (!accessibility) return;
    setLanguage(accessibility.language || "pt-BR");
    setTitle(accessibility.title || "");
    setDisplayDocumentTitle(accessibility.displayDocumentTitle);
  }, [accessibility]);

  const selectedTag = useMemo(
    () => accessibilityTags.find((tag) => tag.objectId === selectedTagId) ?? null,
    [accessibilityTags, selectedTagId],
  );

  useEffect(() => {
    if (!selectedTag) return;
    setTagType(selectedTag.tagType);
    setTagTitle(selectedTag.title);
    setTagAlt(selectedTag.altText);
    setTagActual(selectedTag.actualText);
  }, [selectedTag]);

  const chooseOther = async () => {
    const selected = await open({
      title: "Selecionar outra versão",
      multiple: false,
      directory: false,
      filters: [{ name: "Documento PDF", extensions: ["pdf"] }],
    });
    if (typeof selected === "string") {
      setOther(selected);
      onCompare(selected);
    }
  };

  const saveProperties = () => {
    onUpdateAccessibilityProperties?.({
      language: language.trim(),
      title: title.trim(),
      displayDocumentTitle,
    });
  };

  const saveTag = () => {
    if (!selectedTagId) return;
    onUpdateAccessibilityTag?.({
      objectId: selectedTagId,
      tagType,
      title: tagTitle,
      altText: tagAlt,
      actualText: tagActual,
    });
  };

  const failedChecks = accessibility?.checks.filter((check) => !check.passed) ?? [];

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={mode === "accessibility" ? "workflow-dialog report-dialog accessibility-workspace" : "workflow-dialog report-dialog"} role="dialog" aria-modal="true">
        <header className="organizer-head">
          <div>
            <span className="eyebrow">{mode === "compare" ? "COMPARAÇÃO" : "ACESSIBILIDADE"}</span>
            <h2>{mode === "compare" ? "Comparar documentos" : "Preparar acessibilidade"}</h2>
            <p title={currentPdf}>{currentPdf}</p>
          </div>
          <button className="icon-button" onClick={onClose}><SevenIcon name="close" /></button>
        </header>

        {mode === "accessibility" && (
          <div className="workflow-tabs accessibility-tabs">
            <button className={accessibilityTab === "checker" ? "active" : ""} onClick={() => setAccessibilityTab("checker")}>Verificação</button>
            <button className={accessibilityTab === "properties" ? "active" : ""} onClick={() => setAccessibilityTab("properties")}>Propriedades</button>
            <button className={accessibilityTab === "tags" ? "active" : ""} onClick={() => setAccessibilityTab("tags")}>Tags / ordem</button>
            <button className={accessibilityTab === "reading" ? "active" : ""} onClick={() => setAccessibilityTab("reading")}>Leitura</button>
          </div>
        )}

        <div className="workflow-body">
          {mode === "compare" ? (
            <>
              <button className="secondary-light-button choose-wide" onClick={() => void chooseOther()}>
                <SevenIcon name="open" /> {other || "Selecionar segunda versão"}
              </button>
              {loading && <div className="report-loading"><span className="loader-ring" /> Comparando texto página a página…</div>}
              {comparison && (
                <>
                  <div className="report-summary">
                    <strong>{comparison.changedPages}</strong><span>páginas diferentes</span>
                    <small>{comparison.leftPages} páginas na versão atual · {comparison.rightPages} na outra</small>
                  </div>
                  <div className="compare-list">
                    {comparison.pages.length === 0 && <div className="empty-panel">Nenhuma diferença textual normalizada detectada.</div>}
                    {comparison.pages.map((item) => (
                      <article className="compare-item" key={item.pageIndex}>
                        <header>Página {item.pageIndex + 1}</header>
                        <div>
                          <p><b>Atual</b>{item.leftExcerpt || "Página ausente"}</p>
                          <p><b>Outra</b>{item.rightExcerpt || "Página ausente"}</p>
                        </div>
                      </article>
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              {loading && <div className="report-loading"><span className="loader-ring" /> Inspecionando estrutura de acessibilidade…</div>}

              {!loading && accessibility && accessibilityTab === "checker" && (
                <>
                  <div className="accessibility-summary-grid">
                    <div><span>Tagged PDF</span><strong>{accessibility.tagged ? "Sim" : "Não"}</strong></div>
                    <div><span>Tags</span><strong>{accessibility.tagCount}</strong></div>
                    <div><span>Figuras sem Alt</span><strong>{accessibility.figuresMissingAlt}</strong></div>
                    <div><span>Campos sem descrição</span><strong>{accessibility.formFieldsMissingDescription}</strong></div>
                    <div><span>Páginas sem Tab order</span><strong>{accessibility.pagesMissingTabOrder}</strong></div>
                    <div><span>Sem camada textual</span><strong>{accessibility.imageOnlyPages.length}</strong></div>
                  </div>

                  <div className="accessibility-check-toolbar">
                    <button className="secondary-light-button" onClick={onAccessibility}><SevenIcon name="history" /> Reexecutar</button>
                    <button className="primary-button" disabled={accessibility.tagged || !onAutoTag} onClick={onAutoTag}>
                      <SevenIcon name="accessibility" /> Autotag básico
                    </button>
                  </div>

                  {!accessibility.tagged && (
                    <div className="organizer-note organizer-note--warning">
                      <SevenIcon name="accessibility" />
                      <span>Autotag básico cria uma estrutura inicial por página e não sobrescreve PDFs já marcados. Revise tipos, ordem e textos alternativos depois.</span>
                    </div>
                  )}

                  <div className="accessibility-list">
                    {accessibility.checks.map((check) => (
                      <div className={`accessibility-check ${check.passed ? "passed" : check.severity}`} key={check.id}>
                        <span>{check.passed ? "✓" : check.severity === "error" ? "!" : "i"}</span>
                        <div>
                          <strong>{check.label}</strong>
                          <small>{check.detail}</small>
                          {!check.passed && check.fixable && <em>Correção disponível no Seven Reader.</em>}
                        </div>
                      </div>
                    ))}
                  </div>

                  {failedChecks.length === 0 && (
                    <div className="preflight-ok"><SevenIcon name="shield" /><span>As regras estruturais implementadas passaram. Validação manual com tecnologia assistiva continua recomendada.</span></div>
                  )}
                </>
              )}

              {!loading && accessibility && accessibilityTab === "properties" && (
                <>
                  <label className="workflow-field">
                    <span>Idioma do documento (BCP 47)</span>
                    <input value={language} onChange={(event) => setLanguage(event.target.value)} placeholder="pt-BR" />
                    <small>Grava /Lang no catálogo do PDF.</small>
                  </label>
                  <label className="workflow-field">
                    <span>Título do documento</span>
                    <input value={title} onChange={(event) => setTitle(event.target.value)} />
                    <small>Grava Title no dicionário Info.</small>
                  </label>
                  <label className="toggle-row">
                    <input type="checkbox" checked={displayDocumentTitle} onChange={(event) => setDisplayDocumentTitle(event.target.checked)} />
                    <span><strong>Exibir título do documento</strong><small>Ativa ViewerPreferences /DisplayDocTitle.</small></span>
                  </label>
                  <button className="primary-button workflow-submit" disabled={!language.trim()} onClick={saveProperties}>
                    <SevenIcon name="save" /> Aplicar propriedades à sessão
                  </button>
                </>
              )}

              {!loading && accessibility && accessibilityTab === "tags" && (
                <div className="tags-workspace">
                  <aside className="tag-tree">
                    <header>
                      <div><strong>Árvore estrutural</strong><small>{accessibilityTags.length} elemento(s)</small></div>
                      <button onClick={onAccessibility} title="Atualizar"><SevenIcon name="history" /></button>
                    </header>
                    {!accessibilityTags.length && <div className="empty-panel">Nenhuma tag estrutural encontrada. Use Autotag básico em um PDF ainda não marcado.</div>}
                    {accessibilityTags.map((tag) => (
                      <button
                        key={tag.objectId}
                        className={selectedTagId === tag.objectId ? "tag-tree-row active" : "tag-tree-row"}
                        style={{ paddingLeft: 10 + tag.depth * 14 }}
                        onClick={() => setSelectedTagId(tag.objectId)}
                      >
                        <span className="tag-type">{tag.tagType}</span>
                        <div>
                          <strong>{tag.title || tag.altText || tag.tagType}</strong>
                          <small>{tag.pageIndex !== undefined ? `pág. ${tag.pageIndex + 1}` : "estrutura"} · {tag.childCount} filho(s)</small>
                        </div>
                      </button>
                    ))}
                  </aside>

                  <section className="tag-editor">
                    {!selectedTag ? (
                      <div className="empty-panel">Selecione uma tag para editar tipo, ordem e conteúdo alternativo.</div>
                    ) : (
                      <>
                        <div className="tag-editor-head">
                          <div><span className="eyebrow">TAG</span><strong>{selectedTag.objectId}</strong></div>
                          <div>
                            <button onClick={() => onMoveAccessibilityTag?.(selectedTag.objectId, "up")} title="Mover para cima">↑</button>
                            <button onClick={() => onMoveAccessibilityTag?.(selectedTag.objectId, "down")} title="Mover para baixo">↓</button>
                          </div>
                        </div>
                        <label className="workflow-field">
                          <span>Tipo estrutural</span>
                          <select value={tagType} onChange={(event) => setTagType(event.target.value)}>
                            {!tagTypes.includes(tagType) && <option value={tagType}>{tagType}</option>}
                            {tagTypes.map((value) => <option value={value} key={value}>{value}</option>)}
                          </select>
                        </label>
                        <label className="workflow-field"><span>Título da tag</span><input value={tagTitle} onChange={(event) => setTagTitle(event.target.value)} /></label>
                        <label className="workflow-field">
                          <span>Texto alternativo</span>
                          <textarea rows={4} value={tagAlt} onChange={(event) => setTagAlt(event.target.value)} />
                          <small>Essencial para Figure e conteúdo não textual.</small>
                        </label>
                        <label className="workflow-field">
                          <span>ActualText</span>
                          <textarea rows={4} value={tagActual} onChange={(event) => setTagActual(event.target.value)} />
                          <small>Substituição textual sem alterar a aparência visual.</small>
                        </label>
                        <div className="tag-editor-actions">
                          <button className="danger-quiet" disabled={selectedTag.childCount > 0} onClick={() => { onDeleteAccessibilityTag?.(selectedTag.objectId); setSelectedTagId(""); }}>Remover tag</button>
                          <button className="primary-button" onClick={saveTag}><SevenIcon name="save" /> Aplicar tag</button>
                        </div>
                      </>
                    )}
                  </section>
                </div>
              )}

              {!loading && accessibility && accessibilityTab === "reading" && (
                <>
                  <div className="read-aloud-card">
                    <span className="feature-icon"><SevenIcon name="accessibility" /></span>
                    <div>
                      <h3>Read Out Loud · página atual</h3>
                      <p>Usa a camada textual da página atual e a voz disponível no sistema/WebView. Para páginas digitalizadas, execute OCR primeiro.</p>
                    </div>
                  </div>
                  <div className="read-aloud-controls">
                    <button className="primary-button" disabled={!speechAvailable || speechState !== "idle"} onClick={onReadAloud}>
                      <SevenIcon name="accessibility" /> Ler página
                    </button>
                    <button className="secondary-light-button" disabled={!speechAvailable || speechState === "idle"} onClick={onPauseResumeReadAloud}>
                      {speechState === "paused" ? "Continuar" : "Pausar"}
                    </button>
                    <button className="secondary-light-button" disabled={!speechAvailable || speechState === "idle"} onClick={onStopReadAloud}>Parar</button>
                  </div>
                  {!speechAvailable && <div className="organizer-note organizer-note--warning"><SevenIcon name="comment" /><span>A API de síntese de voz não está disponível neste WebView/sistema.</span></div>}
                  <div className="organizer-note">
                    <SevenIcon name="text" />
                    <span>Reflow já está disponível na barra inferior do documento. Tamanho, alto contraste, reduced motion, velocidade e tom ficam em Preferências → Acessibilidade.</span>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
