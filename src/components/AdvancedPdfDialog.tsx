import { useEffect, useMemo, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { AdvancedPdfReport, LayerPropertiesUpdate } from "../types";
import { SevenIcon } from "./SevenIcon";

type AdvancedTab = "overview" | "bookmarks" | "attachments" | "layers";

interface AdvancedPdfDialogProps {
  pageIndex: number;
  report: AdvancedPdfReport | null;
  loading: boolean;
  initialTab?: AdvancedTab;
  onClose: () => void;
  onReload: () => void;
  onAddBookmark: (title: string, pageIndex: number) => void;
  onRenameBookmark: (objectId: string, title: string) => void;
  onDeleteBookmark: (objectId: string) => void;
  onMoveBookmark: (objectId: string, direction: "up" | "down" | "indent" | "outdent") => void;
  onSetBookmarkOpen: (objectId: string, open: boolean) => void;
  onAddAttachment: (filePath: string, displayName: string, description: string) => void;
  onUpdateAttachment: (objectId: string, name: string, description: string) => void;
  onRemoveAttachment: (objectId: string) => void;
  onExtractAttachment: (objectId: string, destination: string) => void;
  onLayerVisibility: (objectId: string, visible: boolean) => void;
  onUpdateLayer: (update: LayerPropertiesUpdate) => void;
  onApplyLayerOverrides: (context: "view" | "print" | "export") => void;
  onResetLayerVisibility: () => void;
}

function fileSize(value?: number): string {
  if (value === undefined) return "tamanho desconhecido";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / 1024 / 1024).toFixed(1)} MiB`;
}

export function AdvancedPdfDialog({
  pageIndex,
  report,
  loading,
  initialTab = "overview",
  onClose,
  onReload,
  onAddBookmark,
  onRenameBookmark,
  onDeleteBookmark,
  onMoveBookmark,
  onSetBookmarkOpen,
  onAddAttachment,
  onUpdateAttachment,
  onRemoveAttachment,
  onExtractAttachment,
  onLayerVisibility,
  onUpdateLayer,
  onApplyLayerOverrides,
  onResetLayerVisibility,
}: AdvancedPdfDialogProps) {
  const [tab, setTab] = useState<AdvancedTab>(initialTab);
  const [bookmarkTitle, setBookmarkTitle] = useState("");
  const [rename, setRename] = useState<Record<string,string>>({});
  const [attachmentName, setAttachmentName] = useState("");
  const [attachmentDescription, setAttachmentDescription] = useState("");
  const [attachmentPath, setAttachmentPath] = useState("");
  const [attachmentEdits, setAttachmentEdits] = useState<Record<string,{name:string;description:string}>>({});
  const [layerEdits, setLayerEdits] = useState<Record<string,LayerPropertiesUpdate>>({});

  useEffect(() => { onReload(); }, [onReload]);

  const activeWarnings = useMemo(() => {
    if (!report) return [];
    return [
      report.hasJavascript && "JavaScript embutido",
      report.hasLaunchActions && "ações Launch",
      report.hasOpenAction && "OpenAction",
      report.hasRichMedia && "Rich Media",
      report.hasThreeD && "conteúdo 3D",
    ].filter(Boolean) as string[];
  }, [report]);

  const chooseAttachment = async () => {
    const path = await open({ title: "Selecionar arquivo para incorporar", multiple: false, directory: false });
    if (typeof path === "string") {
      setAttachmentPath(path);
      setAttachmentName(path.split(/[\\/]/).pop() || "anexo");
    }
  };

  const addBookmark = () => {
    onAddBookmark(bookmarkTitle, pageIndex);
  };

  const addAttachment = () => {
    onAddAttachment(attachmentPath, attachmentName, attachmentDescription);
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event)=>event.target===event.currentTarget&&onClose()}>
      <section className="workflow-dialog advanced-dialog" role="dialog" aria-modal="true">
        <header className="organizer-head">
          <div><span className="eyebrow">ESTRUTURA PDF</span><h2>Inspector avançado</h2><p>Conteúdo ativo é apenas inspecionado; nunca é executado automaticamente.</p></div>
          <button className="icon-button" onClick={onClose}><SevenIcon name="close"/></button>
        </header>
        <div className="workflow-tabs">
          <button className={tab==="overview"?"active":""} onClick={()=>setTab("overview")}>Visão geral</button>
          <button className={tab==="bookmarks"?"active":""} onClick={()=>setTab("bookmarks")}>Marcadores</button>
          <button className={tab==="attachments"?"active":""} onClick={()=>setTab("attachments")}>Anexos</button>
          <button className={tab==="layers"?"active":""} onClick={()=>setTab("layers")}>Camadas</button>
        </div>
        <div className="workflow-body">
          {loading && <div className="report-loading"><span className="loader-ring"/> Lendo catálogo, name trees e objetos…</div>}
          {!loading && report && tab==="overview" && <>
            {activeWarnings.length>0 && <div className="active-content-warning"><SevenIcon name="shield"/><div><strong>Conteúdo ativo detectado</strong><span>{activeWarnings.join(", ")}. Execução permanece bloqueada; Sanitizar pode remover categorias perigosas.</span></div></div>}
            <div className="advanced-summary-grid">
              {[
                ["Marcadores",report.bookmarks.length],
                ["Anexos",report.attachments.length],
                ["Camadas",report.layers.length],
                ["Portfólio",report.isPortfolio?"Sim":"Não"],
                ["Rich Media",report.hasRichMedia?"Detectado":"Não"],
                ["3D",report.hasThreeD?"Detectado":"Não"],
                ["Geoespacial",report.hasGeospatial?"Detectado":"Não"],
                ["Articles",report.hasArticles?"Detectado":"Não"],
              ].map(([label,value])=><div className="advanced-stat" key={String(label)}><span>{label}</span><strong>{value}</strong></div>)}
            </div>
            <div className="safe-inspection-list">
              <div><SevenIcon name="portfolio"/><span><strong>Portfólio PDF</strong><small>{report.isPortfolio ? `Collection detectada · view ${report.portfolioView||"padrão"}` : "Não detectado"}</small></span></div>
              <div><SevenIcon name="attachment"/><span><strong>Rich Media / 3D</strong><small>{report.hasRichMedia||report.hasThreeD ? "Preservado; ativação bloqueada por padrão." : "Nenhum objeto ativo detectado."}</small></span></div>
              <div><SevenIcon name="pages"/><span><strong>Geoespacial</strong><small>{report.hasGeospatial ? "Measure/viewport/coordenadas espaciais detectadas." : "Não detectado."}</small></span></div>
              <div><SevenIcon name="bookmark"/><span><strong>Articles</strong><small>{report.hasArticles ? "Threads de leitura detectadas e preservadas." : "Não detectado."}</small></span></div>
            </div>
          </>}

          {!loading && report && tab==="bookmarks" && <>
            <div className="inline-create-row">
              <label className="workflow-field"><span>Novo marcador na página {pageIndex+1}</span><input value={bookmarkTitle} onChange={(e)=>setBookmarkTitle(e.target.value)} placeholder="Título"/></label>
              <button className="primary-button" disabled={!bookmarkTitle.trim()} onClick={addBookmark}><SevenIcon name="bookmark"/> Criar</button>
            </div>
            <div className="structure-list">
              {report.bookmarks.map((bookmark)=>(
                <div className="bookmark-row" key={bookmark.objectId} style={{paddingLeft:12+bookmark.depth*18}}>
                  <button className="bookmark-expand" disabled={!bookmark.hasChildren} onClick={()=>bookmark.hasChildren&&onSetBookmarkOpen(bookmark.objectId,!bookmark.open)} title={bookmark.open?"Recolher":"Expandir"}>
                    {bookmark.hasChildren ? (bookmark.open ? "▾" : "▸") : "·"}
                  </button>
                  <SevenIcon name="bookmark"/>
                  <div className="bookmark-main">
                    <input value={rename[bookmark.objectId]??bookmark.title} onChange={(e)=>setRename(current=>({...current,[bookmark.objectId]:e.target.value}))}/>
                    <small>{bookmark.pageIndex!==undefined?`Página ${bookmark.pageIndex+1}`:"Destino não resolvido"} · nível {bookmark.depth+1}</small>
                  </div>
                  <div className="bookmark-actions">
                    <button title="Subir" onClick={()=>onMoveBookmark(bookmark.objectId,"up")}>↑</button>
                    <button title="Descer" onClick={()=>onMoveBookmark(bookmark.objectId,"down")}>↓</button>
                    <button title="Tornar filho do marcador anterior" onClick={()=>onMoveBookmark(bookmark.objectId,"indent")}>→</button>
                    <button title="Subir um nível" disabled={!bookmark.parentObjectId} onClick={()=>onMoveBookmark(bookmark.objectId,"outdent")}>←</button>
                    <button title="Salvar nome" onClick={()=>onRenameBookmark(bookmark.objectId,rename[bookmark.objectId]??bookmark.title)}>Salvar</button>
                    <button className="danger-quiet" title="Excluir marcador e filhos" onClick={()=>onDeleteBookmark(bookmark.objectId)}>Excluir</button>
                  </div>
                </div>
              ))}
              {report.bookmarks.length===0&&<div className="empty-panel">Nenhum marcador no outline.</div>}
            </div>
          </>}

          {!loading && report && tab==="attachments" && <>
            <div className="attachment-create">
              <button className="secondary-light-button choose-wide" onClick={()=>void chooseAttachment()}><SevenIcon name="open"/>{attachmentPath||"Selecionar arquivo"}</button>
              <div className="two-column-fields"><label className="workflow-field"><span>Nome</span><input value={attachmentName} onChange={(e)=>setAttachmentName(e.target.value)}/></label><label className="workflow-field"><span>Descrição</span><input value={attachmentDescription} onChange={(e)=>setAttachmentDescription(e.target.value)}/></label></div>
              <button className="primary-button workflow-submit" disabled={!attachmentPath} onClick={addAttachment}><SevenIcon name="attachment"/> Incorporar arquivo</button>
            </div>
            <div className="organizer-note"><SevenIcon name="shield"/><span>Extensões executáveis e scripts perigosos são bloqueados ao incorporar. Extração é manual; o Seven nunca executa anexos automaticamente.</span></div>
            <div className="attachment-list">
              {report.attachments.map((attachment)=>{
                const edit=attachmentEdits[attachment.objectId]??{name:attachment.name,description:attachment.description};
                return (
                  <article className="attachment-row" key={attachment.objectId}>
                    <span className="attachment-glyph"><SevenIcon name="attachment"/></span>
                    <div className="attachment-edit-fields">
                      <input value={edit.name} onChange={(e)=>setAttachmentEdits(current=>({...current,[attachment.objectId]:{...edit,name:e.target.value}}))}/>
                      <input value={edit.description} onChange={(e)=>setAttachmentEdits(current=>({...current,[attachment.objectId]:{...edit,description:e.target.value}}))} placeholder="Descrição"/>
                      <small>{attachment.mime} · {fileSize(attachment.size)}</small>
                      <code title={attachment.sha256}>SHA‑256 {attachment.sha256.slice(0,16)}…</code>
                    </div>
                    <div className="attachment-row-actions">
                      <button onClick={()=>onUpdateAttachment(attachment.objectId,edit.name,edit.description)}>Salvar</button>
                      <button onClick={async()=>{const dest=await save({title:"Extrair anexo",defaultPath:edit.name||attachment.name});if(dest)onExtractAttachment(attachment.objectId,dest)}}>Extrair</button>
                      <button className="danger-quiet" onClick={()=>onRemoveAttachment(attachment.objectId)}>Remover</button>
                    </div>
                  </article>
                );
              })}
              {report.attachments.length===0&&<div className="empty-panel">Nenhum EmbeddedFile encontrado.</div>}
            </div>
          </>}

          {!loading && report && tab==="layers" && <>
            <div className="organizer-note"><SevenIcon name="layers"/><span>Alterar visibilidade grava o estado inicial ON/OFF da OCG na sessão atual; conteúdo da layer é preservado e a ação pode ser desfeita.</span></div>
            <div className="layer-context-toolbar">
              <button onClick={()=>onApplyLayerOverrides("view")}>Aplicar View</button>
              <button onClick={()=>onApplyLayerOverrides("print")}>Aplicar Print</button>
              <button onClick={()=>onApplyLayerOverrides("export")}>Aplicar Export</button>
              <button onClick={onResetLayerVisibility}>Reset ao BaseState</button>
            </div>
            <div className="layer-list">
              {report.layers.map((layer)=>{
                const edit=layerEdits[layer.objectId]??{
                  objectId:layer.objectId,
                  name:layer.name,
                  locked:layer.locked,
                  viewState:layer.viewState,
                  printState:layer.printState,
                  exportState:layer.exportState,
                };
                const patchLayer=<K extends keyof LayerPropertiesUpdate,>(key:K,value:LayerPropertiesUpdate[K])=>
                  setLayerEdits(current=>({...current,[layer.objectId]:{...edit,[key]:value}}));
                return (
                  <article className="layer-row" key={layer.objectId} style={{marginLeft:layer.depth*14}}>
                    <span className="layer-glyph"><SevenIcon name="layers"/></span>
                    <div className="layer-editor">
                      <input value={edit.name} onChange={(e)=>patchLayer("name",e.target.value)}/>
                      <div className="layer-selects">
                        <label>View<select value={edit.viewState} onChange={(e)=>patchLayer("viewState",e.target.value as LayerPropertiesUpdate["viewState"])}><option value="unchanged">Estado</option><option value="on">Sempre ON</option><option value="off">Sempre OFF</option></select></label>
                        <label>Print<select value={edit.printState} onChange={(e)=>patchLayer("printState",e.target.value as LayerPropertiesUpdate["printState"])}><option value="unchanged">Estado</option><option value="on">Sempre ON</option><option value="off">Sempre OFF</option></select></label>
                        <label>Export<select value={edit.exportState} onChange={(e)=>patchLayer("exportState",e.target.value as LayerPropertiesUpdate["exportState"])}><option value="unchanged">Estado</option><option value="on">Sempre ON</option><option value="off">Sempre OFF</option></select></label>
                      </div>
                      <small>{layer.intent.length?`Intent: ${layer.intent.join(", ")}`:"Intent não declarado"} · nível {layer.depth+1}</small>
                    </div>
                    <div className="layer-row-actions">
                      <label className="layer-lock"><input type="checkbox" checked={edit.locked} onChange={(e)=>patchLayer("locked",e.target.checked)}/> Bloqueada</label>
                      <button className={layer.visible?"layer-toggle active":"layer-toggle"} onClick={()=>onLayerVisibility(layer.objectId,!layer.visible)}>{layer.visible?"Visível":"Oculta"}</button>
                      <button onClick={()=>onUpdateLayer(edit)}>Salvar propriedades</button>
                    </div>
                  </article>
                );
              })}
              {report.layers.length===0&&<div className="empty-panel">Nenhuma Optional Content Group detectada.</div>}
            </div>
          </>}
        </div>
      </section>
    </div>
  );
}
