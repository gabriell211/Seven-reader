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
  MeasurementInfo,
  MeasurementInput,
  NormalizedRect,
  PagePreflight,
  DocumentSummary,
  ExternalFileStatus,
  RenderResult,
  SearchHit,
  SearchOccurrence,
  ToolId,
  ViewMode,
} from "../types";
import { cropPageSelection, extractTextInRect, getPagePreflight, nativeAssetUrl } from "../lib/native";
import { writeImage, writeText } from "@tauri-apps/plugin-clipboard-manager";
import { save } from "@tauri-apps/plugin-dialog";
import { ProtectedViewBanner } from "./ProtectedViewBanner";
import type { QuickToolId, SidePanelId } from "../lib/settings";

interface WorkspaceProps {
  document: DocumentSummary;
  tabs: DocumentSummary[];
  rendered: RenderResult | null;
  renderedPages: RenderResult[];
  splitDocument: DocumentSummary | null;
  splitRendered: RenderResult | null;
  splitPage: number;
  splitZoom: number;
  splitOrientation: "vertical" | "horizontal";
  viewMode: ViewMode;
  canReopenClosed: boolean;
  canNavigateBack: boolean;
  canNavigateForward: boolean;
  capabilities: Capabilities | null;
  quickTools: QuickToolId[];
  quickToolsPosition: { x: number; y: number } | null;
  sidePanels: SidePanelId[];
  taskHistory: JobStatus[];
  onPauseJob: (jobId: string) => void;
  onResumeJob: (jobId: string) => void;
  onCancelJob: (jobId: string) => void;
  measurements: MeasurementInfo[];
  measurementActivation: number;
  searchHits: SearchHit[];
  searchOccurrences: SearchOccurrence[];
  searchOccurrenceIndex: number;
  advancedSearchHits: AdvancedSearchHit[];
  page: number;
  zoom: number;
  onHome: () => void;
  onSelectTab: (document: DocumentSummary) => void;
  onCloseTab: (documentId: string) => void;
  onCloseOtherTabs: (documentId: string) => void;
  onReopenClosed: () => void;
  onReorderTabs: (sourceId: string, targetId: string) => void;
  canCreateWindow: boolean;
  onOpenInNewWindow: (documentId: string) => void;
  onMoveToNewWindow: (documentId: string) => void;
  onOpenSideBySide: (documentId: string) => void;
  onCloseSideBySide: () => void;
  onSplitRender: (page: number, zoom: number) => void;
  onSplitOrientationChange: (orientation: "vertical" | "horizontal") => void;
  onTransferPages: (
    sourceDocumentId: string,
    targetDocumentId: string,
    pageRange: string,
    insertAfter: number,
    movePages: boolean,
  ) => void;
  onNavigateBack: () => void;
  onNavigateForward: () => void;
  onQuickToolsPositionChange: (position: { x: number; y: number } | null) => void;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onPrint: (selection?: NormalizedRect) => void;
  onSelectionChange: (selection: NormalizedRect | null) => void;
  focusSelection?: NormalizedRect | null;
  onRender: (page: number, zoom: number) => void;
  onVisiblePage: (page: number) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onSearch: (query: string) => void;
  onSelectSearchOccurrence: (index: number) => void;
  onInk: (ink: InkAnnotationInput) => void;
  onMarkup: (kind: "highlight" | "underline" | "strikeout", rect: NormalizedRect) => void;
  onMeasurement: (measurement: MeasurementInput) => void;
  onReloadMeasurements: () => void;
  onExportMeasurements: (destination: string) => void;
  onAdvancedSearch: (options: AdvancedSearchOptions) => void;
  onTool: (tool: ToolId) => void;
  onSettings: () => void;
  onHelp: () => void;
  externalFileStatus: ExternalFileStatus | null;
  onReloadExternal: () => void;
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
  renderedPages,
  splitDocument,
  splitRendered,
  splitPage,
  splitZoom,
  splitOrientation,
  viewMode,
  canReopenClosed,
  canNavigateBack,
  canNavigateForward,
  capabilities,
  quickTools,
  quickToolsPosition,
  sidePanels,
  taskHistory,
  onPauseJob,
  onResumeJob,
  onCancelJob,
  measurements,
  measurementActivation,
  searchHits,
  searchOccurrences,
  searchOccurrenceIndex,
  advancedSearchHits,
  page,
  zoom,
  onHome,
  onSelectTab,
  onCloseTab,
  onCloseOtherTabs,
  onReopenClosed,
  onReorderTabs,
  canCreateWindow,
  onOpenInNewWindow,
  onMoveToNewWindow,
  onOpenSideBySide,
  onCloseSideBySide,
  onSplitRender,
  onSplitOrientationChange,
  onTransferPages,
  onNavigateBack,
  onNavigateForward,
  onQuickToolsPositionChange,
  onOpen,
  onSave,
  onSaveAs,
  onUndo,
  onRedo,
  onPrint,
  onSelectionChange,
  focusSelection,
  onRender,
  onVisiblePage,
  onViewModeChange,
  onSearch,
  onSelectSearchOccurrence,
  onInk,
  onMarkup,
  onMeasurement,
  onReloadMeasurements,
  onExportMeasurements,
  onAdvancedSearch,
  onTool,
  onSettings,
  onHelp,
  externalFileStatus,
  onReloadExternal,
  protectedView,
  protectedReasons,
  onTrustOnce,
  onTrustLocation,
}: WorkspaceProps) {
  const [toolsOpen, setToolsOpen] = useState(false);
  const [mainMenu, setMainMenu] = useState<"file" | "edit" | "view" | "help" | null>(null);
  const [leftPanel, setLeftPanel] = useState<"thumbs" | "search" | "tasks" | null>("thumbs");
  const [search, setSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
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
    attachments: true,
    metadata: true,
  });
  const [toolSearch, setToolSearch] = useState("");
  const [pageInput, setPageInput] = useState(String(page + 1));
  const [draggedTab, setDraggedTab] = useState<string | null>(null);
  const [tabMenu, setTabMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
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
  const visiblePageRef = useRef(page);
  const scrollFrameRef = useRef<number | null>(null);
  const [viewerTool, setViewerTool] = useState<"select" | "hand" | "draw" | "highlight" | "underline" | "strikeout" | "zoom-area" | "dynamic-zoom" | "measure">("select");
  const [visualRotation, setVisualRotation] = useState<0 | 90 | 180 | 270>(0);
  const [immersiveMode, setImmersiveMode] = useState<"normal" | "reading" | "presentation">("normal");
  const [pageGeometry, setPageGeometry] = useState<PagePreflight | null>(null);
  const [showRulers, setShowRulers] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [snapGrid, setSnapGrid] = useState(false);
  const [gridStepPt, setGridStepPt] = useState(18);
  const [rulerUnit, setRulerUnit] = useState<"pt" | "mm" | "cm" | "in">("mm");
  const [cursorPoint, setCursorPoint] = useState<[number, number] | null>(null);
  const [guides, setGuides] = useState<Array<{ id: string; axis: "x" | "y"; valuePt: number }>>([]);
  const [loupeEnabled, setLoupeEnabled] = useState(false);
  const [loupePoint, setLoupePoint] = useState<[number, number] | null>(null);
  const [reflowEnabled, setReflowEnabled] = useState(false);
  const [reflowText, setReflowText] = useState("");
  const [reflowLoading, setReflowLoading] = useState(false);
  const [transferDirection, setTransferDirection] = useState<"secondary-to-primary" | "primary-to-secondary">("secondary-to-primary");
  const [transferRange, setTransferRange] = useState("");
  const [transferInsertAfter, setTransferInsertAfter] = useState(0);
  const [dynamicScale, setDynamicScale] = useState(1);
  const [measurementOpen, setMeasurementOpen] = useState(false);
  const [measurementKind, setMeasurementKind] = useState<"distance" | "perimeter" | "area">("distance");
  const [measurementPoints, setMeasurementPoints] = useState<Array<[number, number]>>([]);
  const [measurementUnit, setMeasurementUnit] = useState("mm");
  const [pointsPerUnit, setPointsPerUnit] = useState(72 / 25.4);
  const [measurementLabel, setMeasurementLabel] = useState("");
  const [measurementComment, setMeasurementComment] = useState("");
  const [measurementAuthor, setMeasurementAuthor] = useState("Seven Reader");
  const [measurementLineWidth, setMeasurementLineWidth] = useState(1.5);
  const [calibrating, setCalibrating] = useState(false);
  const [calibrationPoints, setCalibrationPoints] = useState<Array<[number, number]>>([]);
  const [calibrationKnown, setCalibrationKnown] = useState(100);
  const dynamicZoomRef = useRef<{ pointerId: number; startY: number; startZoom: number; previewZoom: number } | null>(null);
  const panRef = useRef<{ pointerId: number; startX: number; startY: number; scrollLeft: number; scrollTop: number } | null>(null);

  useEffect(() => {
    const focus = () => searchRef.current?.focus();
    window.addEventListener("seven:focus-search", focus);
    return () => window.removeEventListener("seven:focus-search", focus);
  }, []);
  useEffect(() => {
    visiblePageRef.current = page;
    setPageInput(String(page + 1));
    setSelectionStart(null);
    setSelectionRect(null);
    setSelectedText("");
  }, [page]);
  useEffect(() => setToolbarPosition(quickToolsPosition), [quickToolsPosition]);
  useEffect(() => {
    if (measurementActivation <= 0) return;
    setMeasurementOpen(true);
    setViewerTool("measure");
    setMeasurementPoints([]);
    onReloadMeasurements();
  }, [measurementActivation]);
  useEffect(() => {
    const key = `seven-reader:measure-scale:${document.path}:${page}`;
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? "null");
      if (saved && typeof saved.unit === "string" && typeof saved.pointsPerUnit === "number" && saved.pointsPerUnit > 0) {
        setMeasurementUnit(saved.unit);
        setPointsPerUnit(saved.pointsPerUnit);
        return;
      }
    } catch { /* use physical default */ }
    setMeasurementUnit("mm");
    setPointsPerUnit(72 / 25.4);
  }, [document.path, page]);
  useEffect(() => {
    let active = true;
    void getPagePreflight(document.id, page)
      .then((geometry) => active && setPageGeometry(geometry))
      .catch(() => active && setPageGeometry(null));
    return () => { active = false; };
  }, [document.id, document.revision, page]);
  useEffect(() => {
    if (!reflowEnabled) {
      setReflowText("");
      return;
    }
    let active = true;
    setReflowLoading(true);
    void extractTextInRect(document.id, page, { x: 0, y: 0, width: 1, height: 1 })
      .then((result) => {
        if (active) setReflowText(result.text.trim());
      })
      .catch(() => active && setReflowText(""))
      .finally(() => active && setReflowLoading(false));
    return () => { active = false; };
  }, [reflowEnabled, document.id, document.revision, page]);

  useEffect(() => {
    if (!splitDocument) {
      setTransferRange("");
      setTransferInsertAfter(0);
      return;
    }
    const sourcePage = transferDirection === "secondary-to-primary" ? splitPage : page;
    const targetDocument = transferDirection === "secondary-to-primary" ? document : splitDocument;
    setTransferRange(String(sourcePage + 1));
    setTransferInsertAfter(targetDocument.pageCount);
  }, [splitDocument?.id, transferDirection]);

  useEffect(() => {
    const onFullscreenChange = () => {
      if (!window.document.fullscreenElement && immersiveMode === "presentation") {
        setImmersiveMode("normal");
      }
    };
    window.document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => window.document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [immersiveMode]);

  useEffect(() => {
    onSelectionChange(selectionRect);
  }, [selectionRect]);
  useEffect(() => {
    if (!focusSelection) return;
    setViewerTool("select");
    setSelectionRect(focusSelection);
    setSelectedText("");
  }, [focusSelection?.x, focusSelection?.y, focusSelection?.width, focusSelection?.height]);


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
      if (event.key === "Escape" && immersiveMode === "presentation") {
        setImmersiveMode("normal");
        if (window.document.fullscreenElement) void window.document.exitFullscreen();
        return;
      }
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
  }, [viewerTool, selectedText, selectionRect, page, document.id, rendered?.width, immersiveMode]);

  const currentPageSearchHighlights = useMemo(
    () => searchOccurrences
      .map((occurrence, index) => ({ occurrence, index }))
      .filter(({ occurrence }) => occurrence.pageIndex === page),
    [searchOccurrences, page],
  );

  const globalToolMatches = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    if (!query) return [];
    return tools
      .filter((tool) => [tool.label, tool.description, tool.group].some((value) =>
        value.toLocaleLowerCase("pt-BR").includes(query),
      ))
      .slice(0, 6);
  }, [search]);

  const globalCommandMatches = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    if (!query) return [] as Array<"save" | "print" | "settings" | "properties">;
    const candidates: Array<{ id: "save" | "print" | "settings" | "properties"; text: string }> = [
      { id: "save", text: "salvar documento arquivo" },
      { id: "print", text: "imprimir impressão print" },
      { id: "settings", text: "preferências configurações settings" },
      { id: "properties", text: "propriedades metadados documento" },
    ];
    return candidates.filter((item) => item.text.includes(query)).map((item) => item.id);
  }, [search]);

  const globalPageMatch = useMemo(() => {
    const value = Number(search.trim().replace(/^p(?:ágina)?\s*/i, ""));
    return Number.isInteger(value) && value >= 1 && value <= document.pageCount ? value - 1 : null;
  }, [search, document.pageCount]);

  const runGlobalCommand = (command: "save" | "print" | "settings" | "properties") => {
    setSearchFocused(false);
    if (command === "save") onSave();
    else if (command === "print") onPrint(selectionRect ?? undefined);
    else if (command === "settings") onSettings();
    else onTool("properties");
  };

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

  const pointsToUnit = (value: number) => {
    if (rulerUnit === "in") return value / 72;
    if (rulerUnit === "cm") return value * 2.54 / 72;
    if (rulerUnit === "mm") return value * 25.4 / 72;
    return value;
  };

  const unitDigits = rulerUnit === "pt" ? 0 : rulerUnit === "mm" ? 1 : 2;

  const formatMeasure = (valuePt: number) =>
    `${pointsToUnit(valuePt).toFixed(unitDigits)} ${rulerUnit}`;

  const addGuide = (axis: "x" | "y") => {
    if (!pageGeometry) return;
    const fallback = axis === "x" ? pageGeometry.widthPt / 2 : pageGeometry.heightPt / 2;
    const valuePt = cursorPoint
      ? axis === "x" ? cursorPoint[0] : cursorPoint[1]
      : fallback;
    setGuides((current) => [
      ...current,
      { id: `${axis}-${Date.now()}-${current.length}`, axis, valuePt },
    ]);
  };

  const rotatedDimensions = (result: RenderResult) =>
    visualRotation === 90 || visualRotation === 270
      ? { width: result.height, height: result.width }
      : { width: result.width, height: result.height };

  const rotateView = (direction: -1 | 1) => {
    const sequence: Array<0 | 90 | 180 | 270> = [0, 90, 180, 270];
    const index = sequence.indexOf(visualRotation);
    const next = sequence[(index + direction + sequence.length) % sequence.length];
    setVisualRotation(next);
    clearSelection();
  };

  const toggleFullscreen = async () => {
    try {
      if (window.document.fullscreenElement) await window.document.exitFullscreen();
      else await window.document.documentElement.requestFullscreen();
    } catch {
      // The OS/webview may reject fullscreen; the layout mode remains available.
    }
  };

  const toggleReading = () =>
    setImmersiveMode((current) => current === "reading" ? "normal" : "reading");

  const togglePresentation = async () => {
    const entering = immersiveMode !== "presentation";
    setImmersiveMode(entering ? "presentation" : "normal");
    if (entering && !window.document.fullscreenElement) await toggleFullscreen();
    if (!entering && window.document.fullscreenElement) await toggleFullscreen();
  };

  const fitView = (mode: "page" | "width" | "actual") => {
    if (mode === "actual") {
      onRender(page, 100);
      return;
    }
    if (!rendered || !stageRef.current) return;
    const scale = Math.max(0.01, zoom / 100);
    const rotated = rotatedDimensions(rendered);
    const baseWidth = rotated.width / scale;
    const baseHeight = rotated.height / scale;
    const facing = viewMode === "facing" || viewMode === "facing-continuous";
    const availableWidth = Math.max(320, (stageRef.current.clientWidth - 96) / (facing ? 2 : 1) - (facing ? 18 : 0));
    const availableHeight = Math.max(320, stageRef.current.clientHeight - 132);
    const widthZoom = (availableWidth / baseWidth) * 100;
    const pageZoom = Math.min(widthZoom, (availableHeight / baseHeight) * 100);
    onRender(page, Math.max(25, Math.min(400, mode === "width" ? widthZoom : pageZoom)));
  };

  const handleStageScroll = () => {
    if (viewMode !== "continuous" && viewMode !== "facing-continuous") return;
    if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current);
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const canvasRect = canvas.getBoundingClientRect();
      const centerY = canvasRect.top + canvasRect.height / 2;
      const pages = Array.from(canvas.querySelectorAll<HTMLElement>("[data-page-index]"));
      let best: { page: number; distance: number } | null = null;
      for (const element of pages) {
        const rect = element.getBoundingClientRect();
        const distance = Math.abs(rect.top + rect.height / 2 - centerY);
        const pageIndex = Number(element.dataset.pageIndex);
        if (!Number.isFinite(pageIndex)) continue;
        if (!best || distance < best.distance) best = { page: pageIndex, distance };
      }
      if (best && best.page !== visiblePageRef.current) {
        visiblePageRef.current = best.page;
        onVisiblePage(best.page);
      }
    });
  };

  const beginPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (viewerTool !== "hand") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    panRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: canvas.scrollLeft,
      scrollTop: canvas.scrollTop,
    };
    event.currentTarget.classList.add("is-panning");
  };

  const movePan = (event: React.PointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    const canvas = canvasRef.current;
    if (viewerTool !== "hand" || !pan || !canvas || pan.pointerId !== event.pointerId) return;
    canvas.scrollLeft = pan.scrollLeft - (event.clientX - pan.startX);
    canvas.scrollTop = pan.scrollTop - (event.clientY - pan.startY);
  };

  const finishPan = (event: React.PointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    panRef.current = null;
    event.currentTarget.classList.remove("is-panning");
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* already released */ }
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
    const rx = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const ry = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    let point: [number, number];
    if (visualRotation === 90) point = [ry, 1 - rx];
    else if (visualRotation === 180) point = [1 - rx, 1 - ry];
    else if (visualRotation === 270) point = [1 - ry, rx];
    else point = [rx, ry];

    if (snapGrid && pageGeometry && gridStepPt > 0) {
      const xPt = Math.round((point[0] * pageGeometry.widthPt) / gridStepPt) * gridStepPt;
      const yPt = Math.round((point[1] * pageGeometry.heightPt) / gridStepPt) * gridStepPt;
      point = [
        Math.max(0, Math.min(1, xPt / pageGeometry.widthPt)),
        Math.max(0, Math.min(1, yPt / pageGeometry.heightPt)),
      ];
    }
    return point;
  };

  const defaultPointsPerUnit = (unit: string): number => {
    if (unit === "pt") return 1;
    if (unit === "in") return 72;
    if (unit === "ft") return 72 * 12;
    if (unit === "cm") return 72 / 2.54;
    if (unit === "m") return 72 / 0.0254;
    return 72 / 25.4;
  };

  const persistMeasurementScale = (unit: string, scale: number) => {
    setMeasurementUnit(unit);
    setPointsPerUnit(scale);
    localStorage.setItem(
      `seven-reader:measure-scale:${document.path}:${page}`,
      JSON.stringify({ unit, pointsPerUnit: scale }),
    );
  };

  const pointDistancePt = (a: [number, number], b: [number, number]): number => {
    if (!pageGeometry) return 0;
    const dx = (b[0] - a[0]) * pageGeometry.widthPt;
    const dy = (b[1] - a[1]) * pageGeometry.heightPt;
    return Math.hypot(dx, dy);
  };

  const currentMeasurementValue = useMemo(() => {
    if (!pageGeometry || measurementPoints.length < 2) return 0;
    const pts = measurementPoints.map(([x, y]) => [x * pageGeometry.widthPt, y * pageGeometry.heightPt] as [number, number]);
    if (measurementKind === "distance") {
      return pointDistancePt(measurementPoints[0], measurementPoints[1]) / pointsPerUnit;
    }
    if (measurementKind === "perimeter") {
      let sum = 0;
      for (let index = 1; index < pts.length; index += 1) {
        sum += Math.hypot(pts[index][0] - pts[index - 1][0], pts[index][1] - pts[index - 1][1]);
      }
      if (pts.length >= 3) sum += Math.hypot(pts[0][0] - pts.at(-1)![0], pts[0][1] - pts.at(-1)![1]);
      return sum / pointsPerUnit;
    }
    if (pts.length < 3) return 0;
    let twiceArea = 0;
    for (let index = 0; index < pts.length; index += 1) {
      const next = (index + 1) % pts.length;
      twiceArea += pts[index][0] * pts[next][1] - pts[next][0] * pts[index][1];
    }
    return Math.abs(twiceArea) / 2 / (pointsPerUnit * pointsPerUnit);
  }, [measurementPoints, measurementKind, pageGeometry, pointsPerUnit]);

  const addMeasurementPoint = (event: React.PointerEvent<HTMLDivElement>) => {
    if (viewerTool !== "measure") return;
    const point = normalizedPoint(event.clientX, event.clientY);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    if (calibrating) {
      setCalibrationPoints((current) => current.length >= 2 ? [point] : [...current, point]);
      return;
    }
    setMeasurementPoints((current) => {
      if (measurementKind === "distance") return current.length >= 2 ? [point] : [...current, point];
      return current.length >= 10_000 ? current : [...current, point];
    });
  };

  const applyCalibration = () => {
    if (calibrationPoints.length !== 2 || calibrationKnown <= 0) return;
    const distancePt = pointDistancePt(calibrationPoints[0], calibrationPoints[1]);
    if (distancePt <= 0) return;
    persistMeasurementScale(measurementUnit, distancePt / calibrationKnown);
    setCalibrating(false);
    setCalibrationPoints([]);
  };

  const changeMeasurementUnit = (unit: string) => {
    persistMeasurementScale(unit, defaultPointsPerUnit(unit));
    setCalibrationPoints([]);
  };

  const finishMeasurement = () => {
    const minimum = measurementKind === "distance" ? 2 : 3;
    if (measurementPoints.length < minimum) return;
    onMeasurement({
      pageIndex: page,
      kind: measurementKind,
      points: measurementPoints,
      pointsPerUnit,
      unit: measurementUnit,
      label: measurementLabel,
      comment: measurementComment,
      author: measurementAuthor,
      lineWidth: measurementLineWidth,
    });
    setMeasurementPoints([]);
  };

  const exportMeasurementCsv = async () => {
    const destination = await save({
      title: "Exportar medições",
      defaultPath: document.name.replace(/\.pdf$/i, "-medicoes.csv"),
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (destination) onExportMeasurements(destination);
  };

  const updateCursorPoint = (event: React.PointerEvent<HTMLDivElement>) => {
    const shell = pageRef.current?.getBoundingClientRect();
    if (loupeEnabled && shell) {
      setLoupePoint([
        Math.max(0, Math.min(1, (event.clientX - shell.left) / shell.width)),
        Math.max(0, Math.min(1, (event.clientY - shell.top) / shell.height)),
      ]);
    }
    if (!pageGeometry) return;
    const point = normalizedPoint(event.clientX, event.clientY);
    if (!point) return;
    setCursorPoint([
      point[0] * pageGeometry.widthPt,
      point[1] * pageGeometry.heightPt,
    ]);
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

  const isRectSelectionTool = viewerTool === "select" || viewerTool === "highlight" || viewerTool === "underline" || viewerTool === "strikeout" || viewerTool === "zoom-area";

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
      } else if (viewerTool === "zoom-area" && rect.width >= 0.01 && rect.height >= 0.01) {
        const stage = stageRef.current;
        const current = rendered;
        if (stage && current) {
          const sourceWidth = current.width * rect.width;
          const sourceHeight = current.height * rect.height;
          const rotatedSelection = visualRotation === 90 || visualRotation === 270
            ? { width: sourceHeight, height: sourceWidth }
            : { width: sourceWidth, height: sourceHeight };
          const factor = Math.min(
            Math.max(1, stage.clientWidth - 110) / Math.max(1, rotatedSelection.width),
            Math.max(1, stage.clientHeight - 140) / Math.max(1, rotatedSelection.height),
          );
          onRender(page, Math.max(25, Math.min(400, zoom * factor)));
        }
        setViewerTool("select");
        setSelectionRect(null);
      } else if (rect.width >= 0.002 && rect.height >= 0.002) {
        onMarkup(viewerTool as "highlight" | "underline" | "strikeout", rect);
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

  const beginDynamicZoom = (event: React.PointerEvent<HTMLDivElement>) => {
    if (viewerTool !== "dynamic-zoom") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dynamicZoomRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startZoom: zoom,
      previewZoom: zoom,
    };
  };

  const moveDynamicZoom = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = dynamicZoomRef.current;
    if (viewerTool !== "dynamic-zoom" || !state || state.pointerId !== event.pointerId) return;
    const nextZoom = Math.max(25, Math.min(400, state.startZoom + (state.startY - event.clientY) * 0.35));
    state.previewZoom = nextZoom;
    setDynamicScale(nextZoom / Math.max(1, zoom));
  };

  const finishDynamicZoom = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = dynamicZoomRef.current;
    if (viewerTool !== "dynamic-zoom" || !state || state.pointerId !== event.pointerId) return;
    dynamicZoomRef.current = null;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* already released */ }
    setDynamicScale(1);
    onRender(page, state.previewZoom);
  };

  const submitPageTransfer = (movePages: boolean) => {
    if (!splitDocument || !transferRange.trim()) return;
    const source = transferDirection === "secondary-to-primary" ? splitDocument : document;
    const target = transferDirection === "secondary-to-primary" ? document : splitDocument;
    onTransferPages(
      source.id,
      target.id,
      transferRange.trim(),
      Math.max(0, Math.min(target.pageCount, Math.trunc(transferInsertAfter))),
      movePages,
    );
  };

  const submitSearch = () => {
    const query = search.trim();
    if (!query) return;
    onSearch(query);
    onAdvancedSearch({
      query,
      matchCase: false,
      wholeWord: false,
      regex: false,
      includeText: true,
      includeComments: true,
      includeBookmarks: true,
      includeForms: true,
      includeAttachments: true,
      includeMetadata: true,
    });
    setAdvancedSearch(true);
    setSearchFocused(false);
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
      includeAttachments: searchScopes.attachments,
      includeMetadata: searchScopes.metadata,
    });
    setLeftPanel("search");
  };

  return (
    <div className={`workspace viewer-${viewerTool} immersive-${immersiveMode}`}>
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
        <div className="workspace-search-shell">
          <label className="workspace-search">
            <SevenIcon name="search" />
            <input
              ref={searchRef}
              value={search}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => window.setTimeout(() => setSearchFocused(false), 120)}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && submitSearch()}
              placeholder="Pesquisar texto, ferramentas, páginas e comandos"
            />
          </label>
          {searchFocused && search.trim() && (
            <div className="global-search-popover" onMouseDown={(event) => event.preventDefault()}>
              <button className="global-search-all" onClick={submitSearch}>
                <SevenIcon name="search" />
                <span><strong>Pesquisar “{search.trim()}” em todo o documento</strong><small>Texto, comentários, marcadores, campos, anexos e metadados</small></span>
              </button>
              {globalPageMatch !== null && (
                <button onClick={() => { setSearchFocused(false); onRender(globalPageMatch, zoom); }}>
                  <SevenIcon name="pages" />
                  <span><strong>Ir para página {globalPageMatch + 1}</strong><small>Navegação direta</small></span>
                </button>
              )}
              {globalCommandMatches.map((command) => (
                <button key={command} onClick={() => runGlobalCommand(command)}>
                  <SevenIcon name={command === "save" ? "save" : command === "print" ? "print" : command === "settings" ? "settings" : "pages"} />
                  <span>
                    <strong>{command === "save" ? "Salvar documento" : command === "print" ? "Imprimir" : command === "settings" ? "Preferências" : "Propriedades"}</strong>
                    <small>Comando do aplicativo</small>
                  </span>
                </button>
              ))}
              {globalToolMatches.map((tool) => (
                <button key={tool.id} disabled={!canRunTool(tool.id, capabilities)} onClick={() => { setSearchFocused(false); onTool(tool.id); }}>
                  <SevenIcon name={tool.icon} />
                  <span><strong>{tool.label}</strong><small>{tool.group} · {tool.description}</small></span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button className="icon-button" aria-label="Configurações" onClick={onSettings}><SevenIcon name="settings" /></button>
      </header>

      <nav className="workspace-menubar" aria-label="Menu principal" onClick={(event) => event.stopPropagation()}>
        <div className="app-menu-root">
          <button className={mainMenu === "file" ? "active" : ""} onClick={() => setMainMenu(mainMenu === "file" ? null : "file")}>Arquivo</button>
          {mainMenu === "file" && (
            <div className="app-menu-dropdown">
              <button onClick={() => { setMainMenu(null); onOpen(); }}><span>Abrir…</span><kbd>Ctrl+O</kbd></button>
              <button disabled={!document.dirty} onClick={() => { setMainMenu(null); onSave(); }}><span>Salvar</span><kbd>Ctrl+S</kbd></button>
              <button onClick={() => { setMainMenu(null); onSaveAs(); }}><span>Salvar como…</span><kbd>Ctrl+Shift+S</kbd></button>
              <i />
              <button disabled={!capabilities?.printing?.available} onClick={() => { setMainMenu(null); onPrint(selectionRect ?? undefined); }}><span>Imprimir…</span><kbd>Ctrl+P</kbd></button>
              <button disabled={!canCreateWindow} onClick={() => { setMainMenu(null); onOpenInNewWindow(document.id); }}><span>Abrir em nova janela</span></button>
              <i />
              <button onClick={() => { setMainMenu(null); onCloseTab(document.id); }}><span>Fechar documento</span><kbd>Ctrl+W</kbd></button>
            </div>
          )}
        </div>

        <div className="app-menu-root">
          <button className={mainMenu === "edit" ? "active" : ""} onClick={() => setMainMenu(mainMenu === "edit" ? null : "edit")}>Editar</button>
          {mainMenu === "edit" && (
            <div className="app-menu-dropdown">
              <button disabled={!document.canUndo} onClick={() => { setMainMenu(null); onUndo(); }}><span>Desfazer</span><kbd>Ctrl+Z</kbd></button>
              <button disabled={!document.canRedo} onClick={() => { setMainMenu(null); onRedo(); }}><span>Refazer</span><kbd>Ctrl+Y</kbd></button>
              <i />
              <button onClick={() => { setMainMenu(null); onTool("edit"); }}><span>Editar PDF</span></button>
              <button onClick={() => { setMainMenu(null); onTool("comment"); }}><span>Comentários e marcações</span></button>
              <button onClick={() => { setMainMenu(null); onTool("forms"); }}><span>Preparar formulário</span></button>
              <button onClick={() => { setMainMenu(null); onTool("fill-sign"); }}><span>Preencher e assinar</span></button>
            </div>
          )}
        </div>

        <div className="app-menu-root">
          <button className={mainMenu === "view" ? "active" : ""} onClick={() => setMainMenu(mainMenu === "view" ? null : "view")}>Exibir</button>
          {mainMenu === "view" && (
            <div className="app-menu-dropdown app-menu-dropdown--wide">
              <button onClick={() => { setMainMenu(null); fitView("page"); }}><span>Ajustar página</span></button>
              <button onClick={() => { setMainMenu(null); fitView("width"); }}><span>Ajustar largura</span></button>
              <button onClick={() => { setMainMenu(null); fitView("actual"); }}><span>Tamanho real</span><kbd>Ctrl+0</kbd></button>
              <i />
              <button className={viewMode === "single" ? "checked" : ""} onClick={() => { setMainMenu(null); onViewModeChange("single"); }}><span>Página única</span></button>
              <button className={viewMode === "continuous" ? "checked" : ""} onClick={() => { setMainMenu(null); onViewModeChange("continuous"); }}><span>Rolagem contínua</span></button>
              <button className={viewMode === "facing" ? "checked" : ""} onClick={() => { setMainMenu(null); onViewModeChange("facing"); }}><span>Duas páginas</span></button>
              <button className={viewMode === "facing-continuous" ? "checked" : ""} onClick={() => { setMainMenu(null); onViewModeChange("facing-continuous"); }}><span>Duas páginas contínuas</span></button>
              <i />
              <button onClick={() => { setMainMenu(null); toggleReading(); }}><span>{immersiveMode === "reading" ? "Sair do modo leitura" : "Modo leitura"}</span></button>
              <button onClick={() => { setMainMenu(null); void togglePresentation(); }}><span>{immersiveMode === "presentation" ? "Sair da apresentação" : "Apresentação"}</span></button>
              <button onClick={() => { setMainMenu(null); void toggleFullscreen(); }}><span>Tela cheia</span></button>
            </div>
          )}
        </div>

        <button className="app-menu-direct" onClick={onSettings}>Preferências</button>
        <button className="app-menu-direct" onClick={() => onTool("properties")}>Propriedades</button>

        <div className="app-menu-root">
          <button className={mainMenu === "help" ? "active" : ""} onClick={() => setMainMenu(mainMenu === "help" ? null : "help")}>Ajuda</button>
          {mainMenu === "help" && (
            <div className="app-menu-dropdown app-menu-dropdown--right">
              <button onClick={() => { setMainMenu(null); onHelp(); }}><span>Documentação do Seven Reader</span><kbd>F1</kbd></button>
              <button onClick={() => { setMainMenu(null); onTool("accessibility"); }}><span>Verificação de acessibilidade</span></button>
            </div>
          )}
        </div>
      </nav>

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
          onClick={() => onPrint(selectionRect ?? undefined)}
        ><SevenIcon name="print" /><span>Imprimir</span></button>
      </nav>

      <div className="workspace-body">
        {externalFileStatus?.changed && (
          <div className={externalFileStatus.exists ? "external-change-banner" : "external-change-banner danger"}>
            <SevenIcon name={externalFileStatus.exists ? "history" : "shield"} />
            <div>
              <strong>{externalFileStatus.exists ? "Arquivo alterado fora do Seven Reader" : "Arquivo original não está mais no disco"}</strong>
              <span>
                {document.dirty
                  ? "Há alterações locais não salvas. Use Salvar como para preservar esta versão antes de recarregar."
                  : externalFileStatus.exists
                    ? "Recarregue para visualizar a versão atual do disco antes de continuar editando."
                    : "O arquivo pode ter sido movido, renomeado ou excluído."}
              </span>
            </div>
            {externalFileStatus.exists && (
              <button disabled={document.dirty} onClick={onReloadExternal}>Recarregar do disco</button>
            )}
          </div>
        )}
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

                {!advancedSearch && (
                  <div className="search-occurrence-nav">
                    <button
                      disabled={!searchOccurrences.length}
                      onClick={() => onSelectSearchOccurrence(searchOccurrenceIndex <= 0 ? searchOccurrences.length - 1 : searchOccurrenceIndex - 1)}
                      aria-label="Ocorrência anterior"
                    ><SevenIcon name="chevronLeft" /></button>
                    <strong>{searchOccurrences.length ? `${searchOccurrenceIndex + 1} de ${searchOccurrences.length}` : "0 resultados"}</strong>
                    <button
                      disabled={!searchOccurrences.length}
                      onClick={() => onSelectSearchOccurrence(searchOccurrenceIndex + 1 >= searchOccurrences.length ? 0 : searchOccurrenceIndex + 1)}
                      aria-label="Próxima ocorrência"
                    ><SevenIcon name="chevronRight" /></button>
                  </div>
                )}

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
                        ["attachments", "Anexos textuais"],
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
                    <button key={hit.pageIndex} className="search-hit" onClick={() => {
                      const index = searchOccurrences.findIndex((occurrence) => occurrence.pageIndex === hit.pageIndex);
                      if (index >= 0) onSelectSearchOccurrence(index);
                      else onRender(hit.pageIndex, zoom);
                    }}>
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
                    <div className="panel-task-actions">
                      <b>{job.progress !== undefined ? `${Math.round(job.progress * 100)}%` : job.state}</b>
                      {(job.state === "queued" || job.state === "running" || job.state === "paused") && (
                        <span>
                          {job.state === "paused"
                            ? <button onClick={() => onResumeJob(job.id)} title="Retomar"><SevenIcon name="play" /></button>
                            : <button onClick={() => onPauseJob(job.id)} title="Pausar"><SevenIcon name="pause" /></button>}
                          <button onClick={() => onCancelJob(job.id)} title="Cancelar"><SevenIcon name="close" /></button>
                        </span>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </aside>
        )}

        <main className={splitDocument ? `document-stage split-view split-view--${splitOrientation}` : "document-stage"} ref={stageRef}>
          <div
            className={`document-canvas document-canvas--${viewMode}`}
            ref={canvasRef}
            onScroll={handleStageScroll}
            onPointerDown={beginPan}
            onPointerMove={movePan}
            onPointerUp={finishPan}
            onPointerCancel={finishPan}
          >
            {reflowEnabled ? (
              <article className="reflow-view">
                <header><span>Página {page + 1}</span><strong>Reflow de texto</strong></header>
                {reflowLoading ? (
                  <div className="report-loading"><span className="loader-ring" /> Extraindo camada textual…</div>
                ) : reflowText ? (
                  <div className="reflow-text">{reflowText}</div>
                ) : (
                  <div className="empty-panel">Esta página não possui camada textual suficiente para reflow. Use OCR quando o documento for digitalizado.</div>
                )}
              </article>
            ) : (renderedPages.length || rendered) ? (
              (renderedPages.length ? renderedPages : rendered ? [rendered] : []).map((result) => {
                const active = result.pageIndex === page;
                if (!active) {
                  return (
                    <div
                      className="page-rotation-shell"
                      style={rotatedDimensions(result)}
                      data-page-index={result.pageIndex}
                      key={result.pageIndex}
                      onDoubleClick={() => onRender(result.pageIndex, zoom)}
                    >
                      <div
                        className="rendered-page rendered-page--passive"
                        style={{
                          width: result.width,
                          transform: `translate(-50%,-50%) rotate(${visualRotation}deg)`,
                        }}
                      >
                        <img src={nativeAssetUrl(result.cachePath)} alt={`Página ${result.pageIndex + 1}`} draggable={false} />
                        <span className="page-corner-label">{result.pageIndex + 1}</span>
                      </div>
                    </div>
                  );
                }
                return (
                  <div
                    className="page-rotation-shell"
                    style={rotatedDimensions(result)}
                    data-page-index={result.pageIndex}
                    ref={pageRef}
                    key={result.pageIndex}
                  >
                  <div
                    className={[
                      "rendered-page",
                      "rendered-page--active",
                      viewerTool === "draw" ? "drawing-active" : "",
                      isRectSelectionTool ? "selection-active" : "",
                      viewerTool === "highlight" ? "markup-highlight" : "",
                      viewerTool === "underline" ? "markup-underline" : "",
                      viewerTool === "strikeout" ? "markup-strikeout" : "",
                    ].filter(Boolean).join(" ")}
                    style={{
                      width: result.width,
                      transform: `translate(-50%,-50%) rotate(${visualRotation}deg) scale(${dynamicScale})`,
                    }}
                    onPointerDown={(event) => {
                      addMeasurementPoint(event);
                      beginDynamicZoom(event);
                      beginInk(event);
                      beginSelection(event);
                    }}
                    onPointerMove={(event) => {
                      updateCursorPoint(event);
                      moveDynamicZoom(event);
                      moveInk(event);
                      moveSelection(event);
                    }}
                    onPointerLeave={() => { setCursorPoint(null); setLoupePoint(null); }}
                    onPointerUp={(event) => {
                      finishDynamicZoom(event);
                      finishInk(event);
                      finishSelection(event);
                    }}
                    onPointerCancel={(event) => {
                      finishDynamicZoom(event);
                      finishInk(event);
                      finishSelection(event);
                    }}
                  >
                    <img src={nativeAssetUrl(result.cachePath)} alt={`Página ${result.pageIndex + 1}`} draggable={false} />
                    {currentPageSearchHighlights.length > 0 && (
                      <div className="search-highlight-layer" aria-hidden="true">
                        {currentPageSearchHighlights.flatMap(({ occurrence, index }) =>
                          occurrence.rects.map((rect, rectIndex) => (
                            <span
                              key={`${index}-${rectIndex}`}
                              className={index === searchOccurrenceIndex ? "search-highlight current" : "search-highlight"}
                              style={{
                                left: `${rect.x * 100}%`,
                                top: `${rect.y * 100}%`,
                                width: `${rect.width * 100}%`,
                                height: `${rect.height * 100}%`,
                              }}
                            />
                          )),
                        )}
                      </div>
                    )}
                    {showGrid && pageGeometry && (
                      <div
                        className="page-grid-overlay"
                        style={{
                          backgroundSize: `${(gridStepPt / pageGeometry.widthPt) * 100}% ${(gridStepPt / pageGeometry.heightPt) * 100}%`,
                        }}
                        aria-hidden="true"
                      />
                    )}
                    {pageGeometry && guides.map((guide) => (
                      <div
                        key={guide.id}
                        className={guide.axis === "x" ? "page-guide page-guide--vertical" : "page-guide page-guide--horizontal"}
                        style={guide.axis === "x"
                          ? { left: `${(guide.valuePt / pageGeometry.widthPt) * 100}%` }
                          : { top: `${(guide.valuePt / pageGeometry.heightPt) * 100}%` }}
                        title={formatMeasure(guide.valuePt)}
                      />
                    ))}
                    {showRulers && pageGeometry && (
                      <>
                        <div className="page-ruler page-ruler--horizontal">
                          {Array.from({ length: 11 }, (_, index) => (
                            <span key={index} style={{ left: `${index * 10}%` }}>{formatMeasure(pageGeometry.widthPt * index / 10).replace(` ${rulerUnit}`, "")}</span>
                          ))}
                        </div>
                        <div className="page-ruler page-ruler--vertical">
                          {Array.from({ length: 11 }, (_, index) => (
                            <span key={index} style={{ top: `${index * 10}%` }}>{formatMeasure(pageGeometry.heightPt * index / 10).replace(` ${rulerUnit}`, "")}</span>
                          ))}
                        </div>
                      </>
                    )}
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
                      <div className="selection-actions" onPointerDown={(event) => event.stopPropagation()} onPointerUp={(event) => event.stopPropagation()}>
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
                    {viewerTool === "measure" && (measurementPoints.length > 0 || calibrationPoints.length > 0) && (
                      <svg className="measurement-preview" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
                        {(() => {
                          const points = calibrating ? calibrationPoints : measurementPoints;
                          const path = points.map(([x, y]) => `${(x * 1000).toFixed(2)},${(y * 1000).toFixed(2)}`).join(" ");
                          return measurementKind === "area" && !calibrating
                            ? <polygon points={path} fill="currentColor" fillOpacity="0.14" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                            : <polyline points={path} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />;
                        })()}
                        {(calibrating ? calibrationPoints : measurementPoints).map(([x, y], index) => (
                          <circle key={index} cx={x * 1000} cy={y * 1000} r="5" fill="currentColor" vectorEffect="non-scaling-stroke" />
                        ))}
                      </svg>
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
                    {loupeEnabled && loupePoint && (
                      <div
                        className="page-loupe"
                        style={{
                          left: `${loupePoint[0] * 100}%`,
                          top: `${loupePoint[1] * 100}%`,
                          backgroundImage: `url("${nativeAssetUrl(result.cachePath)}")`,
                          backgroundSize: "300% 300%",
                          backgroundPosition: `${loupePoint[0] * 100}% ${loupePoint[1] * 100}%`,
                        }}
                        aria-hidden="true"
                      />
                    )}
                    <span className="page-corner-label">{result.pageIndex + 1}</span>
                  </div>
                  </div>
                );
              })
            ) : (
              <div className="loading-page"><span className="loader-ring" /><strong>Renderizando página…</strong></div>
            )}
          </div>

          {splitDocument && splitRendered && (
            <section className="secondary-document-pane">
              <header className="secondary-pane-header">
                <div>
                  <span className="tab-file-icon">PDF</span>
                  <strong title={splitDocument.path}>{splitDocument.name}</strong>
                </div>
                <div className="secondary-pane-actions">
                  <button
                    className={splitOrientation === "vertical" ? "active" : ""}
                    onClick={() => onSplitOrientationChange("vertical")}
                    title="Divisão vertical"
                  >V</button>
                  <button
                    className={splitOrientation === "horizontal" ? "active" : ""}
                    onClick={() => onSplitOrientationChange("horizontal")}
                    title="Divisão horizontal"
                  >H</button>
                  <button onClick={onCloseSideBySide} title="Fechar painel lado a lado"><SevenIcon name="close" /></button>
                </div>
              </header>
              <div className="page-transfer-bar">
                <select value={transferDirection} onChange={(event) => setTransferDirection(event.target.value as typeof transferDirection)}>
                  <option value="secondary-to-primary">{splitDocument.name} → {document.name}</option>
                  <option value="primary-to-secondary">{document.name} → {splitDocument.name}</option>
                </select>
                <label>
                  <span>Páginas</span>
                  <input value={transferRange} onChange={(event) => setTransferRange(event.target.value)} placeholder="1-3,5" />
                </label>
                <label>
                  <span>Inserir depois</span>
                  <input
                    type="number"
                    min={0}
                    max={transferDirection === "secondary-to-primary" ? document.pageCount : splitDocument.pageCount}
                    value={transferInsertAfter}
                    onChange={(event) => setTransferInsertAfter(Math.max(0, Number(event.target.value) || 0))}
                  />
                </label>
                <button disabled={!transferRange.trim()} onClick={() => submitPageTransfer(false)}>Copiar</button>
                <button className="move-pages-button" disabled={!transferRange.trim()} onClick={() => submitPageTransfer(true)}>Mover</button>
              </div>
              <div className="secondary-pane-canvas">
                <div className="rendered-page secondary-rendered-page" style={{ width: splitRendered.width }}>
                  <img src={nativeAssetUrl(splitRendered.cachePath)} alt={`Página ${splitPage + 1} de ${splitDocument.name}`} draggable={false} />
                  <span className="page-corner-label">{splitPage + 1}</span>
                </div>
              </div>
              <footer className="secondary-pane-controls">
                <button disabled={splitPage === 0} onClick={() => onSplitRender(splitPage - 1, splitZoom)}><SevenIcon name="chevronLeft" /></button>
                <span>{splitPage + 1} / {splitDocument.pageCount}</span>
                <button disabled={splitPage >= splitDocument.pageCount - 1} onClick={() => onSplitRender(splitPage + 1, splitZoom)}><SevenIcon name="chevronRight" /></button>
                <i />
                <button onClick={() => onSplitRender(splitPage, Math.max(25, splitZoom - 10))}><SevenIcon name="zoomOut" /></button>
                <span>{Math.round(splitZoom)}%</span>
                <button onClick={() => onSplitRender(splitPage, Math.min(400, splitZoom + 10))}><SevenIcon name="zoomIn" /></button>
              </footer>
            </section>
          )}

          {measurementOpen && (
            <aside className="measurement-panel" onPointerDown={(event) => event.stopPropagation()}>
              <header>
                <div><span className="eyebrow">MEDIÇÃO</span><strong>Escala da página {page + 1}</strong></div>
                <button onClick={() => { setMeasurementOpen(false); setViewerTool("select"); setMeasurementPoints([]); setCalibrationPoints([]); }}><SevenIcon name="close" /></button>
              </header>

              <div className="measurement-kind-tabs">
                {(["distance", "perimeter", "area"] as const).map((kind) => (
                  <button key={kind} className={measurementKind === kind ? "active" : ""} onClick={() => { setMeasurementKind(kind); setMeasurementPoints([]); }}>
                    {kind === "distance" ? "Distância" : kind === "perimeter" ? "Perímetro" : "Área"}
                  </button>
                ))}
              </div>

              <div className="measurement-scale-row">
                <label><span>Unidade</span><select value={measurementUnit} onChange={(event) => changeMeasurementUnit(event.target.value)}><option value="mm">mm</option><option value="cm">cm</option><option value="m">m</option><option value="in">in</option><option value="ft">ft</option><option value="pt">pt</option></select></label>
                <label><span>pt / unidade</span><input type="number" min={0.000001} step="any" value={Number(pointsPerUnit.toFixed(6))} onChange={(event) => persistMeasurementScale(measurementUnit, Math.max(0.000001, Number(event.target.value) || 1))} /></label>
              </div>

              <section className="measurement-calibration">
                <button className={calibrating ? "active" : ""} onClick={() => { setCalibrating(!calibrating); setCalibrationPoints([]); setMeasurementPoints([]); }}>
                  {calibrating ? "Calibrando…" : "Calibrar escala"}
                </button>
                <label><span>Distância conhecida</span><input type="number" min={0.000001} step="any" value={calibrationKnown} onChange={(event) => setCalibrationKnown(Math.max(0.000001, Number(event.target.value) || 1))} /></label>
                <button disabled={calibrationPoints.length !== 2} onClick={applyCalibration}>Aplicar</button>
                <small>{calibrating ? `Clique em 2 pontos na página · ${calibrationPoints.length}/2` : `1 ${measurementUnit} = ${pointsPerUnit.toFixed(4)} pt`}</small>
              </section>

              {!calibrating && (
                <>
                  <div className="measurement-result">
                    <strong>{currentMeasurementValue.toFixed(3)} {measurementUnit}{measurementKind === "area" ? "²" : ""}</strong>
                    <small>{measurementPoints.length} ponto(s) · {snapGrid ? "snap ativo" : "snap livre"}</small>
                  </div>
                  <div className="two-column-fields">
                    <label className="workflow-field"><span>Label</span><input value={measurementLabel} onChange={(event) => setMeasurementLabel(event.target.value)} placeholder="Opcional" /></label>
                    <label className="workflow-field"><span>Autor</span><input value={measurementAuthor} onChange={(event) => setMeasurementAuthor(event.target.value)} /></label>
                  </div>
                  <label className="workflow-field"><span>Comentário</span><textarea rows={2} value={measurementComment} onChange={(event) => setMeasurementComment(event.target.value)} /></label>
                  <label className="workflow-field"><span>Espessura</span><input type="range" min={0.5} max={8} step={0.5} value={measurementLineWidth} onChange={(event) => setMeasurementLineWidth(Number(event.target.value))} /><small>{measurementLineWidth.toFixed(1)} pt</small></label>
                  <div className="measurement-actions">
                    <button disabled={!measurementPoints.length} onClick={() => setMeasurementPoints((current) => current.slice(0, -1))}>Desfazer ponto</button>
                    <button disabled={!measurementPoints.length} onClick={() => setMeasurementPoints([])}>Limpar</button>
                    <button className="primary-button" disabled={measurementPoints.length < (measurementKind === "distance" ? 2 : 3)} onClick={finishMeasurement}>Gravar medição</button>
                  </div>
                </>
              )}

              <footer>
                <span>{measurements.length} medição(ões) no documento</span>
                <button onClick={onReloadMeasurements}>Atualizar</button>
                <button disabled={!measurements.length} onClick={() => void exportMeasurementCsv()}>Exportar CSV</button>
              </footer>
            </aside>
          )}

          <div className="measurement-toolbar">
            <button className={measurementOpen ? "active" : ""} onClick={() => { setMeasurementOpen((value) => !value); setViewerTool(measurementOpen ? "select" : "measure"); setMeasurementPoints([]); setCalibrationPoints([]); if (!measurementOpen) onReloadMeasurements(); }}>Medir</button>
            <button className={showRulers ? "active" : ""} onClick={() => setShowRulers((value) => !value)}>Réguas</button>
            <button className={showGrid ? "active" : ""} onClick={() => setShowGrid((value) => !value)}>Grade</button>
            <button className={snapGrid ? "active" : ""} disabled={!showGrid} onClick={() => setSnapGrid((value) => !value)}>Snap</button>
            <label>Passo <input type="number" min={1} max={288} step={1} value={gridStepPt} onChange={(event) => setGridStepPt(Math.max(1, Math.min(288, Number(event.target.value) || 18)))} /> pt</label>
            <button disabled={!pageGeometry} onClick={() => addGuide("x")}>Guia V</button>
            <button disabled={!pageGeometry} onClick={() => addGuide("y")}>Guia H</button>
            <button disabled={!guides.length} onClick={() => setGuides([])}>Limpar guias</button>
            <select value={rulerUnit} onChange={(event) => setRulerUnit(event.target.value as typeof rulerUnit)}>
              <option value="pt">pt</option><option value="mm">mm</option><option value="cm">cm</option><option value="in">in</option>
            </select>
            <span className="cursor-coordinate">
              {cursorPoint ? `X ${formatMeasure(cursorPoint[0])} · Y ${formatMeasure(cursorPoint[1])}` : "X — · Y —"}
            </span>
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
            <button className={viewMode === "single" ? "view-mode-button active" : "view-mode-button"} onClick={() => onViewModeChange("single")} title="Página única">1 pág.</button>
            <button className={viewMode === "continuous" ? "view-mode-button active" : "view-mode-button"} onClick={() => onViewModeChange("continuous")} title="Rolagem contínua">Cont.</button>
            <button className={viewMode === "facing" ? "view-mode-button active" : "view-mode-button"} onClick={() => onViewModeChange("facing")} title="Duas páginas">2 pág.</button>
            <button className={viewMode === "facing-continuous" ? "view-mode-button active" : "view-mode-button"} onClick={() => onViewModeChange("facing-continuous")} title="Duas páginas contínuas">2 cont.</button>
            <i />
            <button className={viewerTool === "zoom-area" ? "view-mode-button active" : "view-mode-button"} onClick={() => setViewerTool(viewerTool === "zoom-area" ? "select" : "zoom-area")} title="Zoom por seleção">Área</button>
            <button className={viewerTool === "dynamic-zoom" ? "view-mode-button active" : "view-mode-button"} onClick={() => setViewerTool(viewerTool === "dynamic-zoom" ? "select" : "dynamic-zoom")} title="Zoom dinâmico">Din.</button>
            <button className={loupeEnabled ? "view-mode-button active" : "view-mode-button"} onClick={() => setLoupeEnabled((value) => !value)} title="Lupa">Lupa</button>
            <button className={reflowEnabled ? "view-mode-button active" : "view-mode-button"} onClick={() => setReflowEnabled((value) => !value)} title="Reflow da camada textual">Reflow</button>
            <i />
            <button className="view-mode-button" onClick={() => rotateView(-1)} title="Girar visualização 90° à esquerda">↶</button>
            <button className="view-mode-button" onClick={() => rotateView(1)} title="Girar visualização 90° à direita">↷</button>
            <button className={immersiveMode === "reading" ? "view-mode-button active" : "view-mode-button"} onClick={toggleReading} title="Modo leitura">Ler</button>
            <button className={immersiveMode === "presentation" ? "view-mode-button active" : "view-mode-button"} onClick={() => void togglePresentation()} title="Modo apresentação">Apres.</button>
            <button className="view-mode-button" onClick={() => void toggleFullscreen()} title="Tela cheia">Full</button>
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
            <div className="tab-context-divider" />
            <button disabled={!canCreateWindow} onClick={() => { onOpenInNewWindow(tabMenu.id); setTabMenu(null); }}>Abrir em nova janela</button>
            <button disabled={!canCreateWindow} onClick={() => { onMoveToNewWindow(tabMenu.id); setTabMenu(null); }}>Mover para nova janela</button>
            <button disabled={tabMenu.id === document.id} onClick={() => { onOpenSideBySide(tabMenu.id); setTabMenu(null); }}>Abrir lado a lado</button>
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
