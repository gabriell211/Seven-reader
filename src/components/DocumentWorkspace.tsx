import { useEffect, useMemo, useRef, useState } from "react";
import { BrandMark } from "./BrandMark";
import { SevenIcon, type IconName } from "./SevenIcon";
import { canRunTool, tools } from "../data/tools";
import type {
  AdvancedSearchHit,
  AdvancedSearchOptions,
  Capabilities,
  DocumentSummary,
  RenderResult,
  SearchHit,
  ToolId,
} from "../types";
import { nativeAssetUrl } from "../lib/native";
import { ProtectedViewBanner } from "./ProtectedViewBanner";

interface WorkspaceProps {
  document: DocumentSummary;
  tabs: DocumentSummary[];
  rendered: RenderResult | null;
  canReopenClosed: boolean;
  canNavigateBack: boolean;
  canNavigateForward: boolean;
  capabilities: Capabilities | null;
  searchHits: SearchHit[];
  advancedSearchHits: AdvancedSearchHit[];
  page: number;
  zoom: number;
  onHome: () => void;
  onSelectTab: (document: DocumentSummary) => void;
  onCloseTab: (documentId: string) => void;
  onCloseOtherTabs: (documentId: string) => void;
  onReopenClosed: () => void;
  onReorderTabs: (sourceId: string, targetId: string) => void;
  onNavigateBack: () => void;
  onNavigateForward: () => void;
  onOpen: () => void;
  onSaveAs: () => void;
  onPrint: () => void;
  onRender: (page: number, zoom: number) => void;
  onSearch: (query: string) => void;
  onAdvancedSearch: (options: AdvancedSearchOptions) => void;
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
  tabs,
  rendered,
  canReopenClosed,
  canNavigateBack,
  canNavigateForward,
  capabilities,
  searchHits,
  advancedSearchHits,
  page,
  zoom,
  onHome,
  onSelectTab,
  onCloseTab,
  onCloseOtherTabs,
  onReopenClosed,
  onReorderTabs,
  onNavigateBack,
  onNavigateForward,
  onOpen,
  onSaveAs,
  onPrint,
  onRender,
  onSearch,
  onAdvancedSearch,
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
  const [advancedSearch, setAdvancedSearch] = useState(false);
  const [searchMatchCase, setSearchMatchCase] = useState(false);
  const [searchWholeWord, setSearchWholeWord] = useState(false);
  const [searchRegex, setSearchRegex] = useState(false);
  const [searchPageStart, setSearchPageStart] = useState("");
  const [searchPageEnd, setSearchPageEnd] = useState("");
  const [searchScopes, setSearchScopes] = useState({
    text: true,
    comments: true,
    bookmarks: true,
    forms: true,
    metadata: true,
  });
  const [toolSearch, setToolSearch] = useState("");
  const [pageInput, setPageInput] = useState(String(page + 1));
  const [draggedTab, setDraggedTab] = useState<string | null>(null);
  const [tabMenu, setTabMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const focus = () => searchRef.current?.focus();
    window.addEventListener("seven:focus-search", focus);
    return () => window.removeEventListener("seven:focus-search", focus);
  }, []);
  useEffect(() => setPageInput(String(page + 1)), [page]);
  useEffect(() => {
    if (!tabMenu) return;
    const close = () => setTabMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("blur", close);
    };
  }, [tabMenu]);
  const [viewerTool, setViewerTool] = useState<"select" | "hand">("select");

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

  const goToPage = () => {
    const requested = Number(pageInput);
    if (!Number.isFinite(requested)) {
      setPageInput(String(page + 1));
      return;
    }
    const target = Math.max(1, Math.min(document.pageCount, Math.trunc(requested))) - 1;
    onRender(target, zoom);
  };

  const fitView = (mode: "page" | "width" | "actual") => {
    if (mode === "actual") {
      onRender(page, 100);
      return;
    }
    if (!rendered || !stageRef.current) return;
    const scale = Math.max(0.01, zoom / 100);
    const baseWidth = rendered.width / scale;
    const baseHeight = rendered.height / scale;
    const availableWidth = Math.max(320, stageRef.current.clientWidth - 96);
    const availableHeight = Math.max(320, stageRef.current.clientHeight - 132);
    const widthZoom = (availableWidth / baseWidth) * 100;
    const pageZoom = Math.min(widthZoom, (availableHeight / baseHeight) * 100);
    onRender(page, Math.max(25, Math.min(400, mode === "width" ? widthZoom : pageZoom)));
  };

  const submitSearch = () => {
    onSearch(search);
    setLeftPanel("search");
  };

  const submitAdvancedSearch = () => {
    const numberOrUndefined = (value: string) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : undefined;
    };
    onAdvancedSearch({
      query: search,
      matchCase: searchMatchCase,
      wholeWord: searchWholeWord,
      regex: searchRegex,
      pageStart: numberOrUndefined(searchPageStart),
      pageEnd: numberOrUndefined(searchPageEnd),
      includeText: searchScopes.text,
      includeComments: searchScopes.comments,
      includeBookmarks: searchScopes.bookmarks,
      includeForms: searchScopes.forms,
      includeMetadata: searchScopes.metadata,
    });
    setLeftPanel("search");
  };

  return (
    <div className={`workspace viewer-${viewerTool}`}>
      <header className="workspace-topbar">
        <button className="workspace-brand" onClick={onHome} aria-label="Início"><BrandMark size={30} /></button>
        <div className="document-tabs" role="tablist" aria-label="Documentos abertos">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={tab.id === document.id ? "document-tab active" : "document-tab"}
              role="tab"
              aria-selected={tab.id === document.id}
              draggable
              onDragStart={() => setDraggedTab(tab.id)}
              onDragEnd={() => setDraggedTab(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                if (draggedTab) onReorderTabs(draggedTab, tab.id);
                setDraggedTab(null);
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                setTabMenu({ id: tab.id, x: event.clientX, y: event.clientY });
              }}
            >
              <button className="tab-select" onClick={() => onSelectTab(tab)} title={tab.path}>
                <span className="tab-file-icon">PDF</span>
                <span className="tab-title">{tab.name}</span>
              </button>
              <button className="tab-close" aria-label={`Fechar ${tab.name}`} onClick={() => onCloseTab(tab.id)}>
                <SevenIcon name="close" />
              </button>
            </div>
          ))}
          <button className="tab-add" onClick={onOpen} aria-label="Abrir outro PDF" title="Abrir outro PDF">
            <SevenIcon name="create" />
          </button>
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
              <div className="search-panel-content">
                <div className="search-mode-toggle">
                  <button className={!advancedSearch ? "active" : ""} onClick={() => setAdvancedSearch(false)}>Simples</button>
                  <button className={advancedSearch ? "active" : ""} onClick={() => setAdvancedSearch(true)}>Avançada</button>
                </div>

                {advancedSearch && (
                  <div className="advanced-search-options">
                    <div className="search-option-grid">
                      <label><input type="checkbox" checked={searchMatchCase} onChange={(event) => setSearchMatchCase(event.target.checked)} /> Maiúsculas/minúsculas</label>
                      <label><input type="checkbox" checked={searchWholeWord} onChange={(event) => setSearchWholeWord(event.target.checked)} /> Palavra inteira</label>
                      <label><input type="checkbox" checked={searchRegex} onChange={(event) => setSearchRegex(event.target.checked)} /> Regex</label>
                    </div>
                    <div className="search-page-range">
                      <input value={searchPageStart} onChange={(event) => setSearchPageStart(event.target.value.replace(/[^0-9]/g, ""))} placeholder="Página inicial" />
                      <span>até</span>
                      <input value={searchPageEnd} onChange={(event) => setSearchPageEnd(event.target.value.replace(/[^0-9]/g, ""))} placeholder="Página final" />
                    </div>
                    <div className="search-scopes">
                      {([
                        ["text", "Texto"],
                        ["comments", "Comentários"],
                        ["bookmarks", "Marcadores"],
                        ["forms", "Campos"],
                        ["metadata", "Metadados"],
                      ] as const).map(([key, label]) => (
                        <label key={key}>
                          <input
                            type="checkbox"
                            checked={searchScopes[key]}
                            onChange={(event) => setSearchScopes((current) => ({ ...current, [key]: event.target.checked }))}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                    <button className="search-run-button" disabled={!search.trim()} onClick={submitAdvancedSearch}>
                      <SevenIcon name="search" /> Pesquisar
                    </button>
                  </div>
                )}

                <div className="search-results">
                  {!advancedSearch && !searchHits.length && <div className="empty-panel">Pesquise um termo para ver ocorrências.</div>}
                  {!advancedSearch && searchHits.map((hit) => (
                    <button key={hit.pageIndex} className="search-hit" onClick={() => onRender(hit.pageIndex, zoom)}>
                      <strong>Página {hit.pageIndex + 1}</strong>
                      <span>{hit.excerpt || "Texto encontrado nesta página."}</span>
                      <small>{hit.occurrences} ocorrência(s)</small>
                    </button>
                  ))}
                  {advancedSearch && !advancedSearchHits.length && <div className="empty-panel">Configure os filtros e execute a busca.</div>}
                  {advancedSearch && advancedSearchHits.map((hit, index) => (
                    <button
                      key={`${hit.kind}-${hit.pageIndex ?? "none"}-${index}`}
                      className="search-hit"
                      disabled={hit.pageIndex === undefined}
                      onClick={() => hit.pageIndex !== undefined && onRender(hit.pageIndex, zoom)}
                    >
                      <strong>{hit.title}</strong>
                      <span>{hit.excerpt || "Correspondência encontrada."}</span>
                      <small>{hit.kind} · {hit.occurrences} ocorrência(s){hit.pageIndex !== undefined ? ` · pág. ${hit.pageIndex + 1}` : ""}</small>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </aside>
        )}

        <main className="document-stage" ref={stageRef}>
          <div className="document-canvas">
            {rendered ? (
              <div className="rendered-page" style={{ width: rendered.width }}>
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
            <button aria-label="Destaque" onClick={() => onTool("comment")} title="Abrir comentários e marcações"><SevenIcon name="highlight" /></button>
            <button aria-label="Desenho" disabled><SevenIcon name="draw" /></button>
            <button aria-label="Assinatura" onClick={() => onTool("fill-sign")}><SevenIcon name="sign" /></button>
          </div>

          <div className="view-controls">
            <button aria-label="Voltar à visualização anterior" disabled={!canNavigateBack} onClick={onNavigateBack}><SevenIcon name="history" /></button>
            <button aria-label="Avançar à visualização seguinte" disabled={!canNavigateForward} onClick={onNavigateForward}><SevenIcon name="chevronRight" /></button>
            <i />
            <button aria-label="Primeira página" disabled={page === 0} onClick={() => onRender(0, zoom)}><span className="edge-page">«</span></button>
            <button aria-label="Página anterior" disabled={page === 0} onClick={() => onRender(page - 1, zoom)}><SevenIcon name="chevronLeft" /></button>
            <label className="page-jump" title={`${document.pageCount} páginas`}>
              <input
                value={pageInput}
                onChange={(event) => setPageInput(event.target.value.replace(/[^0-9]/g, ""))}
                onKeyDown={(event) => event.key === "Enter" && goToPage()}
                onBlur={goToPage}
                aria-label="Ir para página"
              />
              <span>/ {document.pageCount}</span>
            </label>
            <button aria-label="Próxima página" disabled={page >= document.pageCount - 1} onClick={() => onRender(page + 1, zoom)}><SevenIcon name="chevronRight" /></button>
            <button aria-label="Última página" disabled={page >= document.pageCount - 1} onClick={() => onRender(document.pageCount - 1, zoom)}><span className="edge-page">»</span></button>
            <i />
            <button className="view-mode-button" onClick={() => fitView("page")} title="Ajustar página">Página</button>
            <button className="view-mode-button" onClick={() => fitView("width")} title="Ajustar largura">Largura</button>
            <button className="view-mode-button" onClick={() => fitView("actual")} title="Tamanho real">1:1</button>
            <i />
            <button aria-label="Diminuir zoom" onClick={() => changeZoom(-10)}><SevenIcon name="zoomOut" /></button>
            <span className="zoom-label">{Math.round(zoom)}%</span>
            <button aria-label="Aumentar zoom" onClick={() => changeZoom(10)}><SevenIcon name="zoomIn" /></button>
          </div>
        </main>

        {tabMenu && (
          <div className="tab-context-menu" style={{ left: tabMenu.x, top: tabMenu.y }} onClick={(event) => event.stopPropagation()}>
            <button onClick={() => { onCloseTab(tabMenu.id); setTabMenu(null); }}>Fechar aba</button>
            <button disabled={tabs.length <= 1} onClick={() => { onCloseOtherTabs(tabMenu.id); setTabMenu(null); }}>Fechar outras</button>
            <button disabled={!canReopenClosed} onClick={() => { onReopenClosed(); setTabMenu(null); }}>Reabrir aba fechada</button>
          </div>
        )}

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
