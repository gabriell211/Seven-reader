import { useMemo, useState } from "react";
import { BrandMark } from "./BrandMark";
import { SevenIcon } from "./SevenIcon";
import { tools } from "../data/tools";
import type { Capabilities, DocumentSummary, RenderResult, ToolId } from "../types";
import { nativeAssetUrl } from "../lib/native";

interface WorkspaceProps {
  document: DocumentSummary;
  rendered: RenderResult | null;
  capabilities: Capabilities | null;
  page: number;
  zoom: number;
  onHome: () => void;
  onRender: (page: number, zoom: number) => void;
  onSearch: (query: string) => void;
  onTool: (tool: ToolId) => void;
}

export function DocumentWorkspace({
  document, rendered, capabilities, page, zoom, onHome, onRender, onSearch, onTool,
}: WorkspaceProps) {
  const [toolsOpen, setToolsOpen] = useState(false);
  const [leftPanel, setLeftPanel] = useState<"thumbs" | "bookmarks" | null>("thumbs");
  const [search, setSearch] = useState("");

  const pageLabel = useMemo(() => `${page + 1} / ${document.pageCount}`, [page, document.pageCount]);

  const changeZoom = (delta: number) => {
    const next = Math.min(400, Math.max(25, zoom + delta));
    onRender(page, next);
  };

  return (
    <div className="workspace">
      <header className="workspace-topbar">
        <button className="workspace-brand" onClick={onHome} aria-label="Início"><BrandMark size={30} /></button>
        <div className="document-tab">
          <span className="tab-file-icon">PDF</span>
          <span className="tab-title">{document.name}</span>
          <button aria-label="Fechar"><SevenIcon name="close" /></button>
        </div>
        <div className="topbar-spacer" />
        <label className="workspace-search">
          <SevenIcon name="search" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSearch(search)}
            placeholder="Pesquisar documento, ferramenta ou comando" />
        </label>
        <button className="icon-button" aria-label="Configurações"><SevenIcon name="settings" /></button>
      </header>

      <nav className="global-bar" aria-label="Ferramentas do documento">
        <button className={toolsOpen ? "global-action active" : "global-action"} onClick={() => setToolsOpen(!toolsOpen)}>
          <SevenIcon name="tools" /><span>Todas as ferramentas</span>
        </button>
        {[
          ["edit", "edit", "Editar"],
          ["convert", "convert", "Converter"],
          ["fill-sign", "sign", "Assinar"],
          ["comment", "comment", "Comentar"],
          ["create", "create", "Criar"],
        ].map(([tool, icon, label]) => (
          <button className="global-action" key={tool} onClick={() => onTool(tool as ToolId)}>
            <SevenIcon name={icon as "edit"} /><span>{label}</span>
          </button>
        ))}
        <div className="global-divider" />
        <button className="global-action compact"><SevenIcon name="open" /><span>Abrir</span></button>
        <button className="global-action compact"><SevenIcon name="save" /><span>Salvar</span></button>
        <button className="global-action compact"><SevenIcon name="print" /><span>Imprimir</span></button>
      </nav>

      <div className="workspace-body">
        <aside className="side-rail">
          <button className={leftPanel === "thumbs" ? "rail-button active" : "rail-button"}
            onClick={() => setLeftPanel(leftPanel === "thumbs" ? null : "thumbs")} aria-label="Miniaturas">
            <SevenIcon name="pages" />
          </button>
          <button className={leftPanel === "bookmarks" ? "rail-button active" : "rail-button"}
            onClick={() => setLeftPanel(leftPanel === "bookmarks" ? null : "bookmarks")} aria-label="Marcadores">
            <SevenIcon name="bookmark" />
          </button>
          <button className="rail-button" aria-label="Comentários"><SevenIcon name="comment" /></button>
          <button className="rail-button" aria-label="Anexos"><SevenIcon name="attachment" /></button>
          <button className="rail-button" aria-label="Camadas"><SevenIcon name="layers" /></button>
        </aside>

        {leftPanel && (
          <aside className="left-panel">
            <div className="panel-title"><strong>{leftPanel === "thumbs" ? "Miniaturas" : "Marcadores"}</strong><button onClick={() => setLeftPanel(null)}><SevenIcon name="close" /></button></div>
            {leftPanel === "thumbs" ? (
              <div className="thumbnail-list">
                {Array.from({ length: Math.min(document.pageCount, 20) }, (_, index) => (
                  <button key={index} className={page === index ? "thumbnail active" : "thumbnail"} onClick={() => onRender(index, zoom)}>
                    <span className="thumb-sheet">{index === page && rendered ? <img src={nativeAssetUrl(rendered.cachePath)} alt="" /> : <span />}</span>
                    <small>{index + 1}</small>
                  </button>
                ))}
              </div>
            ) : <div className="empty-panel">Nenhum marcador detectado.</div>}
          </aside>
        )}

        <main className="document-stage">
          <div className="document-canvas">
            {rendered ? (
              <div className="rendered-page" style={{ width: rendered.width * (zoom / 100) }}>
                <img src={nativeAssetUrl(rendered.cachePath)} alt={`Página ${page + 1}`} draggable={false} />
              </div>
            ) : (
              <div className="loading-page"><span className="loader-ring" /><strong>Renderizando página…</strong></div>
            )}
          </div>

          <div className="quick-tools" role="toolbar" aria-label="Ferramentas rápidas">
            <button aria-label="Seleção"><SevenIcon name="text" /></button>
            <button aria-label="Mão"><SevenIcon name="hand" /></button>
            <span />
            <button aria-label="Comentário"><SevenIcon name="comment" /></button>
            <button aria-label="Destaque"><SevenIcon name="highlight" /></button>
            <button aria-label="Desenho"><SevenIcon name="draw" /></button>
            <button aria-label="Assinatura"><SevenIcon name="sign" /></button>
          </div>

          <div className="view-controls">
            <button aria-label="Página anterior" disabled={page === 0} onClick={() => onRender(page - 1, zoom)}><SevenIcon name="chevronLeft" /></button>
            <span className="page-indicator">{pageLabel}</span>
            <button aria-label="Próxima página" disabled={page >= document.pageCount - 1} onClick={() => onRender(page + 1, zoom)}><SevenIcon name="chevronRight" /></button>
            <i />
            <button aria-label="Diminuir zoom" onClick={() => changeZoom(-10)}><SevenIcon name="zoomOut" /></button>
            <span className="zoom-label">{zoom}%</span>
            <button aria-label="Aumentar zoom" onClick={() => changeZoom(10)}><SevenIcon name="zoomIn" /></button>
          </div>
        </main>

        {toolsOpen && (
          <aside className="tools-drawer">
            <div className="tools-drawer-head">
              <div><span className="eyebrow">WORKSPACE</span><h2>Todas as ferramentas</h2></div>
              <button className="icon-button" onClick={() => setToolsOpen(false)}><SevenIcon name="close" /></button>
            </div>
            <div className="drawer-search"><SevenIcon name="search" /><input placeholder="Encontrar ferramenta" /></div>
            <div className="drawer-tools">
              {tools.map((tool) => {
                const enabled = !tool.capability || capabilities?.[tool.capability]?.available;
                return (
                  <button key={tool.id} className="drawer-tool" disabled={!enabled} onClick={() => onTool(tool.id)}>
                    <span><SevenIcon name={tool.icon} /></span>
                    <div><strong>{tool.label}</strong><small>{enabled ? tool.description : "Recurso nativo indisponível neste dispositivo"}</small></div>
                    <SevenIcon name="chevronRight" />
                  </button>
                );
              })}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
