import { useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { AnnotationInfo, AnnotationInput, AnnotationKind, StampInput } from "../types";
import { SevenIcon } from "./SevenIcon";

interface CommentsDialogProps {
  pageIndex: number;
  annotations: AnnotationInfo[];
  loading: boolean;
  onClose: () => void;
  onReload: () => void;
  onAdd: (annotation: AnnotationInput) => void;
  onStamp: (stamp: StampInput) => void;
  onDelete: (objectId: string) => void;
}

interface StampIdentity {
  name: string;
  organization: string;
  email: string;
}

interface StampTemplate {
  id: string;
  name: string;
  category: string;
  text: string;
  dynamic: boolean;
  imagePath?: string;
  custom?: boolean;
  fill: string;
  border: string;
  textColor: string;
}

const STAMP_IDENTITY_KEY = "seven-reader:stamp-identity:v1";
const STAMP_CUSTOM_KEY = "seven-reader:custom-stamps:v1";

const standardStamps: StampTemplate[] = [
  { id: "approved", name: "Aprovado", category: "Padrão", text: "APROVADO", dynamic: false, fill: "#e9f8f0", border: "#23845b", textColor: "#176241" },
  { id: "draft", name: "Rascunho", category: "Padrão", text: "RASCUNHO", dynamic: false, fill: "#fff7df", border: "#b27a10", textColor: "#7d560c" },
  { id: "final", name: "Final", category: "Padrão", text: "FINAL", dynamic: false, fill: "#eef2ff", border: "#5367c7", textColor: "#3b4c9c" },
  { id: "confidential", name: "Confidencial", category: "Padrão", text: "CONFIDENCIAL", dynamic: false, fill: "#fff0f2", border: "#aa4353", textColor: "#862f3c" },
  { id: "reviewed", name: "Revisado", category: "Dinâmico", text: "REVISADO\n{date} · {user}", dynamic: true, fill: "#f2edff", border: "#6545c2", textColor: "#4c3298" },
  { id: "received", name: "Recebido", category: "Dinâmico", text: "RECEBIDO\n{date} {time}", dynamic: true, fill: "#eaf7ff", border: "#307da8", textColor: "#245f80" },
  { id: "identity", name: "Identidade", category: "Dinâmico", text: "{user}\n{organization}", dynamic: true, fill: "#f6f6f8", border: "#646772", textColor: "#454750" },
];

function loadStampIdentity(): StampIdentity {
  try {
    const parsed = JSON.parse(localStorage.getItem(STAMP_IDENTITY_KEY) ?? "{}");
    return {
      name: typeof parsed.name === "string" ? parsed.name : "Seven Reader",
      organization: typeof parsed.organization === "string" ? parsed.organization : "",
      email: typeof parsed.email === "string" ? parsed.email : "",
    };
  } catch {
    return { name: "Seven Reader", organization: "", email: "" };
  }
}

function loadCustomStamps(): StampTemplate[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STAMP_CUSTOM_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "").padEnd(6, "0").slice(0, 6);
  return [
    parseInt(value.slice(0, 2), 16) / 255,
    parseInt(value.slice(2, 4), 16) / 255,
    parseInt(value.slice(4, 6), 16) / 255,
  ];
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
  pageIndex,
  annotations,
  loading,
  onClose,
  onReload,
  onAdd,
  onStamp,
  onDelete,
}: CommentsDialogProps) {
  const [tab, setTab] = useState<"add" | "stamps" | "list">("add");
  const [kind, setKind] = useState<AnnotationKind>("note");
  const [text, setText] = useState("");
  const [author, setAuthor] = useState("Seven Reader");
  const [x, setX] = useState(48);
  const [y, setY] = useState(48);
  const [width, setWidth] = useState(180);
  const [height, setHeight] = useState(36);
  const [stampIdentity, setStampIdentity] = useState<StampIdentity>(loadStampIdentity);
  const [customStamps, setCustomStamps] = useState<StampTemplate[]>(loadCustomStamps);
  const [selectedStampId, setSelectedStampId] = useState("approved");
  const [stampX, setStampX] = useState(48);
  const [stampY, setStampY] = useState(48);
  const [stampWidth, setStampWidth] = useState(190);
  const [stampHeight, setStampHeight] = useState(64);
  const [customStampName, setCustomStampName] = useState("");
  const [customStampCategory, setCustomStampCategory] = useState("Personalizado");
  const [customStampText, setCustomStampText] = useState("");
  const [customStampImage, setCustomStampImage] = useState("");

  const stamps = useMemo(() => [...standardStamps, ...customStamps], [customStamps]);
  const selectedStamp = useMemo(
    () => stamps.find((stamp) => stamp.id === selectedStampId) ?? stamps[0],
    [stamps, selectedStampId],
  );
  const stampCategories = useMemo(
    () => [...new Set(stamps.map((stamp) => stamp.category))],
    [stamps],
  );

  const currentPage = useMemo(
    () => annotations.filter((annotation) => annotation.pageIndex === pageIndex),
    [annotations, pageIndex],
  );

  const resolveStampText = (template: StampTemplate): string => {
    const now = new Date();
    return template.text
      .replaceAll("{date}", now.toLocaleDateString("pt-BR"))
      .replaceAll("{time}", now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }))
      .replaceAll("{user}", stampIdentity.name || "Usuário")
      .replaceAll("{organization}", stampIdentity.organization || "")
      .replaceAll("{email}", stampIdentity.email || "");
  };

  const persistIdentity = (next: StampIdentity) => {
    setStampIdentity(next);
    localStorage.setItem(STAMP_IDENTITY_KEY, JSON.stringify(next));
  };

  const persistCustom = (next: StampTemplate[]) => {
    setCustomStamps(next);
    localStorage.setItem(STAMP_CUSTOM_KEY, JSON.stringify(next));
  };

  const chooseStampImage = async () => {
    const selected = await open({
      title: "Selecionar imagem do carimbo",
      multiple: false,
      directory: false,
      filters: [{ name: "Imagem", extensions: ["png", "jpg", "jpeg", "tif", "tiff", "bmp", "webp"] }],
    });
    if (typeof selected === "string") setCustomStampImage(selected);
  };

  const saveCustomStamp = () => {
    const name = customStampName.trim();
    if (!name || (!customStampText.trim() && !customStampImage)) return;
    const item: StampTemplate = {
      id: `custom-${Date.now()}`,
      name,
      category: customStampCategory.trim() || "Personalizado",
      text: customStampText.trim(),
      dynamic: /\{(?:date|time|user|organization|email)\}/.test(customStampText),
      imagePath: customStampImage || undefined,
      custom: true,
      fill: "#ffffff",
      border: "#6545c2",
      textColor: "#4c3298",
    };
    const next = [...customStamps, item];
    persistCustom(next);
    setSelectedStampId(item.id);
    setCustomStampName("");
    setCustomStampText("");
    setCustomStampImage("");
  };

  const removeCustomStamp = (id: string) => {
    const next = customStamps.filter((stamp) => stamp.id !== id);
    persistCustom(next);
    if (selectedStampId === id) setSelectedStampId("approved");
  };

  const applyStamp = () => {
    if (!selectedStamp) return;
    const resolved = resolveStampText(selectedStamp);
    onStamp({
      pageIndex,
      name: selectedStamp.name.replace(/[^A-Za-z0-9]/g, "") || "SevenStamp",
      category: selectedStamp.category,
      text: resolved,
      author: stampIdentity.name || "Seven Reader",
      imagePath: selectedStamp.imagePath,
      x: stampX,
      y: stampY,
      width: stampWidth,
      height: stampHeight,
      fillColor: hexToRgb(selectedStamp.fill),
      borderColor: hexToRgb(selectedStamp.border),
      textColor: hexToRgb(selectedStamp.textColor),
    });
  };

  const submit = () => {
    onAdd({ pageIndex, kind, text, author, x, y, width, height });
  };

  const remove = (annotation: AnnotationInfo) => {
    onDelete(annotation.objectId);
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="workflow-dialog comment-dialog" role="dialog" aria-modal="true">
        <header className="organizer-head">
          <div><span className="eyebrow">COMENTÁRIOS</span><h2>Revisar documento</h2><p>Página {pageIndex + 1} · alterações entram na sessão e só substituem o original ao salvar.</p></div>
          <button className="icon-button" onClick={onClose} aria-label="Fechar"><SevenIcon name="close" /></button>
        </header>
        <div className="workflow-tabs">
          <button className={tab === "add" ? "active" : ""} onClick={() => setTab("add")}>Adicionar</button>
          <button className={tab === "stamps" ? "active" : ""} onClick={() => setTab("stamps")}>Carimbos</button>
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
              <div className="organizer-note"><SevenIcon name="comment" /><span>As coordenadas usam pontos PDF. Para desenho livre com mouse ou caneta, use o ícone de lápis na barra flutuante do documento.</span></div>
              <button className="primary-button workflow-submit" disabled={!text.trim() || width <= 0 || height <= 0} onClick={submit}><SevenIcon name="comment" /> Adicionar comentário</button>
            </>
          ) : tab === "stamps" ? (
            <>
              <section className="stamp-identity-box">
                <div className="section-mini-title">Identidade dinâmica</div>
                <div className="three-column-fields">
                  <label className="workflow-field"><span>Usuário</span><input value={stampIdentity.name} onChange={(event) => persistIdentity({ ...stampIdentity, name: event.target.value })} /></label>
                  <label className="workflow-field"><span>Organização</span><input value={stampIdentity.organization} onChange={(event) => persistIdentity({ ...stampIdentity, organization: event.target.value })} /></label>
                  <label className="workflow-field"><span>E-mail</span><input value={stampIdentity.email} onChange={(event) => persistIdentity({ ...stampIdentity, email: event.target.value })} /></label>
                </div>
              </section>

              <div className="stamp-library">
                {stampCategories.map((category) => (
                  <section key={category}>
                    <div className="section-mini-title">{category}</div>
                    <div className="stamp-card-grid">
                      {stamps.filter((stamp) => stamp.category === category).map((stamp) => (
                        <button key={stamp.id} className={selectedStampId === stamp.id ? "stamp-card active" : "stamp-card"} onClick={() => setSelectedStampId(stamp.id)}>
                          <span style={{ background: stamp.fill, borderColor: stamp.border, color: stamp.textColor }}>{resolveStampText(stamp).split("\n")[0] || stamp.name}</span>
                          <small>{stamp.name}{stamp.dynamic ? " · dinâmico" : ""}</small>
                          {stamp.custom && <i onClick={(event) => { event.stopPropagation(); removeCustomStamp(stamp.id); }}><SevenIcon name="close" /></i>}
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>

              <section className="stamp-placement">
                <div className="section-mini-title">Posição e tamanho</div>
                <div className="four-column-fields">
                  <label className="workflow-field"><span>X</span><input type="number" value={stampX} onChange={(event) => setStampX(Number(event.target.value))} /></label>
                  <label className="workflow-field"><span>Y</span><input type="number" value={stampY} onChange={(event) => setStampY(Number(event.target.value))} /></label>
                  <label className="workflow-field"><span>Largura</span><input type="number" min={12} value={stampWidth} onChange={(event) => setStampWidth(Math.max(12, Number(event.target.value) || 12))} /></label>
                  <label className="workflow-field"><span>Altura</span><input type="number" min={12} value={stampHeight} onChange={(event) => setStampHeight(Math.max(12, Number(event.target.value) || 12))} /></label>
                </div>
                <div className="stamp-preview" style={{ background: selectedStamp.fill, borderColor: selectedStamp.border, color: selectedStamp.textColor }}>
                  {resolveStampText(selectedStamp).split("\n").map((line, index) => <span key={index}>{line}</span>)}
                  {selectedStamp.imagePath && <small>+ imagem personalizada</small>}
                </div>
                <button className="primary-button workflow-submit" onClick={applyStamp}><SevenIcon name="certificate" /> Aplicar carimbo à página {pageIndex + 1}</button>
              </section>

              <section className="stamp-create-box">
                <div className="section-mini-title">Criar carimbo personalizado</div>
                <div className="two-column-fields">
                  <label className="workflow-field"><span>Nome</span><input value={customStampName} onChange={(event) => setCustomStampName(event.target.value)} /></label>
                  <label className="workflow-field"><span>Categoria</span><input value={customStampCategory} onChange={(event) => setCustomStampCategory(event.target.value)} /></label>
                </div>
                <label className="workflow-field"><span>Texto / template</span><textarea rows={3} value={customStampText} onChange={(event) => setCustomStampText(event.target.value)} placeholder="Ex.: APROVADO\n{date} · {user}" /><small>Variáveis: {"{date}"}, {"{time}"}, {"{user}"}, {"{organization}"}, {"{email}"}.</small></label>
                <button className="secondary-light-button choose-wide" onClick={() => void chooseStampImage()}><SevenIcon name="open" /> {customStampImage || "Imagem opcional do carimbo"}</button>
                <button className="secondary-light-button choose-wide" disabled={!customStampName.trim() || (!customStampText.trim() && !customStampImage)} onClick={saveCustomStamp}><SevenIcon name="save" /> Salvar na biblioteca</button>
              </section>
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
                        <button className="danger-quiet" onClick={() => remove(annotation)}>Remover</button>
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
