import { useEffect, useMemo, useState } from "react";
import { confirm, open, save } from "@tauri-apps/plugin-dialog";
import { readImage, readText } from "@tauri-apps/plugin-clipboard-manager";
import type {
  AdvancedPdfReport,
  BookmarkInfo,
  BookmarkUpdate,
  LayerPropertiesUpdate,
  PortfolioPreview,
  PortfolioSearchHit,
} from "../types";
import { nativeAssetUrl } from "../lib/native";
import { SevenIcon } from "./SevenIcon";

type AdvancedTab = "overview" | "bookmarks" | "attachments" | "layers" | "portfolio";

interface AdvancedPdfDialogProps {
  pageIndex: number;
  report: AdvancedPdfReport | null;
  loading: boolean;
  initialTab?: AdvancedTab;
  portfolioPreview: PortfolioPreview | null;
  canScan: boolean;
  canWeb: boolean;
  portfolioSearchHits: PortfolioSearchHit[];
  portfolioSearching: boolean;
  onClose: () => void;
  onReload: () => void;
  onAddBookmark: (title: string, pageIndex: number) => void;
  onRenameBookmark: (objectId: string, title: string) => void;
  onUpdateBookmark: (update: BookmarkUpdate) => void;
  onSetAllBookmarksOpen: (open: boolean) => void;
  onGenerateBookmarksFromStructure: () => void;
  onDeleteBookmark: (objectId: string) => void;
  onMoveBookmark: (objectId: string, direction: "up" | "down" | "indent" | "outdent") => void;
  onSetBookmarkOpen: (objectId: string, open: boolean) => void;
  onAddAttachment: (filePath: string, displayName: string, description: string) => void;
  onUpdateAttachment: (objectId: string, name: string, description: string) => void;
  onRemoveAttachment: (objectId: string) => void;
  onExtractAttachment: (objectId: string, destination: string) => void;
  onPreviewPortfolioItem: (objectId: string) => void;
  onClearPortfolioPreview: () => void;
  onSearchPortfolioItems: (query: string) => void;
  onOpenPortfolioItemExternal: (objectId: string) => void;
  onOpenPortfolioPdf: (preview: PortfolioPreview) => void;
  onAddPortfolioClipboardText: (text: string, name: string, folderPath: string) => void;
  onAddPortfolioClipboardImage: (rgba: number[], width: number, height: number, name: string, folderPath: string) => void;
  onAddPortfolioWeb: (url: string, name: string, folderPath: string) => void;
  onAddPortfolioScan: (dpi: number, name: string, folderPath: string) => void;
  onAddPortfolioItem: (filePath: string, displayName: string, description: string, folderPath: string) => void;
  onConfigurePortfolio: (view: "details" | "tile" | "hidden") => void;
  onSetPortfolioView: (view: "details" | "tile" | "hidden") => void;
  onImportPortfolioDirectory: (directory: string, targetPath: string) => void;
  onCreatePortfolioFolder: (path: string, description: string) => void;
  onMovePortfolioItem: (objectId: string, folderPath: string) => void;
  onRenamePortfolioFolder: (folderId: string, newName: string) => void;
  onRemovePortfolioFolder: (folderId: string) => void;
  onLayerVisibility: (objectId: string, visible: boolean) => void;
  onImportLayer: (imagePath: string, name: string, x: number, y: number, width: number, height: number, visible: boolean, locked: boolean) => void;
  onReorderLayer: (objectId: string, direction: "up" | "down") => void;
  onMergeLayers: (sourceId: string, targetId: string) => void;
  onFlattenLayers: () => void;
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
  portfolioPreview,
  canScan,
  canWeb,
  portfolioSearchHits,
  portfolioSearching,
  onClose,
  onReload,
  onAddBookmark,
  onRenameBookmark,
  onUpdateBookmark,
  onSetAllBookmarksOpen,
  onGenerateBookmarksFromStructure,
  onDeleteBookmark,
  onMoveBookmark,
  onSetBookmarkOpen,
  onAddAttachment,
  onUpdateAttachment,
  onRemoveAttachment,
  onExtractAttachment,
  onPreviewPortfolioItem,
  onClearPortfolioPreview,
  onSearchPortfolioItems,
  onOpenPortfolioItemExternal,
  onOpenPortfolioPdf,
  onAddPortfolioClipboardText,
  onAddPortfolioClipboardImage,
  onAddPortfolioWeb,
  onAddPortfolioScan,
  onAddPortfolioItem,
  onConfigurePortfolio,
  onSetPortfolioView,
  onImportPortfolioDirectory,
  onCreatePortfolioFolder,
  onMovePortfolioItem,
  onRenamePortfolioFolder,
  onRemovePortfolioFolder,
  onLayerVisibility,
  onImportLayer,
  onReorderLayer,
  onMergeLayers,
  onFlattenLayers,
  onUpdateLayer,
  onApplyLayerOverrides,
  onResetLayerVisibility,
}: AdvancedPdfDialogProps) {
  const [tab, setTab] = useState<AdvancedTab>(initialTab);
  const [bookmarkTitle, setBookmarkTitle] = useState("");
  const [rename, setRename] = useState<Record<string,string>>({});
  const [editingBookmark, setEditingBookmark] = useState<BookmarkInfo | null>(null);
  const [bookmarkAction, setBookmarkAction] = useState<BookmarkUpdate["actionType"]>("goto");
  const [bookmarkTargetPage, setBookmarkTargetPage] = useState(1);
  const [bookmarkTarget, setBookmarkTarget] = useState("");
  const [bookmarkBold, setBookmarkBold] = useState(false);
  const [bookmarkItalic, setBookmarkItalic] = useState(false);
  const [bookmarkColor, setBookmarkColor] = useState("#000000");
  const [attachmentName, setAttachmentName] = useState("");
  const [attachmentDescription, setAttachmentDescription] = useState("");
  const [attachmentPath, setAttachmentPath] = useState("");
  const [attachmentEdits, setAttachmentEdits] = useState<Record<string,{name:string;description:string}>>({});
  const [layerEdits, setLayerEdits] = useState<Record<string,LayerPropertiesUpdate>>({});
  const [layerImagePath, setLayerImagePath] = useState("");
  const [layerName, setLayerName] = useState("Nova camada");
  const [layerX, setLayerX] = useState(36);
  const [layerY, setLayerY] = useState(36);
  const [layerWidth, setLayerWidth] = useState(240);
  const [layerHeight, setLayerHeight] = useState(180);
  const [layerVisible, setLayerVisible] = useState(true);
  const [layerLocked, setLayerLocked] = useState(false);
  const [mergeSourceId, setMergeSourceId] = useState("");
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [portfolioView, setPortfolioView] = useState<"details" | "tile" | "hidden">("details");
  const [portfolioFolderPath, setPortfolioFolderPath] = useState("");
  const [portfolioFolderDescription, setPortfolioFolderDescription] = useState("");
  const [portfolioFolderRenames, setPortfolioFolderRenames] = useState<Record<string,string>>({});
  const [portfolioSelectedFolder, setPortfolioSelectedFolder] = useState("/");
  const [portfolioItemPath, setPortfolioItemPath] = useState("");
  const [portfolioItemName, setPortfolioItemName] = useState("");
  const [portfolioItemDescription, setPortfolioItemDescription] = useState("");
  const [portfolioWebUrl, setPortfolioWebUrl] = useState("");
  const [portfolioWebName, setPortfolioWebName] = useState("Pagina-Web.pdf");
  const [portfolioScanName, setPortfolioScanName] = useState("Digitalizacao.pdf");
  const [portfolioScanDpi, setPortfolioScanDpi] = useState(300);
  const [portfolioClipboardStatus, setPortfolioClipboardStatus] = useState("");
  const [portfolioItemMoves, setPortfolioItemMoves] = useState<Record<string,string>>({});
  const [portfolioQuery, setPortfolioQuery] = useState("");
  const [portfolioContentQuery, setPortfolioContentQuery] = useState("");
  const [portfolioSort, setPortfolioSort] = useState<"name" | "size" | "type">("name");

  useEffect(() => { onReload(); }, []);
  useEffect(() => {
    const view = report?.portfolioView;
    if (view === "T") setPortfolioView("tile");
    else if (view === "H") setPortfolioView("hidden");
    else setPortfolioView("details");
  }, [report?.portfolioView]);

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

  const rgbToHex = (rgb: [number, number, number]) =>
    `#${rgb.map((component) =>
      Math.max(0, Math.min(255, Math.round(component * 255))).toString(16).padStart(2, "0")
    ).join("")}`;

  const hexToRgb = (hex: string): [number, number, number] => {
    const value = hex.replace("#", "").padEnd(6, "0").slice(0, 6);
    return [
      parseInt(value.slice(0, 2), 16) / 255,
      parseInt(value.slice(2, 4), 16) / 255,
      parseInt(value.slice(4, 6), 16) / 255,
    ];
  };

  const beginBookmarkEdit = (bookmark: BookmarkInfo) => {
    setEditingBookmark(bookmark);
    setRename((current) => ({ ...current, [bookmark.objectId]: current[bookmark.objectId] ?? bookmark.title }));
    const action = bookmark.actionType === "uri" ? "uri" : bookmark.actionType === "goto" ? "goto" : "none";
    setBookmarkAction(action);
    setBookmarkTargetPage(bookmark.pageIndex !== undefined ? bookmark.pageIndex + 1 : pageIndex + 1);
    setBookmarkTarget(bookmark.actionType === "uri" ? bookmark.actionTarget : "");
    setBookmarkBold(bookmark.bold);
    setBookmarkItalic(bookmark.italic);
    setBookmarkColor(rgbToHex(bookmark.color));
  };

  const saveBookmarkEdit = () => {
    if (!editingBookmark) return;
    onUpdateBookmark({
      objectId: editingBookmark.objectId,
      title: rename[editingBookmark.objectId] ?? editingBookmark.title,
      actionType: bookmarkAction,
      targetPage: bookmarkAction === "goto" ? Math.max(0, bookmarkTargetPage - 1) : undefined,
      target: bookmarkTarget,
      bold: bookmarkBold,
      italic: bookmarkItalic,
      color: hexToRgb(bookmarkColor),
    });
    setEditingBookmark(null);
  };

  const chooseAttachment = async () => {
    const path = await open({ title: "Selecionar arquivo para incorporar", multiple: false, directory: false });
    if (typeof path === "string") {
      setAttachmentPath(path);
      setAttachmentName(path.split(/[\\/]/).pop() || "anexo");
    }
  };

  const chooseLayerImage = async () => {
    const path = await open({
      title: "Selecionar imagem para importar como camada",
      multiple: false,
      directory: false,
      filters: [{ name: "Imagens", extensions: ["png", "jpg", "jpeg", "tif", "tiff", "bmp", "webp"] }],
    });
    if (typeof path === "string") {
      setLayerImagePath(path);
      if (layerName === "Nova camada") {
        setLayerName(path.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "") || "Nova camada");
      }
    }
  };

  const importLayer = () => {
    if (!layerImagePath || !layerName.trim()) return;
    onImportLayer(
      layerImagePath,
      layerName.trim(),
      layerX,
      layerY,
      layerWidth,
      layerHeight,
      layerVisible,
      layerLocked,
    );
  };

  const flattenLayers = async () => {
    const accepted = await confirm(
      "Achatar layers aplica a visibilidade atual ao conteúdo e remove a estrutura OCG nesta revisão. A operação ainda poderá ser desfeita enquanto a sessão estiver aberta.",
      { title: "Achatar camadas", kind: "warning" },
    );
    if (accepted) onFlattenLayers();
  };

  const addClipboardTextToPortfolio = async () => {
    try {
      const text = await readText();
      if (!text) {
        setPortfolioClipboardStatus("O clipboard não contém texto.");
        return;
      }
      onAddPortfolioClipboardText(text, "Clipboard.txt", portfolioSelectedFolder);
      setPortfolioClipboardStatus("Texto enviado para o portfólio.");
    } catch {
      setPortfolioClipboardStatus("Não foi possível ler texto do clipboard.");
    }
  };

  const addClipboardImageToPortfolio = async () => {
    try {
      const image = await readImage();
      const [{ width, height }, rgba] = await Promise.all([image.size(), image.rgba()]);
      await image.close();
      if (!width || !height || rgba.length !== width * height * 4) {
        throw new Error("Imagem inválida");
      }
      onAddPortfolioClipboardImage(
        Array.from(rgba),
        width,
        height,
        "Clipboard.png",
        portfolioSelectedFolder,
      );
      setPortfolioClipboardStatus(`Imagem ${width}×${height}px enviada para o portfólio.`);
    } catch {
      setPortfolioClipboardStatus("O clipboard não contém uma imagem compatível.");
    }
  };

  const choosePortfolioItem = async () => {
    const path = await open({
      title: "Selecionar componente para o portfólio",
      multiple: false,
      directory: false,
    });
    if (typeof path === "string") {
      setPortfolioItemPath(path);
      setPortfolioItemName(path.split(/[\\/]/).pop() || "componente");
    }
  };

  const importPortfolioDirectory = async () => {
    const selected = await open({
      title: "Selecionar pasta para importar no portfólio",
      directory: true,
      multiple: false,
    });
    if (typeof selected === "string") {
      onImportPortfolioDirectory(selected, portfolioSelectedFolder);
    }
  };

  const createPortfolioFolder = () => {
    if (!portfolioFolderPath.trim()) return;
    onCreatePortfolioFolder(portfolioFolderPath.trim(), portfolioFolderDescription.trim());
    setPortfolioFolderPath("");
    setPortfolioFolderDescription("");
  };

  const addPortfolioItem = () => {
    if (!portfolioItemPath || !portfolioItemName.trim()) return;
    onAddPortfolioItem(
      portfolioItemPath,
      portfolioItemName.trim(),
      portfolioItemDescription.trim(),
      portfolioSelectedFolder,
    );
    setPortfolioItemPath("");
    setPortfolioItemName("");
    setPortfolioItemDescription("");
  };

  const openPortfolioExternal = async (objectId: string, name: string) => {
    const accepted = await confirm(
      `Abrir "${name}" no aplicativo padrão do sistema? O arquivo será extraído apenas para o cache local do Seven Reader.`,
      { title: "Abrir componente externamente", kind: "info" },
    );
    if (accepted) onOpenPortfolioItemExternal(objectId);
  };

  const removePortfolioFolder = async (folderId: string, path: string) => {
    const accepted = await confirm(
      `Remover "${path}" também exclui do portfólio todos os componentes e subpastas dentro dela nesta revisão. A operação pode ser desfeita enquanto a sessão estiver aberta.`,
      { title: "Remover pasta do portfólio", kind: "warning" },
    );
    if (accepted) {
      if (portfolioSelectedFolder === path || portfolioSelectedFolder.startsWith(path + "/")) {
        setPortfolioSelectedFolder("/");
      }
      onRemovePortfolioFolder(folderId);
    }
  };

  const portfolioItems = useMemo(() => {
    if (!report) return [];
    const query = portfolioQuery.trim().toLocaleLowerCase();
    const filtered = report.attachments.filter((item) => {
      if (item.collectionPath !== portfolioSelectedFolder) return false;
      if (!query) return true;
      return [item.name, item.description, item.mime]
        .some((value) => value.toLocaleLowerCase().includes(query));
    });
    return filtered.sort((left, right) => {
      if (portfolioSort === "size") return (right.size ?? 0) - (left.size ?? 0);
      if (portfolioSort === "type") return left.mime.localeCompare(right.mime) || left.name.localeCompare(right.name);
      return left.name.localeCompare(right.name);
    });
  }, [report, portfolioQuery, portfolioSelectedFolder, portfolioSort]);

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
          <button className={tab==="portfolio"?"active":""} onClick={()=>setTab("portfolio")}>Portfólio</button>
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
            <div className="bookmark-toolbar">
              <button onClick={()=>onSetAllBookmarksOpen(true)} disabled={!report.bookmarks.some((bookmark)=>bookmark.hasChildren)}>Expandir todos</button>
              <button onClick={()=>onSetAllBookmarksOpen(false)} disabled={!report.bookmarks.some((bookmark)=>bookmark.hasChildren)}>Recolher todos</button>
              <button onClick={onGenerateBookmarksFromStructure} disabled={report.bookmarks.length>0} title={report.bookmarks.length ? "Disponível apenas quando o documento ainda não possui outline." : "Usa headings H1-H6 reais da estrutura Tagged PDF."}>
                <SevenIcon name="automation"/> Gerar da estrutura
              </button>
            </div>
            <div className="inline-create-row">
              <label className="workflow-field"><span>Novo marcador na página {pageIndex+1}</span><input value={bookmarkTitle} onChange={(e)=>setBookmarkTitle(e.target.value)} placeholder="Título"/></label>
              <button className="primary-button" disabled={!bookmarkTitle.trim()} onClick={addBookmark}><SevenIcon name="bookmark"/> Criar</button>
            </div>
            {editingBookmark && (
              <section className="bookmark-editor">
                <header>
                  <div><strong>Editar marcador</strong><small>{editingBookmark.objectId} · nível {editingBookmark.depth+1}</small></div>
                  <button className="icon-button" onClick={()=>setEditingBookmark(null)}><SevenIcon name="close"/></button>
                </header>
                <label className="workflow-field"><span>Título</span><input value={rename[editingBookmark.objectId]??editingBookmark.title} onChange={(e)=>setRename(current=>({...current,[editingBookmark.objectId]:e.target.value}))}/></label>
                <div className="two-column-fields">
                  <label className="workflow-field"><span>Ação</span><select value={bookmarkAction} onChange={(e)=>setBookmarkAction(e.target.value as BookmarkUpdate["actionType"])}><option value="goto">Ir para página</option><option value="uri">Abrir URL</option><option value="named">Destino nomeado</option><option value="none">Sem ação</option></select></label>
                  {bookmarkAction==="goto" && <label className="workflow-field"><span>Página</span><input type="number" min={1} value={bookmarkTargetPage} onChange={(e)=>setBookmarkTargetPage(Math.max(1,Number(e.target.value)||1))}/></label>}
                  {bookmarkAction==="uri" && <label className="workflow-field"><span>URL</span><input value={bookmarkTarget} onChange={(e)=>setBookmarkTarget(e.target.value)} placeholder="https://..."/></label>}
                  {bookmarkAction==="named" && <label className="workflow-field"><span>Destino nomeado</span><input value={bookmarkTarget} onChange={(e)=>setBookmarkTarget(e.target.value)} placeholder="Nome do destino"/></label>}
                </div>
                <div className="bookmark-style-controls">
                  <label className="toggle-row"><input type="checkbox" checked={bookmarkBold} onChange={(e)=>setBookmarkBold(e.target.checked)}/><span><strong>Negrito</strong></span></label>
                  <label className="toggle-row"><input type="checkbox" checked={bookmarkItalic} onChange={(e)=>setBookmarkItalic(e.target.checked)}/><span><strong>Itálico</strong></span></label>
                  <label className="workflow-field"><span>Cor</span><input type="color" value={bookmarkColor} onChange={(e)=>setBookmarkColor(e.target.value)}/></label>
                </div>
                <button className="primary-button workflow-submit" disabled={!(rename[editingBookmark.objectId]??editingBookmark.title).trim() || ((bookmarkAction==="uri" || bookmarkAction==="named") && !bookmarkTarget.trim())} onClick={saveBookmarkEdit}>
                  <SevenIcon name="save"/> Aplicar ao marcador
                </button>
              </section>
            )}
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
                    <button title="Editar destino, ação e aparência" onClick={()=>beginBookmarkEdit(bookmark)}>Editar</button>
                    <button title="Salvar somente o nome" onClick={()=>onRenameBookmark(bookmark.objectId,rename[bookmark.objectId]??bookmark.title)}>Nome</button>
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

          {!loading && report && tab==="portfolio" && <>
            {!report.isPortfolio && (
              <section className="portfolio-create-box">
                <SevenIcon name="portfolio"/>
                <div>
                  <strong>Criar estrutura de Portfólio PDF</strong>
                  <small>Adiciona /Collection ao PDF atual sem alterar os arquivos incorporados existentes.</small>
                </div>
                <select value={portfolioView} onChange={(e)=>setPortfolioView(e.target.value as typeof portfolioView)}>
                  <option value="details">Lista detalhada</option>
                  <option value="tile">Blocos</option>
                  <option value="hidden">Oculta na abertura</option>
                </select>
                <button className="primary-button" onClick={()=>onConfigurePortfolio(portfolioView)}><SevenIcon name="create"/> Criar portfólio</button>
              </section>
            )}

            {report.isPortfolio && (
              <>
                <div className="portfolio-toolbar">
                  <label className="workflow-field">
                    <span>Exibição inicial</span>
                    <select value={portfolioView} onChange={(e)=>{const value=e.target.value as typeof portfolioView;setPortfolioView(value);onSetPortfolioView(value);}}>
                      <option value="details">Lista detalhada</option>
                      <option value="tile">Blocos</option>
                      <option value="hidden">Oculta</option>
                    </select>
                  </label>
                  <label className="workflow-field portfolio-query">
                    <span>Filtrar componentes nesta pasta</span>
                    <input value={portfolioQuery} onChange={(e)=>setPortfolioQuery(e.target.value)} placeholder="Nome, descrição ou MIME"/>
                  </label>
                  <label className="workflow-field">
                    <span>Ordenar</span>
                    <select value={portfolioSort} onChange={(e)=>setPortfolioSort(e.target.value as typeof portfolioSort)}>
                      <option value="name">Nome</option>
                      <option value="size">Tamanho</option>
                      <option value="type">Tipo</option>
                    </select>
                  </label>
                </div>

                <div className="portfolio-layout">
                  <aside className="portfolio-folders">
                    <header><strong>Pastas internas</strong><button onClick={()=>setPortfolioSelectedFolder("/")}>Raiz</button></header>
                    <button className={portfolioSelectedFolder==="/"?"portfolio-folder active":"portfolio-folder"} onClick={()=>setPortfolioSelectedFolder("/")}>
                      <SevenIcon name="folder"/><span>/</span>
                    </button>
                    {report.portfolioFolders.filter((folder)=>folder.path!=="/").map((folder)=>{
                      const renameValue=portfolioFolderRenames[folder.objectId]??folder.name;
                      return (
                        <div className={portfolioSelectedFolder===folder.path?"portfolio-folder-row active":"portfolio-folder-row"} key={folder.objectId} style={{paddingLeft:8+folder.depth*10}}>
                          <button className="portfolio-folder-main" onClick={()=>setPortfolioSelectedFolder(folder.path)}>
                            <SevenIcon name="folder"/><span>{folder.name}</span>
                          </button>
                          <input value={renameValue} onChange={(e)=>setPortfolioFolderRenames(current=>({...current,[folder.objectId]:e.target.value}))}/>
                          <button disabled={!renameValue.trim()||renameValue===folder.name} onClick={()=>onRenamePortfolioFolder(folder.objectId,renameValue.trim())}>Renomear</button>
                          <button className="danger-quiet" onClick={()=>void removePortfolioFolder(folder.objectId,folder.path)}>Excluir</button>
                        </div>
                      );
                    })}
                    <div className="portfolio-folder-create">
                      <input value={portfolioFolderPath} onChange={(e)=>setPortfolioFolderPath(e.target.value)} placeholder="/Contratos/2026"/>
                      <input value={portfolioFolderDescription} onChange={(e)=>setPortfolioFolderDescription(e.target.value)} placeholder="Descrição opcional"/>
                      <button disabled={!portfolioFolderPath.trim()} onClick={createPortfolioFolder}><SevenIcon name="create"/> Criar pasta</button>
                    </div>
                    <button className="secondary-light-button" onClick={()=>void importPortfolioDirectory()}><SevenIcon name="folder"/> Importar pasta do sistema</button>
                  </aside>

                  <section className="portfolio-content">
                    <header className="portfolio-content-head">
                      <div><strong>{portfolioSelectedFolder}</strong><small>{portfolioItems.length} componente(s) nesta pasta</small></div>
                      <button className="secondary-light-button" onClick={onReload}>Atualizar</button>
                    </header>

                    <section className="portfolio-add-grid">
                      <div className="portfolio-add-card">
                        <strong>Arquivo</strong>
                        <button className="secondary-light-button choose-wide" onClick={()=>void choosePortfolioItem()}><SevenIcon name="open"/>{portfolioItemPath||"Selecionar arquivo"}</button>
                        <input value={portfolioItemName} onChange={(e)=>setPortfolioItemName(e.target.value)} placeholder="Nome no portfólio"/>
                        <input value={portfolioItemDescription} onChange={(e)=>setPortfolioItemDescription(e.target.value)} placeholder="Descrição"/>
                        <button className="primary-button" disabled={!portfolioItemPath||!portfolioItemName.trim()} onClick={addPortfolioItem}>Adicionar</button>
                      </div>

                      <div className="portfolio-add-card">
                        <strong>Clipboard</strong>
                        <small>Texto e imagem entram como componentes independentes.</small>
                        <button onClick={()=>void addClipboardTextToPortfolio()}>Adicionar texto</button>
                        <button onClick={()=>void addClipboardImageToPortfolio()}>Adicionar imagem</button>
                        {portfolioClipboardStatus && <small>{portfolioClipboardStatus}</small>}
                      </div>

                      <div className="portfolio-add-card">
                        <strong>Página web</strong>
                        <input value={portfolioWebUrl} disabled={!canWeb} onChange={(e)=>setPortfolioWebUrl(e.target.value)} placeholder="https://..."/>
                        <input value={portfolioWebName} disabled={!canWeb} onChange={(e)=>setPortfolioWebName(e.target.value)} placeholder="Pagina-Web.pdf"/>
                        <button disabled={!canWeb||!portfolioWebUrl.trim()||!portfolioWebName.trim()} onClick={()=>onAddPortfolioWeb(portfolioWebUrl.trim(),portfolioWebName.trim(),portfolioSelectedFolder)}>Capturar e adicionar</button>
                        {!canWeb&&<small>Chrome, Chromium ou Edge não detectado.</small>}
                      </div>

                      <div className="portfolio-add-card">
                        <strong>Scanner</strong>
                        <input type="number" min={75} max={1200} value={portfolioScanDpi} disabled={!canScan} onChange={(e)=>setPortfolioScanDpi(Math.max(75,Math.min(1200,Number(e.target.value)||300)))}/>
                        <input value={portfolioScanName} disabled={!canScan} onChange={(e)=>setPortfolioScanName(e.target.value)} placeholder="Digitalizacao.pdf"/>
                        <button disabled={!canScan||!portfolioScanName.trim()} onClick={()=>onAddPortfolioScan(portfolioScanDpi,portfolioScanName.trim(),portfolioSelectedFolder)}>Digitalizar e adicionar</button>
                        {!canScan&&<small>Scanner nativo não disponível neste dispositivo.</small>}
                      </div>
                    </section>

                    <div className="portfolio-items">
                      {portfolioItems.map((item)=>{
                        const moveTarget=portfolioItemMoves[item.objectId]??item.collectionPath;
                        return (
                          <article className="portfolio-item-row" key={item.objectId}>
                            <span className="attachment-glyph"><SevenIcon name="attachment"/></span>
                            <div>
                              <strong>{item.name}</strong>
                              <small>{item.mime} · {fileSize(item.size)}</small>
                              <span>{item.description||"Sem descrição"}</span>
                            </div>
                            <div className="portfolio-item-actions">
                              <button onClick={()=>onPreviewPortfolioItem(item.objectId)}>Preview</button>
                              <button onClick={()=>void openPortfolioExternal(item.objectId,item.name)}>Abrir externo</button>
                              <button onClick={async()=>{const dest=await save({title:"Extrair componente",defaultPath:item.name});if(dest)onExtractAttachment(item.objectId,dest)}}>Extrair</button>
                              <select value={moveTarget} onChange={(e)=>setPortfolioItemMoves(current=>({...current,[item.objectId]:e.target.value}))}>
                                <option value="/">/</option>
                                {report.portfolioFolders.filter((folder)=>folder.path!=="/").map((folder)=><option key={folder.objectId} value={folder.path}>{folder.path}</option>)}
                              </select>
                              <button disabled={moveTarget===item.collectionPath} onClick={()=>onMovePortfolioItem(item.objectId,moveTarget)}>Mover</button>
                              <button className="danger-quiet" onClick={()=>onRemoveAttachment(item.objectId)}>Remover</button>
                            </div>
                          </article>
                        );
                      })}
                      {!portfolioItems.length&&<div className="empty-panel">Nenhum componente nesta pasta.</div>}
                    </div>

                    <section className="portfolio-search-box">
                      <div className="section-mini-title">Pesquisar dentro dos componentes compatíveis</div>
                      <div className="inline-create-row">
                        <label className="workflow-field"><span>Conteúdo</span><input value={portfolioContentQuery} onChange={(e)=>setPortfolioContentQuery(e.target.value)} placeholder="Termo dentro de PDF ou texto"/></label>
                        <button className="secondary-light-button" disabled={!portfolioContentQuery.trim()||portfolioSearching} onClick={()=>onSearchPortfolioItems(portfolioContentQuery.trim())}><SevenIcon name="search"/>{portfolioSearching?"Buscando…":"Buscar"}</button>
                      </div>
                      <div className="portfolio-search-results">
                        {portfolioSearchHits.map((hit)=>(
                          <button key={hit.objectId} onClick={()=>onPreviewPortfolioItem(hit.objectId)}>
                            <strong>{hit.name}</strong><small>{hit.collectionPath} · {hit.mime}</small><span>{hit.excerpt}</span>
                          </button>
                        ))}
                        {!portfolioSearching&&portfolioContentQuery.trim()&&portfolioSearchHits.length===0&&<small>Nenhum conteúdo compatível encontrado.</small>}
                      </div>
                    </section>

                    {portfolioPreview && (
                      <section className="portfolio-preview">
                        <header><div><strong>{portfolioPreview.name}</strong><small>{portfolioPreview.mime} · {fileSize(portfolioPreview.size)}</small></div><button className="icon-button" onClick={onClearPortfolioPreview}><SevenIcon name="close"/></button></header>
                        {portfolioPreview.kind==="image"&&<img src={nativeAssetUrl(portfolioPreview.cachePath)} alt={portfolioPreview.name}/>}
                        {portfolioPreview.kind==="text"&&<pre>{portfolioPreview.text||"Arquivo de texto vazio."}</pre>}
                        {portfolioPreview.kind==="pdf"&&<button className="primary-button" onClick={()=>onOpenPortfolioPdf(portfolioPreview)}><SevenIcon name="open"/> Abrir PDF no Seven Reader</button>}
                        {portfolioPreview.kind==="file"&&<div className="organizer-note"><SevenIcon name="shield"/><span>Preview interno indisponível para este formato. Use “Abrir externo” somente se confiar no arquivo.</span></div>}
                      </section>
                    )}
                  </section>
                </div>
              </>
            )}
          </>}

          {!loading && report && tab==="layers" && <>
            <div className="organizer-note"><SevenIcon name="layers"/><span>Alterar visibilidade grava o estado inicial ON/OFF da OCG na sessão atual; conteúdo da layer é preservado e a ação pode ser desfeita.</span></div>

            <section className="layer-import-box">
              <div className="section-mini-title">Importar imagem como OCG</div>
              <button className="secondary-light-button choose-wide" onClick={()=>void chooseLayerImage()}><SevenIcon name="open"/>{layerImagePath||"Selecionar imagem"}</button>
              <div className="two-column-fields">
                <label className="workflow-field"><span>Nome da layer</span><input value={layerName} onChange={(e)=>setLayerName(e.target.value)}/></label>
                <div className="two-column-fields">
                  <label className="toggle-row"><input type="checkbox" checked={layerVisible} onChange={(e)=>setLayerVisible(e.target.checked)}/><span><strong>Visível</strong></span></label>
                  <label className="toggle-row"><input type="checkbox" checked={layerLocked} onChange={(e)=>setLayerLocked(e.target.checked)}/><span><strong>Bloqueada</strong></span></label>
                </div>
              </div>
              <div className="four-column-fields">
                <label className="workflow-field"><span>X</span><input type="number" value={layerX} onChange={(e)=>setLayerX(Number(e.target.value))}/></label>
                <label className="workflow-field"><span>Y</span><input type="number" value={layerY} onChange={(e)=>setLayerY(Number(e.target.value))}/></label>
                <label className="workflow-field"><span>Largura</span><input type="number" min={1} value={layerWidth} onChange={(e)=>setLayerWidth(Math.max(1,Number(e.target.value)||1))}/></label>
                <label className="workflow-field"><span>Altura</span><input type="number" min={1} value={layerHeight} onChange={(e)=>setLayerHeight(Math.max(1,Number(e.target.value)||1))}/></label>
              </div>
              <button className="primary-button workflow-submit" disabled={!layerImagePath||!layerName.trim()} onClick={importLayer}><SevenIcon name="layers"/> Importar na página {pageIndex+1}</button>
            </section>

            {report.layers.length>1 && (
              <section className="layer-merge-box">
                <div><strong>Mesclar layers</strong><small>Todo conteúdo que referencia a origem passa a usar a OCG de destino.</small></div>
                <select value={mergeSourceId} onChange={(e)=>setMergeSourceId(e.target.value)}>
                  <option value="">Origem…</option>
                  {report.layers.map((layer)=><option key={layer.objectId} value={layer.objectId}>{layer.name}</option>)}
                </select>
                <span>→</span>
                <select value={mergeTargetId} onChange={(e)=>setMergeTargetId(e.target.value)}>
                  <option value="">Destino…</option>
                  {report.layers.filter((layer)=>layer.objectId!==mergeSourceId).map((layer)=><option key={layer.objectId} value={layer.objectId}>{layer.name}</option>)}
                </select>
                <button className="secondary-light-button" disabled={!mergeSourceId||!mergeTargetId||mergeSourceId===mergeTargetId} onClick={()=>onMergeLayers(mergeSourceId,mergeTargetId)}>Mesclar</button>
              </section>
            )}

            {report.layers.length>0 && (
              <div className="layer-destructive-actions">
                <button className="danger-quiet" onClick={()=>void flattenLayers()}>Achatar layers respeitando visibilidade atual</button>
              </div>
            )}
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
                      <button title="Mover layer para cima" onClick={()=>onReorderLayer(layer.objectId,"up")}>↑</button>
                      <button title="Mover layer para baixo" onClick={()=>onReorderLayer(layer.objectId,"down")}>↓</button>
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
