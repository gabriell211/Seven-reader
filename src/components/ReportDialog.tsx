import { useEffect, useMemo, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import type {
  AccessibilityProperties,
  AccessibilityReport,
  CompareOptions,
  CompareReport,
  StructureTagInfo,
  StructureTagUpdate,
} from "../types";
import { SevenIcon } from "./SevenIcon";
import { nativeAssetUrl } from "../lib/native";

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
  onCompare: (other: string, options: CompareOptions, swap: boolean) => void;
  onExportCompare?: (destination: string, other: string, swap: boolean) => void;
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
  onExportCompare,
}: ReportDialogProps) {
  const [other, setOther] = useState("");
  const [compareSwap, setCompareSwap] = useState(false);
  const [comparePageStart, setComparePageStart] = useState("");
  const [comparePageEnd, setComparePageEnd] = useState("");
  const [compareTextOnly, setCompareTextOnly] = useState(false);
  const [compareDocumentType, setCompareDocumentType] = useState<CompareOptions["documentType"]>("auto");
  const [compareView, setCompareView] = useState<"side" | "single">("side");
  const [differenceIndex, setDifferenceIndex] = useState(0);
  const [hiddenCategories, setHiddenCategories] = useState<string[]>([]);
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

  const compareOptions = (): CompareOptions => ({
    pageStart: comparePageStart ? Math.max(1, Number(comparePageStart) || 1) : undefined,
    pageEnd: comparePageEnd ? Math.max(1, Number(comparePageEnd) || 1) : undefined,
    textOnly: compareTextOnly,
    documentType: compareDocumentType,
  });

  const runComparison = (path = other, swap = compareSwap) => {
    if (!path) return;
    setDifferenceIndex(0);
    onCompare(path, compareOptions(), swap);
  };

  const chooseOther = async () => {
    const selected = await open({
      title: "Selecionar outra versão",
      multiple: false,
      directory: false,
      filters: [{ name: "Documento PDF", extensions: ["pdf"] }],
    });
    if (typeof selected === "string") {
      setOther(selected);
      setCompareSwap(false);
      runComparison(selected, false);
    }
  };

  const swapComparison = () => {
    if (!other) return;
    const next = !compareSwap;
    setCompareSwap(next);
    runComparison(other, next);
  };

  const exportComparison = async () => {
    if (!comparison || !other || !onExportCompare) return;
    const destination = await save({
      title: "Salvar relatório de comparação",
      defaultPath: "Seven-Reader-Comparacao.pdf",
      filters: [{ name: "Documento PDF", extensions: ["pdf"] }],
    });
    if (destination) onExportCompare(destination, other, compareSwap);
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

  const compareCategories = useMemo(
    () => comparison ? Object.keys(comparison.categoryCounts).sort() : [],
    [comparison],
  );
  const visibleDifferences = useMemo(
    () => comparison?.pages.filter((item) =>
      item.categories.some((category) => !hiddenCategories.includes(category))
    ) ?? [],
    [comparison, hiddenCategories],
  );
  const activeDifference = visibleDifferences[Math.min(differenceIndex, Math.max(0, visibleDifferences.length - 1))] ?? null;

  useEffect(() => {
    if (differenceIndex >= visibleDifferences.length) {
      setDifferenceIndex(Math.max(0, visibleDifferences.length - 1));
    }
  }, [visibleDifferences.length, differenceIndex]);

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
              <section className="compare-config">
                <div className="compare-file-row">
                  <div>
                    <span className="eyebrow">ARQUIVO A</span>
                    <strong title={compareSwap ? other : currentPdf}>{compareSwap ? (other || "Selecione o segundo arquivo") : currentPdf}</strong>
                  </div>
                  <button className="compare-swap" disabled={!other} onClick={swapComparison} title="Trocar lados">⇄</button>
                  <div>
                    <span className="eyebrow">ARQUIVO B</span>
                    <strong title={compareSwap ? currentPdf : other}>{compareSwap ? currentPdf : (other || "Selecione o segundo arquivo")}</strong>
                  </div>
                </div>
                <button className="secondary-light-button choose-wide" onClick={() => void chooseOther()}>
                  <SevenIcon name="open" /> {other || "Selecionar segunda versão"}
                </button>
                <div className="compare-options-grid">
                  <label className="workflow-field"><span>Página inicial</span><input value={comparePageStart} onChange={(event) => setComparePageStart(event.target.value.replace(/[^0-9]/g, ""))} placeholder="1" /></label>
                  <label className="workflow-field"><span>Página final</span><input value={comparePageEnd} onChange={(event) => setComparePageEnd(event.target.value.replace(/[^0-9]/g, ""))} placeholder="até o fim" /></label>
                  <label className="workflow-field">
                    <span>Tipo de documento</span>
                    <select value={compareDocumentType} onChange={(event) => setCompareDocumentType(event.target.value as CompareOptions["documentType"])}>
                      <option value="auto">Auto detect</option>
                      <option value="report">Relatório</option>
                      <option value="spreadsheet">Planilha</option>
                      <option value="magazine">Layout de revista</option>
                      <option value="presentation">Apresentação</option>
                      <option value="scan">Scan</option>
                      <option value="drawing">Desenho</option>
                      <option value="illustration">Ilustração</option>
                    </select>
                  </label>
                  <label className="toggle-row compare-text-only"><input type="checkbox" checked={compareTextOnly} onChange={(event) => setCompareTextOnly(event.target.checked)} /><span><strong>Somente texto</strong><small>Ignora comparação visual/pixel.</small></span></label>
                </div>
                <button className="primary-button compare-run" disabled={!other || loading} onClick={() => runComparison()}>
                  <SevenIcon name="compare" /> Comparar agora
                </button>
              </section>

              {loading && <div className="report-loading"><span className="loader-ring" /> Comparando texto, layout, gráficos e anotações…</div>}

              {comparison && !loading && (
                <>
                  <div className="compare-summary-grid">
                    <div><span>Páginas alteradas</span><strong>{comparison.changedPages}</strong></div>
                    <div><span>Diferenças</span><strong>{comparison.totalDifferences}</strong></div>
                    <div><span>Tipo detectado</span><strong>{comparison.documentType}</strong></div>
                    <div><span>Arquivo A</span><strong>{comparison.leftPages} pág.</strong></div>
                    <div><span>Arquivo B</span><strong>{comparison.rightPages} pág.</strong></div>
                  </div>

                  <div className="compare-category-filter">
                    {compareCategories.map((category) => {
                      const hidden = hiddenCategories.includes(category);
                      return (
                        <button key={category} className={hidden ? "hidden" : "active"} onClick={() => setHiddenCategories((current) => hidden ? current.filter((item) => item !== category) : [...current, category])}>
                          {category} <b>{comparison.categoryCounts[category]}</b>
                        </button>
                      );
                    })}
                  </div>

                  <div className="compare-navigation">
                    <button disabled={differenceIndex <= 0} onClick={() => setDifferenceIndex((value) => Math.max(0, value - 1))}>← Diferença anterior</button>
                    <span>{visibleDifferences.length ? differenceIndex + 1 : 0} / {visibleDifferences.length}</span>
                    <button disabled={differenceIndex >= visibleDifferences.length - 1} onClick={() => setDifferenceIndex((value) => Math.min(visibleDifferences.length - 1, value + 1))}>Próxima diferença →</button>
                    <i />
                    <button className={compareView === "side" ? "active" : ""} onClick={() => setCompareView("side")}>Lado a lado</button>
                    <button className={compareView === "single" ? "active" : ""} onClick={() => setCompareView("single")}>Página única</button>
                    <button className="compare-export" onClick={() => void exportComparison()}><SevenIcon name="save" /> Salvar relatório</button>
                  </div>

                  {!activeDifference ? (
                    <div className="preflight-ok"><SevenIcon name="shield" /><span>Nenhuma diferença nas categorias visíveis.</span></div>
                  ) : (
                    <article className="compare-detail">
                      <header>
                        <div>
                          <span className="eyebrow">PÁGINA {activeDifference.pageIndex + 1}</span>
                          <h3>{activeDifference.status}</h3>
                        </div>
                        <div className="compare-badges">{activeDifference.categories.map((category) => <span key={category}>{category}</span>)}</div>
                      </header>

                      {!comparison.textOnly && (activeDifference.leftPreview || activeDifference.rightPreview) && (
                        <div className={compareView === "side" ? "compare-previews side" : "compare-previews single"}>
                          {activeDifference.leftPreview && (
                            <figure><figcaption>Arquivo A</figcaption><img src={nativeAssetUrl(activeDifference.leftPreview)} alt={`Página ${activeDifference.pageIndex + 1} do arquivo A`} /></figure>
                          )}
                          {activeDifference.rightPreview && (
                            <figure><figcaption>Arquivo B</figcaption><img src={nativeAssetUrl(activeDifference.rightPreview)} alt={`Página ${activeDifference.pageIndex + 1} do arquivo B`} /></figure>
                          )}
                        </div>
                      )}

                      <div className="compare-metrics">
                        <span><b>+{activeDifference.textAdded}</b> palavras</span>
                        <span><b>-{activeDifference.textRemoved}</b> palavras</span>
                        {!comparison.textOnly && <span><b>{activeDifference.visualDifferencePercent.toFixed(2)}%</b> visual</span>}
                        {!comparison.textOnly && <span><b>{activeDifference.graphicsDelta >= 0 ? "+" : ""}{activeDifference.graphicsDelta}</b> gráficos</span>}
                        {!comparison.textOnly && <span><b>{activeDifference.annotationsDelta >= 0 ? "+" : ""}{activeDifference.annotationsDelta}</b> anotações</span>}
                        {activeDifference.movedFrom !== undefined && <span><b>→ pág. {activeDifference.movedFrom + 1}</b> conteúdo movido</span>}
                      </div>

                      <div className="compare-text-panes">
                        <p><b>Arquivo A</b>{activeDifference.leftExcerpt || "Página ausente / sem texto"}</p>
                        <p><b>Arquivo B</b>{activeDifference.rightExcerpt || "Página ausente / sem texto"}</p>
                      </div>
                    </article>
                  )}

                  <div className="compare-difference-list">
                    {visibleDifferences.map((item, index) => (
                      <button key={item.pageIndex} className={index === differenceIndex ? "active" : ""} onClick={() => setDifferenceIndex(index)}>
                        <strong>Página {item.pageIndex + 1}</strong>
                        <span>{item.categories.join(" · ")}</span>
                        <small>{item.status}</small>
                      </button>
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
