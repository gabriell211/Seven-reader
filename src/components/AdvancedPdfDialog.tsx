import { useEffect, useMemo, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { AdvancedPdfReport } from "../types";
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
  onAddAttachment: (filePath: string, displayName: string, description: string) => void;
  onExtractAttachment: (objectId: string, destination: string) => void;
  onLayerVisibility: (objectId: string, visible: boolean) => void;
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
  onAddAttachment,
  onExtractAttachment,
  onLayerVisibility,
}: AdvancedPdfDialogProps) {
  const [tab, setTab] = useState<AdvancedTab>(initialTab);
  const [bookmarkTitle, setBookmarkTitle] = useState("");
  const [rename, setRename] = useState<Record<string,string>>({});
  const [attachmentName, setAttachmentName] = useState("");
  const [attachmentDescription, setAttachmentDescription] = useState("");
  const [attachmentPath, setAttachmentPath] = useState("");

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
                <div className="structure-row" key={bookmark.objectId} style={{paddingLeft:12+bookmark.depth*18}}>
                  <SevenIcon name="bookmark"/>
                  <div><input value={rename[bookmark.objectId]??bookmark.title} onChange={(e)=>setRename(c=>({...c,[bookmark.objectId]:e.target.value}))}/><small>{bookmark.pageIndex!==undefined?`Página ${bookmark.pageIndex+1}`:"Destino não resolvido"} · {bookmark.open?"expandido":"recolhido"}</small></div>
                  <button onClick={()=>onRenameBookmark(bookmark.objectId,rename[bookmark.objectId]??bookmark.title)}>Salvar nome</button>
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
            <div className="structure-list">{report.attachments.map((attachment)=>(
              <div className="structure-row" key={attachment.objectId}><SevenIcon name="attachment"/><div><strong>{attachment.name}</strong><small>{attachment.description||"Sem descrição"} · {fileSize(attachment.size)}</small></div><button onClick={async()=>{const dest=await save({title:"Extrair anexo",defaultPath:attachment.name});if(dest)onExtractAttachment(attachment.objectId,dest)}}>Extrair</button></div>
            ))}{report.attachments.length===0&&<div className="empty-panel">Nenhum EmbeddedFile encontrado.</div>}</div>
          </>}

          {!loading && report && tab==="layers" && <>
            <div className="organizer-note"><SevenIcon name="layers"/><span>Alterar visibilidade grava o estado inicial ON/OFF da OCG na sessão atual; conteúdo da layer é preservado e a ação pode ser desfeita.</span></div>
            <div className="structure-list">{report.layers.map((layer)=>(
              <div className="structure-row" key={layer.objectId}><SevenIcon name="layers"/><div><strong>{layer.name}</strong><small>{layer.intent.length?`Intent: ${layer.intent.join(", ")}`:"Intent não declarado"}</small></div><button className={layer.visible?"layer-toggle active":"layer-toggle"} onClick={()=>onLayerVisibility(layer.objectId,!layer.visible)}>{layer.visible?"Visível":"Oculta"}</button></div>
            ))}{report.layers.length===0&&<div className="empty-panel">Nenhuma Optional Content Group detectada.</div>}</div>
          </>}
        </div>
      </section>
    </div>
  );
}
