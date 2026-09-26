import { useEffect, useMemo, useState } from "react";
import type {
  ArticleBoxInfo,
  ArticleBoxUpdate,
  ArticleInfo,
  ArticleMetadataUpdate,
  NewArticleBox,
  NormalizedRect,
} from "../types";
import { SevenIcon } from "./SevenIcon";

interface ArticlesDialogProps {
  pageIndex: number;
  initialSelection?: NormalizedRect;
  articles: ArticleInfo[];
  loading: boolean;
  onClose: () => void;
  onReload: () => void;
  onNavigate: (pageIndex: number, rect?: NormalizedRect) => void;
  onFinishReading: () => void;
  onAddBox: (request: NewArticleBox) => void;
  onUpdateArticle: (update: ArticleMetadataUpdate) => void;
  onUpdateBox: (update: ArticleBoxUpdate) => void;
  onMoveBox: (objectId: string, direction: "up" | "down" | "first" | "last") => void;
  onDeleteBox: (objectId: string) => void;
  onDeleteArticle: (objectId: string) => void;
  onMerge: (targetId: string, sourceId: string) => void;
}

const fallbackRect: NormalizedRect = { x: 0.08, y: 0.08, width: 0.84, height: 0.3 };

export function ArticlesDialog({
  pageIndex,
  initialSelection,
  articles,
  loading,
  onClose,
  onReload,
  onNavigate,
  onFinishReading,
  onAddBox,
  onUpdateArticle,
  onUpdateBox,
  onMoveBox,
  onDeleteBox,
  onDeleteArticle,
  onMerge,
}: ArticlesDialogProps) {
  const [selectedId, setSelectedId] = useState("");
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [author, setAuthor] = useState("");
  const [keywords, setKeywords] = useState("");
  const [rect, setRect] = useState<NormalizedRect>(initialSelection ?? fallbackRect);
  const [boxPage, setBoxPage] = useState(pageIndex + 1);
  const [insertAt, setInsertAt] = useState<number | "">("");
  const [reading, setReading] = useState(false);
  const [readIndex, setReadIndex] = useState(0);
  const [mergeSource, setMergeSource] = useState("");

  useEffect(() => { onReload(); }, []);
  useEffect(() => {
    setRect(initialSelection ?? fallbackRect);
    setBoxPage(pageIndex + 1);
  }, [initialSelection, pageIndex]);

  const selected = useMemo(
    () => articles.find((article) => article.objectId === selectedId) ?? null,
    [articles, selectedId],
  );

  useEffect(() => {
    if (!selected) return;
    setTitle(selected.title);
    setSubject(selected.subject);
    setAuthor(selected.author);
    setKeywords(selected.keywords);
    setReadIndex(0);
    setMergeSource("");
  }, [selected?.objectId]);

  useEffect(() => {
    if (!selectedId && articles[0]) setSelectedId(articles[0].objectId);
    if (selectedId && !articles.some((article) => article.objectId === selectedId)) {
      setSelectedId(articles[0]?.objectId ?? "");
    }
  }, [articles, selectedId]);

  const updateRect = (key: keyof NormalizedRect, value: number) => {
    setRect((current) => {
      const next = { ...current, [key]: Math.max(0, Math.min(1, value)) };
      if (next.x + next.width > 1) next.width = Math.max(0.001, 1 - next.x);
      if (next.y + next.height > 1) next.height = Math.max(0.001, 1 - next.y);
      next.width = Math.max(0.001, next.width);
      next.height = Math.max(0.001, next.height);
      return next;
    });
  };

  const createNewArticle = () => {
    onAddBox({
      title: title.trim() || "Novo artigo",
      subject,
      author,
      keywords,
      pageIndex: Math.max(0, boxPage - 1),
      rect,
      insertAt: undefined,
    });
  };

  const addToSelected = () => {
    if (!selected) return;
    onAddBox({
      articleObjectId: selected.objectId,
      title: selected.title,
      subject: selected.subject,
      author: selected.author,
      keywords: selected.keywords,
      pageIndex: Math.max(0, boxPage - 1),
      rect,
      insertAt: insertAt === "" ? undefined : Math.max(0, insertAt - 1),
    });
  };

  const saveMetadata = () => {
    if (!selected) return;
    onUpdateArticle({
      objectId: selected.objectId,
      title,
      subject,
      author,
      keywords,
    });
  };

  const navigateBox = (box: ArticleBoxInfo, index: number) => {
    setReadIndex(index);
    onNavigate(box.pageIndex, box.normalizedRect);
  };

  const beginReading = () => {
    if (!selected?.boxes.length) return;
    setReading(true);
    setReadIndex(0);
    navigateBox(selected.boxes[0], 0);
  };

  const stepReading = (delta: -1 | 1) => {
    if (!selected?.boxes.length) return;
    const next = readIndex + delta;
    if (next < 0) return;
    if (next >= selected.boxes.length) {
      setReading(false);
      onFinishReading();
      return;
    }
    navigateBox(selected.boxes[next], next);
  };

  const loadBoxGeometry = (box: ArticleBoxInfo) => {
    setRect(box.normalizedRect);
    setBoxPage(box.pageIndex + 1);
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="articles-dialog" role="dialog" aria-modal="true">
        <header className="organizer-head">
          <div>
            <span className="eyebrow">ARTICLES PDF</span>
            <h2>Sequências de leitura</h2>
            <p>Threads e Article Boxes nativos do PDF, com navegação caixa a caixa.</p>
          </div>
          <button className="icon-button" onClick={onClose}><SevenIcon name="close" /></button>
        </header>

        <div className="articles-layout">
          <aside className="articles-list">
            <div className="section-heading section-heading--compact">
              <div><span className="eyebrow">THREADS</span><h3>{articles.length} artigo(s)</h3></div>
              <button className="icon-button" onClick={onReload}><SevenIcon name="history" /></button>
            </div>
            {loading && <div className="report-loading"><span className="loader-ring" /> Lendo threads…</div>}
            {!loading && articles.length === 0 && <div className="activity-empty">Nenhum Article thread neste PDF.</div>}
            {articles.map((article, index) => (
              <button
                key={article.objectId}
                className={selectedId === article.objectId ? "article-list-item active" : "article-list-item"}
                onClick={() => setSelectedId(article.objectId)}
              >
                <span>{index + 1}</span>
                <div>
                  <strong>{article.title || `Artigo ${index + 1}`}</strong>
                  <small>{article.boxes.length} caixa(s) · {article.author || "sem autor"}</small>
                </div>
                <SevenIcon name="chevronRight" />
              </button>
            ))}
          </aside>

          <main className="articles-work">
            <section className="articles-create-box">
              <div className="section-mini-title">{selected ? "Adicionar / inserir Article Box" : "Criar primeiro Article Box"}</div>
              <div className="article-selection-status">
                <SevenIcon name="select" />
                <span>{initialSelection ? "A seleção visual atual foi carregada." : "Sem seleção visual: ajuste a geometria normalizada abaixo."}</span>
              </div>
              <div className="five-column-fields">
                <label className="workflow-field"><span>Página</span><input type="number" min={1} value={boxPage} onChange={(event) => setBoxPage(Math.max(1, Number(event.target.value) || 1))} /></label>
                <label className="workflow-field"><span>X</span><input type="number" min={0} max={1} step={0.001} value={rect.x} onChange={(event) => updateRect("x", Number(event.target.value))} /></label>
                <label className="workflow-field"><span>Y</span><input type="number" min={0} max={1} step={0.001} value={rect.y} onChange={(event) => updateRect("y", Number(event.target.value))} /></label>
                <label className="workflow-field"><span>Largura</span><input type="number" min={0.001} max={1} step={0.001} value={rect.width} onChange={(event) => updateRect("width", Number(event.target.value))} /></label>
                <label className="workflow-field"><span>Altura</span><input type="number" min={0.001} max={1} step={0.001} value={rect.height} onChange={(event) => updateRect("height", Number(event.target.value))} /></label>
              </div>
              {selected ? (
                <div className="two-column-fields">
                  <label className="workflow-field"><span>Inserir antes da caixa</span><input type="number" min={1} max={selected.boxes.length + 1} value={insertAt} onChange={(event) => setInsertAt(event.target.value ? Math.max(1, Number(event.target.value)) : "")} placeholder="Final" /></label>
                  <button className="primary-button article-inline-action" onClick={addToSelected}><SevenIcon name="create" /> Adicionar ao artigo</button>
                </div>
              ) : (
                <>
                  <div className="two-column-fields">
                    <label className="workflow-field"><span>Título</span><input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
                    <label className="workflow-field"><span>Autor</span><input value={author} onChange={(event) => setAuthor(event.target.value)} /></label>
                  </div>
                  <label className="workflow-field"><span>Assunto</span><input value={subject} onChange={(event) => setSubject(event.target.value)} /></label>
                  <label className="workflow-field"><span>Keywords</span><input value={keywords} onChange={(event) => setKeywords(event.target.value)} /></label>
                  <button className="primary-button workflow-submit" onClick={createNewArticle}><SevenIcon name="create" /> Criar artigo e primeira caixa</button>
                </>
              )}
            </section>

            {selected && (
              <>
                <section className="article-metadata">
                  <div className="section-mini-title">Metadados do artigo</div>
                  <div className="two-column-fields">
                    <label className="workflow-field"><span>Título</span><input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
                    <label className="workflow-field"><span>Autor</span><input value={author} onChange={(event) => setAuthor(event.target.value)} /></label>
                  </div>
                  <label className="workflow-field"><span>Assunto</span><input value={subject} onChange={(event) => setSubject(event.target.value)} /></label>
                  <label className="workflow-field"><span>Keywords</span><input value={keywords} onChange={(event) => setKeywords(event.target.value)} /></label>
                  <div className="article-metadata-actions">
                    <button className="secondary-light-button" onClick={saveMetadata}><SevenIcon name="save" /> Salvar metadados</button>
                    <button className="danger-quiet" onClick={() => onDeleteArticle(selected.objectId)}>Excluir artigo inteiro</button>
                  </div>
                </section>

                <section className="article-boxes">
                  <div className="article-boxes-head">
                    <div><span className="eyebrow">SEQUÊNCIA</span><h3>{selected.boxes.length} Article Box(es)</h3></div>
                    <button className="secondary-light-button" disabled={!selected.boxes.length} onClick={beginReading}><SevenIcon name="pages" /> Ler artigo</button>
                  </div>

                  {reading && selected.boxes.length > 0 && (
                    <div className="article-reader">
                      <span>Artigo {articles.indexOf(selected) + 1} · caixa {readIndex + 1}/{selected.boxes.length}</span>
                      <div>
                        <button disabled={readIndex === 0} onClick={() => stepReading(-1)}><SevenIcon name="chevronLeft" /> Anterior</button>
                        <button onClick={() => stepReading(1)}>{readIndex + 1 >= selected.boxes.length ? "Finalizar" : "Próxima"} <SevenIcon name="chevronRight" /></button>
                      </div>
                    </div>
                  )}

                  <div className="article-box-list">
                    {selected.boxes.map((box, index) => (
                      <article className={reading && readIndex === index ? "article-box-row active" : "article-box-row"} key={box.objectId}>
                        <button className="article-box-main" onClick={() => navigateBox(box, index)}>
                          <span>{articles.indexOf(selected) + 1}-{index + 1}</span>
                          <div>
                            <strong>Página {box.pageIndex + 1}</strong>
                            <small>X {box.normalizedRect.x.toFixed(3)} · Y {box.normalizedRect.y.toFixed(3)} · {box.normalizedRect.width.toFixed(3)} × {box.normalizedRect.height.toFixed(3)}</small>
                          </div>
                        </button>
                        <div className="article-box-actions">
                          <button title="Primeira" onClick={() => onMoveBox(box.objectId, "first")}>⇤</button>
                          <button title="Subir" onClick={() => onMoveBox(box.objectId, "up")}>↑</button>
                          <button title="Descer" onClick={() => onMoveBox(box.objectId, "down")}>↓</button>
                          <button title="Última" onClick={() => onMoveBox(box.objectId, "last")}>⇥</button>
                          <button title="Carregar geometria" onClick={() => loadBoxGeometry(box)}><SevenIcon name="edit" /></button>
                          <button title="Aplicar geometria atual" onClick={() => onUpdateBox({ objectId: box.objectId, pageIndex: Math.max(0, boxPage - 1), rect })}><SevenIcon name="save" /></button>
                          <button className="danger" title="Excluir caixa" onClick={() => onDeleteBox(box.objectId)}><SevenIcon name="close" /></button>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>

                {articles.length > 1 && (
                  <section className="article-merge">
                    <div><strong>Combinar artigos</strong><small>Move as caixas do artigo de origem para o final deste thread e remove o thread de origem.</small></div>
                    <select value={mergeSource} onChange={(event) => setMergeSource(event.target.value)}>
                      <option value="">Escolher origem…</option>
                      {articles.filter((article) => article.objectId !== selected.objectId).map((article) => (
                        <option value={article.objectId} key={article.objectId}>{article.title || article.objectId}</option>
                      ))}
                    </select>
                    <button className="secondary-light-button" disabled={!mergeSource} onClick={() => onMerge(selected.objectId, mergeSource)}>Combinar</button>
                  </section>
                )}
              </>
            )}
          </main>
        </div>

        <footer className="organizer-actions">
          <span className="dialog-footnote">A numeração artigo-caixa é recalculada automaticamente pela ordem atual do thread.</span>
          <button className="secondary-light-button" onClick={onClose}>Fechar</button>
        </footer>
      </section>
    </div>
  );
}
