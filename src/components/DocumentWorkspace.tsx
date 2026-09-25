import { useEffect, useMemo, useRef, useState } from "react";
import { BrandMark } from "./BrandMark";
import { SevenIcon, type IconName } from "./SevenIcon";
import { canRunTool, tools } from "../data/tools";
import type { Capabilities, DocumentSummary, RenderResult, SearchHit, ToolId } from "../types";
import { nativeAssetUrl } from "../lib/native";
import { ProtectedViewBanner } from "./ProtectedViewBanner";

interface WorkspaceProps {
  document: DocumentSummary;
  rendered: RenderResult | null;
  capabilities: Capabilities | null;
  searchHits: SearchHit[];
  page: number;
  zoom: number;
  onHome: () => void;
  onClose: () => void;
  onOpen: () => void;
  onSaveAs: () => void;
  onPrint: () => void;
  onRender: (page: number, zoom: number) => void;
  onSearch: (query: string) => void;
  onTool: (tool: ToolId) => void;
  onSettings: () => void;
  protectedView: boolean;
  protectedReasons: string[];
  onTrustOnce: () => void;
  onTrustLocation: () => void;
}

const primaryTools: Array<{ id: ToolId; icon: IconName; label: string }> = [
  { id: "edit", icon: "edit", label: "Editar" },
  { id: "convert", icon: "convert", label: "Converter" },
  { id: "fill-sign", icon: "sign", label: "Assinar" },
  { id: "comment", icon: "comment", label: "Comentar" },
  { id: "create", icon: "create", label: "Criar" },
];

export function DocumentWorkspace({
  document,
  rendered,
  capabilities,
  searchHits,
  page,
  zoom,
  onHome,
  onClose,
  onOpen,
  onSaveAs,
  onPrint,
  onRender,
  onSearch,
  onTool,
  onSettings,
  protectedView,
  protectedReasons,
  onTrustOnce,
  onTrustLocation,
}: WorkspaceProps) {
  const [toolsOpen, setToolsOpen] = useState(false);
  const [leftPanel, setLeftPanel] = useState<"thumbs" | "search" | null>("thumbs");
  const [search, setSearch] = useState("");
  const [toolSearch, setToolSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const focus = () => searchRef.current?.focus();
    window.addEventListener("seven:focus-search", focus);
    return () => window.removeEventListener("seven:focus-search", focus);
  }, []);
  const [viewerTool, setViewerTool] = useState<"select" | "hand">("select");

  const pageLabel = useMemo(() => `${page + 1} / ${document.pageCount}`, [page, document.pageCount]);
  const filteredTools = useMemo(() => {
    const query = toolSearch.trim().toLocaleLowerCase("pt-BR");
    if (!query) return tools;
    return tools.filter((tool) =>
      [tool.label, tool.description, tool.group].some((value) =>
        value.toLocaleLowerCase("pt-BR").includes(query),
      ),
    );
  }, [toolSearch]);

  const changeZoom = (delta: number) => {
    const next = Math.min(400, Math.max(25, zoom + delta));
    onRender(page, next);
  };

  const submitSearch = () => {
    onSearch(search);
    setLeftPanel("search");
  };

  return (
    <div className={`workspace viewer-${viewerTool}`}>
      <header className="workspace-topbar">
        <button className="workspace-brand" onClick={onHome} aria-label="Início"><BrandMark size={30} /></button>
        <div className="document-tab">
          <span className="tab-file-icon">PDF</span>
          <span className="tab-title">{document.name}</span>
          <button aria-label="Fechar documento" onClick={onClose}><SevenIcon name="close" /></button>
        </div>
        <div className="topbar-spacer" />
        <label className="workspace-search">
          <SevenIcon name="search" />
          <input
            ref={searchRef}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && submitSearch()}
            placeholder="Pesquisar no documento"
          />
        </label>
        <button className="icon-button" aria-label="Configurações" onClick={onSettings}><SevenIcon name="settings" /></button>
      </header>

      <nav className="global-bar" aria-label="Ferramentas do documento">
        <button className={toolsOpen ? "global-action active" : "global-action"} onClick={() => setToolsOpen(!toolsOpen)}>
          <SevenIcon name="tools" /><span>Todas as ferramentas</span>
        </button>
        {primaryTools.map((tool) => {
          const enabled = canRunTool(tool.id, capabilities);
          return (
            <button className="global-action" key={tool.id} disabled={!enabled} onClick={() => enabled && onTool(tool.id)}>
              <SevenIcon name={tool.icon} /><span>{tool.label}</span>
            </button>
          );
        })}
        <div className="global-divider" />
        <button className="global-action compact" onClick={onOpen}><SevenIcon name="open" /><span>Abrir</span></button>
        <button className="global-action compact" onClick={onSaveAs}><SevenIcon name="save" /><span>Salvar como</span></button>
        <button
          className="global-action compact"
          disabled={!capabilities?.printing?.available}
          title={capabilities?.printing?.available ? "Imprimir com o sistema operacional" : "Serviço de impressão não disponível"}
          onClick={onPrint}
        ><SevenIcon name="print" /><span>Imprimir</span></button>
      </nav>

      <div className="workspace-body">
        {protectedView && <ProtectedViewBanner reasons={protectedReasons} onTrustOnce={onTrustOnce} onTrustLocation={onTrustLocation} />}
        <aside className="side-rail">
          <button
            className={leftPanel === "thumbs" ? "rail-button active" : "rail-button"}
            onClick={() => setLeftPanel(leftPanel === "thumbs" ? null : "thumbs")}
            aria-label="Miniaturas"
          >
            <SevenIcon name="pages" />
          </button>
          <button
            className={leftPanel === "search" ? "rail-button active" : "rail-button"}
            onClick={() => setLeftPanel(leftPanel === "search" ? null : "search")}
            aria-label="Resultados de busca"
          >
            <SevenIcon name="search" />
          </button>
          <button className="rail-button" aria-label="Comentários" onClick={() => onTool("comment")}><SevenIcon name="comment" /></button>
          <button className="rail-button" aria-label="Anexos" onClick={() => onTool("attachments")}><SevenIcon name="attachment" /></button>
          <button className="rail-button" aria-label="Camadas" onClick={() => onTool("layers")}><SevenIcon name="layers" /></button>
        </aside>

        {leftPanel && (
          <aside className="left-panel">
            <div className="panel-title">
              <strong>{leftPanel === "thumbs" ? "Miniaturas" : "Resultados"}</strong>
              <button onClick={() => setLeftPanel(null)}><SevenIcon name="close" /></button>
            </div>
            {leftPanel === "thumbs" ? (
              <div className="thumbnail-list">
                {Array.from({ length: Math.min(document.pageCount, 100) }, (_, index) => (
                  <button key={index} className={page === index ? "thumbnail active" : "thumbnail"} onClick={() => onRender(index, zoom)}>
                    <span className="thumb-sheet">
                      {index === page && rendered ? <img src={nativeAssetUrl(rendered.cachePath)} alt="" /> : <span className="thumb-number">{index + 1}</span>}
                    </span>
                    <small>{index + 1}</small>
                  </button>
                ))}
              </div>
            ) : (
              <div className="search-results">
                {!searchHits.length && <div className="empty-panel">Pesquise um termo para ver ocorrências.</div>}
                {searchHits.map((hit) => (
                  <button key={hit.pageIndex} className="search-hit" onClick={() => onRender(hit.pageIndex, zoom)}>
                    <strong>Página {hit.pageIndex + 1}</strong>
                    <span>{hit.excerpt || "Texto encontrado nesta página."}</span>
                    <small>{hit.occurrences} ocorrência(s)</small>
                  </button>
                ))}
              </div>
            )}
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
            <button className={viewerTool === "select" ? "active" : ""} aria-label="Seleção" onClick={() => setViewerTool("select")}><SevenIcon name="text" /></button>
            <button className={viewerTool === "hand" ? "active" : ""} aria-label="Mão" onClick={() => setViewerTool("hand")}><SevenIcon name="hand" /></button>
            <span />
            <button aria-label="Comentário" onClick={() => onTool("comment")}><SevenIcon name="comment" /></button>
            <button aria-label="Destaque" disabled><SevenIcon name="highlight" /></button>
            <button aria-label="Desenho" disabled><SevenIcon name="draw" /></button>
            <button aria-label="Assinatura" disabled><SevenIcon name="sign" /></button>
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
            <div className="drawer-search">
              <SevenIcon name="search" />
              <input
                value={toolSearch}
                onChange={(event) => setToolSearch(event.target.value)}
                placeholder="Encontrar ferramenta"
                aria-label="Encontrar ferramenta"
              />
            </div>
            <div className="drawer-tools">
              {filteredTools.map((tool) => {
                const enabled = canRunTool(tool.id, capabilities);
                const capabilityAvailable = !tool.capability || capabilities?.[tool.capability]?.available;
                const status = !tool.implemented
                  ? "Em implementação — ação bloqueada para não simular suporte"
                  : !capabilityAvailable
                    ? "Dependência nativa não encontrada neste dispositivo"
                    : tool.description;
                return (
                  <button key={tool.id} className="drawer-tool" disabled={!enabled} onClick={() => enabled && onTool(tool.id)}>
                    <span><SevenIcon name={tool.icon} /></span>
                    <div><strong>{tool.label}</strong><small>{status}</small></div>
                    <SevenIcon name="chevronRight" />
                  </button>
                );
              })}
              {!filteredTools.length && <div className="empty-panel">Nenhuma ferramenta encontrada.</div>}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
