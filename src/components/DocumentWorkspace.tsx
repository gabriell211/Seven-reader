import { useEffect, useMemo, useRef, useState } from "react";
import { BrandMark } from "./BrandMark";
import { SevenIcon, type IconName } from "./SevenIcon";
import { canRunTool, tools } from "../data/tools";
import type {
  AdvancedSearchHit,
  AdvancedSearchOptions,
  Capabilities,
  InkAnnotationInput,
  JobStatus,
  NormalizedRect,
  DocumentSummary,
  RenderResult,
  SearchHit,
  ToolId,
} from "../types";
import { cropPageSelection, extractTextInRect, nativeAssetUrl } from "../lib/native";
import { writeImage, writeText } from "@tauri-apps/plugin-clipboard-manager";
import { ProtectedViewBanner } from "./ProtectedViewBanner";
import type { QuickToolId, SidePanelId } from "../lib/settings";

interface WorkspaceProps {
  document: DocumentSummary;
  tabs: DocumentSummary[];
  rendered: RenderResult | null;
  canReopenClosed: boolean;
  canNavigateBack: boolean;
  canNavigateForward: boolean;
  capabilities: Capabilities | null;
  quickTools: QuickToolId[];
  quickToolsPosition: { x: number; y: number } | null;
  sidePanels: SidePanelId[];
  taskHistory: JobStatus[];
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
  onQuickToolsPositionChange: (position: { x: number; y: number } | null) => void;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onPrint: () => void;
  onRender: (page: number, zoom: number) => void;
  onSearch: (query: string) => void;
  onInk: (ink: InkAnnotationInput) => void;
  onMarkup: (kind: "highlight" | "underline" | "strikeout", rect: NormalizedRect) => void;
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
  quickTools,
  quickToolsPosition,
  sidePanels,
  taskHistory,
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
  onQuickToolsPositionChange,
  onOpen,
  onSave,
  onSaveAs,
  onUndo,
  onRedo,
  onPrint,
  onRender,
  onSearch,
  onInk,
  onMarkup,
  onAdvancedSearch,
  onTool,
  onSettings,
  protectedView,
  protectedReasons,
  onTrustOnce,
  onTrustLocation,
}: WorkspaceProps) {
  const [toolsOpen, setToolsOpen] = useState(false);
  const [leftPanel, setLeftPanel] = useState<"thumbs" | "search" | "tasks" | null>("thumbs");
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
  const pageRef = useRef<HTMLDivElement>(null);
  const [inkPoints, setInkPoints] = useState<Array<[number, number]>>([]);
  const [inkWidth, setInkWidth] = useState(2.5);
  const [selectionStart, setSelectionStart] = useState<[number, number] | null>(null);
  const [selectionRect, setSelectionRect] = useState<NormalizedRect | null>(null);
  const [selectedText, setSelectedText] = useState("");
  const [selectionBusy, setSelectionBusy] = useState(false);
  const [toolbarPosition, setToolbarPosition] = useState(quickToolsPosition);
  const toolbarDragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);
  const drawingRef = useRef(false);
  const [viewerTool, setViewerTool] = useState<"select" | "hand" | "draw" | "highlight" | "underline" | "strikeout">("select");

  useEffect(() => {
    const focus = () => searchRef.current?.focus();
    window.addEventListener("seven:focus-search", focus);
    return () => window.removeEventListener("seven:focus-search", focus);
  }, []);
  useEffect(() => {
    setPageInput(String(page + 1));
    setSelectionStart(null);
    setSelectionRect(null);
    setSelectedText("");
  }, [page]);
  useEffect(() => setToolbarPosition(quickToolsPosition), [quickToolsPosition]);
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
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editing = target?.matches("input, textarea, select, [contenteditable='true']");
      if (editing || viewerTool !== "select") return;
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === "a") {
        event.preventDefault();
        selectWholePage();
      }
      if (modifier && event.key.toLowerCase() === "c" && selectedText) {
        event.preventDefault();
        void copySelectedText();
      }
      if (event.key === "Escape" && selectionRect) {
        event.preventDefault();
        clearSelection();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [viewerTool, selectedText, selectionRect, page, document.id, rendered?.width]);

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

  const beginToolbarDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const stage = stageRef.current?.getBoundingClientRect();
    const toolbar = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!stage || !toolbar) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    toolbarDragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - toolbar.left,
      offsetY: event.clientY - toolbar.top,
    };
  };

  const moveToolbarDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = toolbarDragRef.current;
    const stage = stageRef.current?.getBoundingClientRect();
    const toolbar = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!drag || !stage || !toolbar || drag.pointerId !== event.pointerId) return;
    const x = Math.max(8, Math.min(stage.width - toolbar.width - 8, event.clientX - stage.left - drag.offsetX));
    const y = Math.max(8, Math.min(stage.height - toolbar.height - 8, event.clientY - stage.top - drag.offsetY));
    setToolbarPosition({ x, y });
  };

  const finishToolbarDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!toolbarDragRef.current || toolbarDragRef.current.pointerId !== event.pointerId) return;
    toolbarDragRef.current = null;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* already released */ }
    if (toolbarPosition) onQuickToolsPositionChange(toolbarPosition);
  };

  const runQuickTool = (id: QuickToolId) => {
    if (id === "select") return setViewerTool("select");
    if (id === "hand") return setViewerTool("hand");
    if (id === "draw") return setViewerTool(viewerTool === "draw" ? "select" : "draw");
    if (id === "highlight" || id === "underline" || id === "strikeout") {
      return setViewerTool(viewerTool === id ? "select" : id);
    }
    if (id === "text") return onTool("edit");
    if (id === "fill") return onTool("forms");
    if (id === "sign") return onTool("fill-sign");
    if (id === "comment" || id === "eraser") {
      return onTool("comment");
    }
  };

  const quickToolIcon = (id: QuickToolId): IconName => {
    const map: Record<QuickToolId, IconName> = {
      select: "text",
      hand: "hand",
      comment: "comment",
      highlight: "highlight",
      underline: "highlight",
      strikeout: "redact",
      draw: "draw",
      text: "edit",
      fill: "form",
      sign: "sign",
      eraser: "close",
    };
    return map[id];
  };

  const quickToolLabel = (id: QuickToolId): string => {
    const map: Record<QuickToolId, string> = {
      select: "Seleção",
      hand: "Mão",
      comment: "Comentário",
      highlight: "Destaque",
      underline: "Sublinhado",
      strikeout: "Tachado",
      draw: "Desenho à mão livre",
      text: "Editar texto",
      fill: "Preencher formulário",
      sign: "Assinatura",
      eraser: "Remover comentário",
    };
    return map[id];
  };

  const panelAction = (id: SidePanelId) => {
    if (id === "thumbs" || id === "search" || id === "tasks") {
      setLeftPanel((current) => current === id ? null : id);
      return;
    }
    if (id === "bookmarks") return onTool("bookmarks");
    if (id === "comments") return onTool("comment");
    if (id === "attachments") return onTool("attachments");
    if (id === "layers") return onTool("layers");
    if (id === "signatures") return onTool("certificates");
    if (id === "fields") return onTool("forms");
  };

  const panelIcon = (id: SidePanelId): IconName => ({
    thumbs: "pages",
    search: "search",
    bookmarks: "bookmark",
    comments: "comment",
    attachments: "attachment",
    layers: "layers",
    signatures: "certificate",
    fields: "form",
    tasks: "automation",
  })[id];

  const normalizedPoint = (clientX: number, clientY: number): [number, number] | null => {
    const rect = pageRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    return [
      Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
      Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
    ];
  };

  const rectFromPoints = (start: [number, number], end: [number, number]): NormalizedRect => ({
    x: Math.min(start[0], end[0]),
    y: Math.min(start[1], end[1]),
    width: Math.abs(end[0] - start[0]),
    height: Math.abs(end[1] - start[1]),
  });

  const loadSelectionText = async (rect: NormalizedRect) => {
    if (rect.width < 0.002 || rect.height < 0.002) {
      setSelectedText("");
      return;
    }
    setSelectionBusy(true);
    try {
      const result = await extractTextInRect(document.id, page, rect);
      setSelectedText(result.text);
    } catch {
      setSelectedText("");
    } finally {
      setSelectionBusy(false);
    }
  };

  const isRectSelectionTool = viewerTool === "select" || viewerTool === "highlight" || viewerTool === "underline" || viewerTool === "strikeout";

  const beginSelection = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isRectSelectionTool) return;
    const point = normalizedPoint(event.clientX, event.clientY);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectionStart(point);
    setSelectionRect({ x: point[0], y: point[1], width: 0, height: 0 });
    setSelectedText("");
  };

  const moveSelection = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isRectSelectionTool || !selectionStart) return;
    const point = normalizedPoint(event.clientX, event.clientY);
    if (!point) return;
    setSelectionRect(rectFromPoints(selectionStart, point));
  };

  const finishSelection = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isRectSelectionTool || !selectionStart) return;
    const point = normalizedPoint(event.clientX, event.clientY);
    const rect = point ? rectFromPoints(selectionStart, point) : selectionRect;
    setSelectionStart(null);
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* already released */ }
    if (rect) {
      setSelectionRect(rect);
      if (viewerTool === "select") {
        void loadSelectionText(rect);
      } else if (rect.width >= 0.002 && rect.height >= 0.002) {
        onMarkup(viewerTool, rect);
        setSelectionStart(null);
        setSelectionRect(null);
        setSelectedText("");
      }
    }
  };

  const selectWholePage = () => {
    const rect: NormalizedRect = { x: 0, y: 0, width: 1, height: 1 };
    setSelectionRect(rect);
    void loadSelectionText(rect);
  };

  const clearSelection = () => {
    setSelectionStart(null);
    setSelectionRect(null);
    setSelectedText("");
  };

  const copySelectedText = async () => {
    if (!selectedText) return;
    await writeText(selectedText);
  };

  const copySelectionImage = async () => {
    if (!selectionRect || !rendered) return;
    setSelectionBusy(true);
    try {
      const path = await cropPageSelection(document.id, page, rendered.width, selectionRect);
      await writeImage(path);
    } finally {
      setSelectionBusy(false);
    }
  };

  const beginInk = (event: React.PointerEvent<HTMLDivElement>) => {
    if (viewerTool !== "draw") return;
    const point = normalizedPoint(event.clientX, event.clientY);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    setInkPoints([point]);
  };

  const moveInk = (event: React.PointerEvent<HTMLDivElement>) => {
    if (viewerTool !== "draw" || !drawingRef.current) return;
    const point = normalizedPoint(event.clientX, event.clientY);
    if (!point) return;
    setInkPoints((current) => {
      const last = current.at(-1);
      if (last && Math.hypot(point[0] - last[0], point[1] - last[1]) < 0.0015) return current;
      return current.length >= 20_000 ? current : [...current, point];
    });
  };

  const finishInk = (event: React.PointerEvent<HTMLDivElement>) => {
    if (viewerTool !== "draw" || !drawingRef.current) return;
    drawingRef.current = false;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* already released */ }
    setInkPoints((current) => {
      if (current.length >= 2) {
        onInk({
          pageIndex: page,
          author: "Seven Reader",
          points: current,
          lineWidth: inkWidth,
        });
      }
      return [];
    });
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
                <span className="tab-title">{tab.name}{tab.dirty && <i className="tab-dirty" title="Alterações não salvas" />}</span>
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
        <button className="global-action compact" disabled={!document.canUndo} onClick={onUndo}><SevenIcon name="undo" /><span>Desfazer</span></button>
        <button className="global-action compact" disabled={!document.canRedo} onClick={onRedo}><SevenIcon name="redo" /><span>Refazer</span></button>
        <button className="global-action compact" disabled={!document.dirty} onClick={onSave}><SevenIcon name="save" /><span>Salvar</span></button>
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
          {sidePanels.map((panel) => (
            <button
              key={panel}
              className={(panel === "thumbs" || panel === "search" || panel === "tasks") && leftPanel === panel ? "rail-button active" : "rail-button"}
              onClick={() => panelAction(panel)}
              aria-label={panel}
              title={panel}
            >
              <SevenIcon name={panelIcon(panel)} />
            </button>
          ))}
        </aside>

        {leftPanel && (
          <aside className="left-panel">
            <div className="panel-title">
              <strong>{leftPanel === "thumbs" ? "Miniaturas" : leftPanel === "search" ? "Resultados" : "Tarefas"}</strong>
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
            ) : leftPanel === "search" ? (
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
            ) : (
              <div className="panel-task-list">
                {!taskHistory.length && <div className="empty-panel">Nenhuma tarefa registrada nesta sessão ou no histórico local.</div>}
                {taskHistory.slice(0, 30).map((job) => (
                  <article className="panel-task-row" key={job.id}>
                    <span className={`task-state task-state--${job.state}`} />
                    <div>
                      <strong>{job.kind.replace(/-/g, " ")}</strong>
                      <small>{job.stage}</small>
                      {job.error && <em>{job.error}</em>}
                    </div>
                    <b>{job.progress !== undefined ? `${Math.round(job.progress * 100)}%` : job.state}</b>
                  </article>
                ))}
              </div>
            )}
          </aside>
        )}

        <main className="document-stage" ref={stageRef}>
          <div className="document-canvas">
            {rendered ? (
              <div
                className={[
                  "rendered-page",
                  viewerTool === "draw" ? "drawing-active" : "",
                  isRectSelectionTool ? "selection-active" : "",
                  viewerTool === "highlight" ? "markup-highlight" : "",
                  viewerTool === "underline" ? "markup-underline" : "",
                  viewerTool === "strikeout" ? "markup-strikeout" : "",
                ].filter(Boolean).join(" ")}
                style={{ width: rendered.width }}
                ref={pageRef}
                onPointerDown={(event) => {
                  beginInk(event);
                  beginSelection(event);
                }}
                onPointerMove={(event) => {
                  moveInk(event);
                  moveSelection(event);
                }}
                onPointerUp={(event) => {
                  finishInk(event);
                  finishSelection(event);
                }}
                onPointerCancel={(event) => {
                  finishInk(event);
                  finishSelection(event);
                }}
              >
                <img src={nativeAssetUrl(rendered.cachePath)} alt={`Página ${page + 1}`} draggable={false} />
                {isRectSelectionTool && selectionRect && (
                  <div
                    className={`selection-rect selection-rect--${viewerTool}`}
                    style={{
                      left: `${selectionRect.x * 100}%`,
                      top: `${selectionRect.y * 100}%`,
                      width: `${selectionRect.width * 100}%`,
                      height: `${selectionRect.height * 100}%`,
                    }}
                    aria-hidden="true"
                  />
                )}
                {viewerTool === "select" && selectionRect && selectionRect.width > 0.002 && selectionRect.height > 0.002 && (
                  <div className="selection-actions">
                    <button disabled={!selectedText || selectionBusy} onClick={() => void copySelectedText()}>
                      <SevenIcon name="text" /> Copiar texto
                    </button>
                    <button disabled={selectionBusy} onClick={() => void copySelectionImage()}>
                      <SevenIcon name="open" /> Copiar imagem
                    </button>
                    <button disabled={selectionBusy} onClick={selectWholePage}>Página inteira</button>
                    <button onClick={clearSelection} aria-label="Limpar seleção"><SevenIcon name="close" /></button>
                    <small>{selectionBusy ? "Lendo seleção…" : selectedText ? `${selectedText.trim().length} caracteres` : "Sem texto na área"}</small>
                  </div>
                )}
                {viewerTool === "draw" && inkPoints.length > 0 && (
                  <svg className="ink-preview" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
                    <polyline
                      points={inkPoints.map(([x, y]) => `${(x * 1000).toFixed(2)},${(y * 1000).toFixed(2)}`).join(" ")}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={Math.max(1.5, inkWidth * 1.8)}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  </svg>
                )}
              </div>
            ) : (
              <div className="loading-page"><span className="loader-ring" /><strong>Renderizando página…</strong></div>
            )}
          </div>

          <div
            className={toolbarPosition ? "quick-tools quick-tools--free" : "quick-tools"}
            role="toolbar"
            aria-label="Ferramentas rápidas"
            style={toolbarPosition ? { left: toolbarPosition.x, top: toolbarPosition.y, bottom: "auto", transform: "none" } : undefined}
          >
            <button
              className="quick-tools-drag"
              aria-label="Mover barra de ferramentas"
              title="Arrastar barra"
              onPointerDown={beginToolbarDrag}
              onPointerMove={moveToolbarDrag}
              onPointerUp={finishToolbarDrag}
              onPointerCancel={finishToolbarDrag}
            ><SevenIcon name="more" /></button>
            {quickTools.map((id) => (
              <button
                key={id}
                className={(id === viewerTool) ? "active" : ""}
                aria-label={quickToolLabel(id)}
                title={quickToolLabel(id)}
                onClick={() => runQuickTool(id)}
              >
                <SevenIcon name={quickToolIcon(id)} />
              </button>
            ))}
            {viewerTool === "draw" && quickTools.includes("draw") && (
              <label className="ink-width-control" title="Espessura do desenho">
                <input type="range" min={0.5} max={12} step={0.5} value={inkWidth} onChange={(event) => setInkWidth(Number(event.target.value))} />
                <small>{inkWidth.toFixed(1)} pt</small>
              </label>
            )}
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
