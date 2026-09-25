import { useMemo, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import type { AnnotationInfo, AnnotationInput, AnnotationKind } from "../types";
import { SevenIcon } from "./SevenIcon";

interface CommentsDialogProps {
  documentPath: string;
  pageIndex: number;
  annotations: AnnotationInfo[];
  loading: boolean;
  onClose: () => void;
  onReload: () => void;
  onAdd: (output: string, annotation: AnnotationInput) => void;
  onDelete: (output: string, objectId: string) => void;
}

const kinds: Array<{ id: AnnotationKind; label: string }> = [
  { id: "note", label: "Nota" },
  { id: "highlight", label: "Destaque" },
  { id: "underline", label: "Sublinhado" },
  { id: "strikeout", label: "Tachado" },
  { id: "stamp", label: "Carimbo" },
  { id: "freetext", label: "Texto livre" },
];

export function CommentsDialog({
  documentPath,
  pageIndex,
  annotations,
  loading,
  onClose,
  onReload,
  onAdd,
  onDelete,
}: CommentsDialogProps) {
  const [tab, setTab] = useState<"add" | "list">("add");
  const [kind, setKind] = useState<AnnotationKind>("note");
  const [text, setText] = useState("");
  const [author, setAuthor] = useState("Seven Reader");
  const [x, setX] = useState(48);
  const [y, setY] = useState(48);
  const [width, setWidth] = useState(180);
  const [height, setHeight] = useState(36);

  const currentPage = useMemo(
    () => annotations.filter((annotation) => annotation.pageIndex === pageIndex),
    [annotations, pageIndex],
  );

  const outputPath = async (suffix: string) => save({
    title: "Salvar PDF comentado",
    defaultPath: documentPath.replace(/\.pdf$/i, `-${suffix}.pdf`),
    filters: [{ name: "Documento PDF", extensions: ["pdf"] }],
  });

  const submit = async () => {
    const output = await outputPath("comentado");
    if (!output) return;
    onAdd(output, { pageIndex, kind, text, author, x, y, width, height });
  };

  const remove = async (annotation: AnnotationInfo) => {
    const output = await outputPath("comentario-removido");
    if (output) onDelete(output, annotation.objectId);
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="workflow-dialog comment-dialog" role="dialog" aria-modal="true">
        <header className="organizer-head">
          <div><span className="eyebrow">COMENTÁRIOS</span><h2>Revisar documento</h2><p>Página {pageIndex + 1} · anotações gravadas na estrutura real do PDF.</p></div>
          <button className="icon-button" onClick={onClose} aria-label="Fechar"><SevenIcon name="close" /></button>
        </header>
        <div className="workflow-tabs">
          <button className={tab === "add" ? "active" : ""} onClick={() => setTab("add")}>Adicionar</button>
          <button className={tab === "list" ? "active" : ""} onClick={() => { setTab("list"); onReload(); }}>Lista ({annotations.length})</button>
        </div>
        <div className="workflow-body">
          {tab === "add" ? (
            <>
              <div className="format-grid annotation-kind-grid">
                {kinds.map((item) => (
                  <button key={item.id} className={kind === item.id ? "format-card active" : "format-card"} onClick={() => setKind(item.id)}>
                    <SevenIcon name={item.id === "stamp" ? "certificate" : item.id === "note" ? "comment" : item.id === "freetext" ? "text" : "highlight"} />
                    <strong>{item.label}</strong>
                  </button>
                ))}
              </div>
              <label className="workflow-field"><span>Texto / conteúdo</span><textarea value={text} onChange={(event) => setText(event.target.value)} rows={4} placeholder="Escreva o comentário…" /></label>
              <label className="workflow-field"><span>Autor</span><input value={author} onChange={(event) => setAuthor(event.target.value)} /></label>
              <div className="rect-grid">
                <label className="workflow-field"><span>X</span><input type="number" value={x} onChange={(event) => setX(Number(event.target.value))} /></label>
                <label className="workflow-field"><span>Y</span><input type="number" value={y} onChange={(event) => setY(Number(event.target.value))} /></label>
                <label className="workflow-field"><span>Largura</span><input type="number" min={1} value={width} onChange={(event) => setWidth(Number(event.target.value))} /></label>
                <label className="workflow-field"><span>Altura</span><input type="number" min={1} value={height} onChange={(event) => setHeight(Number(event.target.value))} /></label>
              </div>
              <div className="organizer-note"><SevenIcon name="comment" /><span>As coordenadas usam pontos PDF. O editor visual por arraste será ligado ao canvas quando o módulo de seleção de objetos estiver concluído.</span></div>
              <button className="primary-button workflow-submit" disabled={!text.trim() || width <= 0 || height <= 0} onClick={() => void submit()}><SevenIcon name="comment" /> Adicionar comentário</button>
            </>
          ) : (
            <>
              {loading && <div className="report-loading"><span className="loader-ring" /> Lendo anotações…</div>}
              {!loading && annotations.length === 0 && <div className="empty-panel">Nenhuma anotação encontrada.</div>}
              {!loading && annotations.length > 0 && (
                <>
                  <div className="section-mini-title">Página atual ({currentPage.length})</div>
                  <div className="annotation-list">
                    {annotations.map((annotation) => (
                      <article className={annotation.pageIndex === pageIndex ? "annotation-row current" : "annotation-row"} key={annotation.objectId}>
                        <span className="annotation-glyph"><SevenIcon name="comment" /></span>
                        <div><strong>{annotation.kind} · página {annotation.pageIndex + 1}</strong><p>{annotation.text || "Sem texto"}</p><small>{annotation.author || "Autor não informado"}</small></div>
                        <button className="danger-quiet" onClick={() => void remove(annotation)}>Remover</button>
                      </article>
                    ))}
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
