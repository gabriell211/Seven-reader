import { useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow, WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { message, open, save } from "@tauri-apps/plugin-dialog";
import { SplashScreen } from "./components/SplashScreen";
import { Home } from "./components/Home";
import { DocumentWorkspace } from "./components/DocumentWorkspace";
import { PageOrganizerDialog, type PageOperationRequest } from "./components/PageOrganizerDialog";
import { CreatePdfDialog, type BlankPageSize } from "./components/CreatePdfDialog";
import { ConversionDialog } from "./components/ConversionDialog";
import { SecurityDialog } from "./components/SecurityDialog";
import { PropertiesDialog } from "./components/PropertiesDialog";
import { ReportDialog } from "./components/ReportDialog";
import { OcrDialog } from "./components/OcrDialog";
import { CommentsDialog } from "./components/CommentsDialog";
import { FormsDialog } from "./components/FormsDialog";
import { SignatureDialog } from "./components/SignatureDialog";
import { EditingDialog } from "./components/EditingDialog";
import { RedactionDialog } from "./components/RedactionDialog";
import { AdvancedPdfDialog } from "./components/AdvancedPdfDialog";
import { SettingsDialog } from "./components/SettingsDialog";
import { UnsavedChangesDialog } from "./components/UnsavedChangesDialog";
import { ActionsDialog } from "./components/ActionsDialog";
import { PrintProductionDialog } from "./components/PrintProductionDialog";
import { CatalogDialog } from "./components/CatalogDialog";
import { GuidedActionsDialog, type GuidedActionKind } from "./components/GuidedActionsDialog";
import { SharedReviewDialog } from "./components/SharedReviewDialog";
import { OptimizeDialog } from "./components/OptimizeDialog";
import { applyAppearance, isTrustedPath, loadSettings, saveSettings, type SevenSettings } from "./lib/settings";
import {
  buildCatalog,
  listCatalogs,
  searchCatalog,
  deleteCatalog,
  exportReviewXfdf,
  sessionImportReviewXfdf,
  addAnnotation,
  addInkAnnotation,
  cancelJob,
  closeDocument,
  compareDocuments,
  createPdfFromImages,
  createPdfFromClipboardImage,
  createPdfFromText,
  createBlankDocument,
  getAccessibilityReport,
  getCapabilities,
  getExternalFileStatus,
  reloadDocumentFromSource,
  getOptimizationAudit,
  getDocumentMetadata,
  getPrintPreflight,
  inspectAdvancedPdf,
  isNativeDesktop,
  listPdfFilesInFolder,
  listAnnotations,
  listFormFields,
  listPdfActions,
  extractPdfAttachment,
  openDocument,
  printDocument,
  renderPage,
  renderPages,
  restoreDocumentSession,
  revealInFileManager,
  deleteAnnotation,
  findRedactionMatches,
  applyRedactions,
  reviewOcrPage,
  sanitizeDocument,
  scanPageToPdf,
  saveCopy,
  saveDocument,
  undoDocument,
  redoDocument,
  sessionAddAnnotation,
  sessionDeleteAnnotation,
  sessionAddInk,
  sessionAddMarkup,
  sessionEditAddText,
  sessionEditReplaceText,
  listPageImageObjects,
  sessionReplaceImageObject,
  sessionRemoveImageObject,
  sessionEditAddImage,
  listPdfNamedDestinations,
  sessionUpsertPdfNamedDestination,
  sessionRemovePdfNamedDestination,
  listPdfLinks,
  sessionEditUpdateLink,
  sessionEditRemoveLink,
  sessionEditAddLink,
  listManagedPdfElements,
  sessionEditUpdateOverlayText,
  sessionEditUpdateBackground,
  sessionEditRemoveManagedElement,
  sessionSetPageLabels,
  sessionEditOverlayText,
  sessionEditSetBackground,
  sessionFillFormFields,
  sessionCreateFormField,
  listFormFieldActions,
  sessionSetFormFieldAction,
  sessionDeleteFormFieldAction,
  sessionDuplicateFormField,
  sessionSetPageTabOrder,
  sessionTransferPages,
  exportFormData,
  sessionImportFormData,
  sessionResetForm,
  sessionUpdateFormField,
  sessionDeleteFormField,
  sessionUpdatePdfBookmark,
  sessionSetAllPdfBookmarksOpen,
  sessionGeneratePdfBookmarksFromStructure,
  sessionAddPdfBookmark,
  sessionRenamePdfBookmark,
  sessionDeletePdfBookmark,
  sessionMovePdfBookmark,
  sessionSetPdfBookmarkOpen,
  sessionAddPdfAttachment,
  sessionAddPdfPortfolioItem,
  sessionConfigurePdfPortfolio,
  sessionSetPdfPortfolioView,
  sessionCreatePdfPortfolioFolder,
  sessionMovePdfPortfolioItem,
  sessionRenamePdfPortfolioFolder,
  sessionRemovePdfPortfolioFolder,
  sessionUpdatePdfAttachment,
  sessionRemovePdfAttachment,
  sessionApplyPdfLayerOverrides,
  sessionResetPdfLayerVisibility,
  sessionUpdatePdfLayerProperties,
  sessionSetPdfLayerVisibility,
  sessionImportImageAsPdfLayer,
  sessionReorderPdfLayer,
  sessionMergePdfLayers,
  sessionFlattenPdfLayers,
  sessionUpdateDocumentMetadata,
  sessionSetPageGeometry,
  sessionSetPageBoxes,
  searchDocument,
  searchDocumentAdvanced,
  startCombine,
  startConvertToPdf,
  startBatchConvertToPdf,
  startBatchOcr,
  startDecryptPdf,
  startEncryptPdf,
  startExportPdf,
  startExtractPages,
  startReorderPages,
  startRotatePages,
  startSplitPages,
  startWebToPdf,
  startDeletePages,
  startInsertBlankPages,
  startInsertImagePages,
  startInsertTextPages,
  startInsertClipboardImagePages,
  startInsertWebPages,
  startInsertScannedPage,
  startInsertPages,
  startReplacePages,
  signDocument,
  validateSignatures,
  startOcr,
  startOcrAdvanced,
  startOptimizeAdvanced,
  startBatchOptimize,
} from "./lib/native";
import { canRunTool } from "./data/tools";
import type {
  AccessibilityReport,
  AdvancedPdfReport,
  AdvancedSearchHit,
  AdvancedSearchOptions,
  AnnotationInfo,
  BackgroundOptions,
  AnnotationInput,
  Capabilities,
  CatalogHit,
  CatalogSummary,
  CompareReport,
  DocumentMetadata,
  DuplicateFieldRequest,
  DocumentSummary,
  ExternalFileStatus,
  FormFieldInfo,
  FieldActionInfo,
  FieldActionInput,
  FormFieldUpdate,
  FormValue,
  ImagePlacement,
  ImageObjectInfo,
  InkAnnotationInput,
  JobStatus,
  LinkPlacement,
  LinkInfo,
  LinkUpdate,
  ManagedElementInfo,
  PageLabelOptions,
  NamedDestinationInfo,
  NewFormField,
  OcrOptions,
  OcrWord,
  OptimizationAudit,
  OptimizeOptions,
  OverlayTextOptions,
  PdfActionInfo,
  PrintPreflightReport,
  PageBoxUpdate,
  PageGeometryUpdate,
  RecentDocument,
  RedactionArea,
  ReviewTransferReport,
  RenderResult,
  SanitizeOptions,
  SearchHit,
  SignRequest,
  SignatureValidationReport,
  TextPlacement,
  ToolId,
  ViewMode,
} from "./types";

const RECENTS_KEY = "seven-reader:recents:v1";
const TASKS_KEY = "seven-reader:tasks:v1";
const RECENT_TOOLS_KEY = "seven-reader:recent-tools:v1";
const SESSION_KEY = "seven-reader:session:v1";

const emptyCapabilities: Capabilities = {
  pdf_engine: { available: false },
  qpdf: { available: false },
  ocr: { available: false },
  office: { available: false },
  ghostscript: { available: false },
  scanner: { available: false },
  printing: { available: false },
  certificates: { available: false },
  pdftotext: { available: false },
  openssl: { available: false },
  tesseract: { available: false },
  web_pdf: { available: false },
};

function errorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Ocorreu uma falha inesperada.";
}

function loadRecents(): RecentDocument[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(0, 20) : [];
  } catch {
    return [];
  }
}

function loadTaskHistory(): JobStatus[] {
  try {
    const raw = localStorage.getItem(TASKS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, 50).map((job: JobStatus) =>
      job.state === "queued" || job.state === "running"
        ? { ...job, state: "cancelled" as const, stage: "Interrompido ao encerrar a sessão" }
        : job
    );
  } catch {
    return [];
  }
}

function loadRecentTools(): ToolId[] {
  try {
    const raw = localStorage.getItem(RECENT_TOOLS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(0, 8) : [];
  } catch {
    return [];
  }
}

export default function App() {
  const native = isNativeDesktop();
  const currentWindowLabel = native ? getCurrentWebviewWindow().label : "browser";
  const windowSessionKey = `${SESSION_KEY}:${currentWindowLabel}`;
  const launchPathRef = useRef(new URLSearchParams(window.location.search).get("open"));
  const [splash, setSplash] = useState(true);
  const [leavingSplash, setLeavingSplash] = useState(false);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(native ? emptyCapabilities : null);
  const [document, setDocument] = useState<DocumentSummary | null>(null);
  const [openTabs, setOpenTabs] = useState<DocumentSummary[]>([]);
  const [tabViews, setTabViews] = useState<Record<string, { page: number; zoom: number }>>({});
  const [closedTabs, setClosedTabs] = useState<Array<{ path: string; page: number; zoom: number }>>([]);
  const [navHistories, setNavHistories] = useState<Record<string, { entries: number[]; index: number }>>({});
  const [rendered, setRendered] = useState<RenderResult | null>(null);
  const [renderedPages, setRenderedPages] = useState<RenderResult[]>([]);
  const [splitDocumentId, setSplitDocumentId] = useState<string | null>(null);
  const [splitRendered, setSplitRendered] = useState<RenderResult | null>(null);
  const [splitPage, setSplitPage] = useState(0);
  const [splitZoom, setSplitZoom] = useState(100);
  const [splitOrientation, setSplitOrientation] = useState<"vertical" | "horizontal">("vertical");
  const [viewMode, setViewMode] = useState<ViewMode>("single");
  const [page, setPage] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [recents, setRecents] = useState<RecentDocument[]>(loadRecents);
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const [advancedSearchHits, setAdvancedSearchHits] = useState<AdvancedSearchHit[]>([]);
  const [jobs, setJobs] = useState<Record<string, JobStatus>>({});
  const [taskHistory, setTaskHistory] = useState<JobStatus[]>(loadTaskHistory);
  const [recentTools, setRecentTools] = useState<ToolId[]>(loadRecentTools);
  const [notice, setNotice] = useState<string | null>(null);
  const [externalFileStatus, setExternalFileStatus] = useState<ExternalFileStatus | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [guidedActionsOpen, setGuidedActionsOpen] = useState(false);
  const [sharedReviewOpen, setSharedReviewOpen] = useState(false);
  const [reviewTransferReport, setReviewTransferReport] = useState<ReviewTransferReport | null>(null);
  const [catalogs, setCatalogs] = useState<CatalogSummary[]>([]);
  const [catalogHits, setCatalogHits] = useState<CatalogHit[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [organizerOpen, setOrganizerOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [conversionOpen, setConversionOpen] = useState(false);
  const [securityMode, setSecurityMode] = useState<"protect" | "sanitize" | null>(null);
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [reportMode, setReportMode] = useState<"compare" | "accessibility" | null>(null);
  const [metadata, setMetadata] = useState<DocumentMetadata | null>(null);
  const [accessibilityReport, setAccessibilityReport] = useState<AccessibilityReport | null>(null);
  const [compareReport, setCompareReport] = useState<CompareReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [ocrOpen, setOcrOpen] = useState(false);
  const [optimizeOpen, setOptimizeOpen] = useState(false);
  const [optimizationAudit, setOptimizationAudit] = useState<OptimizationAudit | null>(null);
  const [optimizationAuditLoading, setOptimizationAuditLoading] = useState(false);
  const [ocrSuspects, setOcrSuspects] = useState<OcrWord[]>([]);
  const [ocrReviewLoading, setOcrReviewLoading] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [annotations, setAnnotations] = useState<AnnotationInfo[]>([]);
  const [annotationsLoading, setAnnotationsLoading] = useState(false);
  const [formsOpen, setFormsOpen] = useState(false);
  const [formFields, setFormFields] = useState<FormFieldInfo[]>([]);
  const [fieldActions, setFieldActions] = useState<FieldActionInfo[]>([]);
  const [formsLoading, setFormsLoading] = useState(false);
  const [signatureTab, setSignatureTab] = useState<"electronic" | "digital" | "validate" | null>(null);
  const [signatureValidation, setSignatureValidation] = useState<SignatureValidationReport | null>(null);
  const [signatureLoading, setSignatureLoading] = useState(false);
  const [editingOpen, setEditingOpen] = useState(false);
  const [imageObjects, setImageObjects] = useState<ImageObjectInfo[]>([]);
  const [pdfLinks, setPdfLinks] = useState<LinkInfo[]>([]);
  const [namedDestinations, setNamedDestinations] = useState<NamedDestinationInfo[]>([]);
  const [managedElements, setManagedElements] = useState<ManagedElementInfo[]>([]);
  const [pdfLinksLoading, setPdfLinksLoading] = useState(false);
  const [imageObjectsLoading, setImageObjectsLoading] = useState(false);
  const [redactionOpen, setRedactionOpen] = useState(false);
  const [redactionMatches, setRedactionMatches] = useState<RedactionArea[]>([]);
  const [redactionLoading, setRedactionLoading] = useState(false);
  const [advancedTab, setAdvancedTab] = useState<"overview"|"bookmarks"|"attachments"|"layers"|"portfolio"|null>(null);
  const [advancedReport, setAdvancedReport] = useState<AdvancedPdfReport|null>(null);
  const [advancedLoading, setAdvancedLoading] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [pdfActions, setPdfActions] = useState<PdfActionInfo[]>([]);
  const [actionsLoading, setActionsLoading] = useState(false);
  const [printProductionOpen, setPrintProductionOpen] = useState(false);
  const [printPreflight, setPrintPreflight] = useState<PrintPreflightReport | null>(null);
  const [printPreflightLoading, setPrintPreflightLoading] = useState(false);
  const [settings, setSettings] = useState<SevenSettings>(loadSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [protectedView, setProtectedView] = useState(false);
  const [protectedReasons, setProtectedReasons] = useState<string[]>([]);
  const [trustedOnce, setTrustedOnce] = useState<Set<string>>(new Set());
  const [closePrompt, setClosePrompt] = useState<{
    scope: "tab" | "others" | "quit";
    ids: string[];
    dirtyIds: string[];
    keepId?: string;
  } | null>(null);
  const [closeBusy, setCloseBusy] = useState(false);
  const sessionRestoredRef = useRef(false);

  useEffect(() => {
    applyAppearance(settings.appearance);
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    let active = true;
    const boot = async () => {
      try {
        if (native) {
          const detected = await getCapabilities();
          if (active && detected) setCapabilities(detected);
        }
      } catch (error) {
        if (active) setNotice(errorMessage(error));
      } finally {
        window.setTimeout(() => {
          if (!active) return;
          setLeavingSplash(true);
          window.setTimeout(() => active && setSplash(false), 420);
        }, 900);
      }
    };
    void boot();
    return () => { active = false; };
  }, [native]);

  useEffect(() => {
    if (!native) return;
    let dispose: (() => void) | undefined;
    void listen<JobStatus>("seven://job", ({ payload }) => {
      setJobs((current) => ({ ...current, [payload.id]: payload }));
      setTaskHistory((current) => {
        const next = [payload, ...current.filter((job) => job.id !== payload.id)].slice(0, 50);
        localStorage.setItem(TASKS_KEY, JSON.stringify(next));
        return next;
      });
      if (payload.state === "completed") setNotice("Operação concluída com sucesso.");
      if (payload.state === "failed") setNotice(payload.error ?? "A operação falhou.");
      if (payload.state === "cancelled") setNotice("Operação cancelada.");
    }).then((unlisten) => { dispose = unlisten; });
    return () => dispose?.();
  }, [native]);


  useEffect(() => {
    if (!native || !document) {
      setExternalFileStatus(null);
      return;
    }
    let cancelled = false;
    let running = false;

    const check = async () => {
      if (running) return;
      running = true;
      try {
        const status = await getExternalFileStatus(document.id);
        if (!cancelled) {
          setExternalFileStatus(status);
          if (status.changed) {
            setNotice(status.exists
              ? "O arquivo foi alterado fora do Seven Reader."
              : "O arquivo original foi removido ou movido no disco.");
          }
        }
      } catch {
        // Document may be closing between timer ticks.
      } finally {
        running = false;
      }
    };

    void check();
    const timer = window.setInterval(() => void check(), 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [native, document?.id, document?.revision]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === "o") {
        event.preventDefault();
        void choosePdf();
      }
      if (modifier && event.shiftKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveAs();
      }
      if (modifier && !event.shiftKey && event.key.toLowerCase() === "s" && document) {
        event.preventDefault();
        void saveCurrent();
      }
      if (modifier && !event.shiftKey && event.key.toLowerCase() === "z" && document) {
        const target = event.target as HTMLElement | null;
        if (!target?.matches("input, textarea, [contenteditable='true']")) {
          event.preventDefault();
          void undoCurrent();
        }
      }
      if (modifier && document && (event.key.toLowerCase() === "y" || (event.shiftKey && event.key.toLowerCase() === "z"))) {
        const target = event.target as HTMLElement | null;
        if (!target?.matches("input, textarea, [contenteditable='true']")) {
          event.preventDefault();
          void redoCurrent();
        }
      }
      if (modifier && event.key.toLowerCase() === "f") {
        event.preventDefault();
        window.dispatchEvent(new Event("seven:focus-search"));
      }
      if (modifier && event.key === "Tab" && openTabs.length > 1) {
        event.preventDefault();
        const currentIndex = Math.max(0, openTabs.findIndex((tab) => tab.id === document?.id));
        const delta = event.shiftKey ? -1 : 1;
        const nextIndex = (currentIndex + delta + openTabs.length) % openTabs.length;
        void selectTab(openTabs[nextIndex]);
      }
      if (modifier && event.key.toLowerCase() === "w" && document) {
        event.preventDefault();
        void closeTab(document.id);
      }
      if (modifier && event.shiftKey && event.key.toLowerCase() === "t" && closedTabs.length) {
        event.preventDefault();
        void reopenClosedTab();
      }
      if (document && modifier && (event.key === "+" || event.key === "=")) {
        event.preventDefault();
        void render(page, Math.min(400, zoom + 10));
      }
      if (document && modifier && event.key === "-") {
        event.preventDefault();
        void render(page, Math.max(25, zoom - 10));
      }
      if (document && event.key === "PageDown") {
        event.preventDefault();
        void render(Math.min(document.pageCount - 1, page + 1), zoom);
      }
      if (document && event.key === "PageUp") {
        event.preventDefault();
        void render(Math.max(0, page - 1), zoom);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [document, page, zoom, openTabs, closedTabs]);

  useEffect(() => {
    if (!native || !openTabs.length) return;
    const session = openTabs.map((tab) => {
      const view = tabViews[tab.id] ?? (tab.id === document?.id ? { page, zoom } : { page: 0, zoom: settings.defaultZoom });
      return {
        path: tab.path,
        activePath: tab.activePath,
        dirty: tab.dirty,
        page: view.page,
        zoom: view.zoom,
      };
    });
    localStorage.setItem(windowSessionKey, JSON.stringify(session));
  }, [native, openTabs, tabViews, document?.id, page, zoom, settings.defaultZoom]);

  const activeJobs = useMemo(
    () => Object.values(jobs).filter((job) => job.state === "queued" || job.state === "running"),
    [jobs],
  );

  const splitDocument = splitDocumentId
    ? openTabs.find((tab) => tab.id === splitDocumentId) ?? null
    : null;

  const currentNavigation = document ? navHistories[document.id] : undefined;
  const canNavigateBack = Boolean(currentNavigation && currentNavigation.index > 0);
  const canNavigateForward = Boolean(
    currentNavigation && currentNavigation.index < currentNavigation.entries.length - 1,
  );

  const pagesForView = (pageCount: number, anchor: number, mode: ViewMode): number[] => {
    const bounded = Math.max(0, Math.min(pageCount - 1, anchor));
    if (mode === "single") return [bounded];
    if (mode === "facing") {
      const start = Math.floor(bounded / 2) * 2;
      return [start, start + 1].filter((pageIndex) => pageIndex < pageCount);
    }
    if (mode === "continuous") {
      const start = Math.max(0, bounded - 2);
      const end = Math.min(pageCount - 1, bounded + 3);
      return Array.from({ length: end - start + 1 }, (_, index) => start + index);
    }
    const pairStart = Math.floor(bounded / 2) * 2;
    const start = Math.max(0, pairStart - 2);
    const end = Math.min(pageCount - 1, pairStart + 3);
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  };

  const renderDocumentWindow = async (
    summary: DocumentSummary,
    anchor: number,
    nextZoom: number,
    mode: ViewMode = viewMode,
  ) => {
    const pages = pagesForView(summary.pageCount, anchor, mode);
    const baseWidth = mode === "facing" || mode === "facing-continuous" ? 980 : 1400;
    const targetWidth = Math.max(640, Math.min(6000, Math.round(baseWidth * (nextZoom / 100))));
    const results = pages.length === 1
      ? [await renderPage(summary.id, pages[0], targetWidth)]
      : await renderPages(summary.id, pages, targetWidth);
    setRenderedPages(results);
    setRendered(results.find((result) => result.pageIndex === anchor) ?? results[0] ?? null);
  };

  const rememberRecent = (summary: DocumentSummary) => {
    setRecents((current) => {
      const previous = current.find((item) => item.path === summary.path);
      const next: RecentDocument[] = [
        {
          path: summary.path,
          activePath: summary.activePath,
          name: summary.name,
          pageCount: summary.pageCount,
          lastOpenedAt: Date.now(),
          pinned: previous?.pinned ?? false,
          favorite: previous?.favorite ?? false,
        },
        ...current.filter((item) => item.path !== summary.path),
      ].slice(0, 20);
      localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
      return next;
    });
  };

  const activateDocument = async (
    summary: DocumentSummary,
    preferredView?: { page: number; zoom: number },
  ) => {
    const saved = preferredView ?? tabViews[summary.id] ?? { page: 0, zoom: settings.defaultZoom };
    const nextPage = Math.max(0, Math.min(summary.pageCount - 1, saved.page));
    const nextZoom = Math.max(25, Math.min(400, saved.zoom));
    setDocument(summary);
    setExternalFileStatus(null);
    setPage(nextPage);
    setZoom(nextZoom);
    setTabViews((current) => ({ ...current, [summary.id]: { page: nextPage, zoom: nextZoom } }));
    setNavHistories((current) => current[summary.id]
      ? current
      : { ...current, [summary.id]: { entries: [nextPage], index: 0 } });
    setSearchHits([]);
    setAdvancedSearchHits([]);
    setRendered(null);
    setRenderedPages([]);

    try {
      const security = await inspectAdvancedPdf(summary.activePath);
      const reasons = [
        security.hasJavascript && "JavaScript",
        security.hasLaunchActions && "Launch actions",
        security.hasOpenAction && "OpenAction",
        security.hasRichMedia && "Rich Media",
        security.hasThreeD && "3D",
      ].filter(Boolean) as string[];
      const trusted = trustedOnce.has(summary.path) || isTrustedPath(summary.path, settings.trustedLocations);
      setProtectedReasons(reasons);
      setProtectedView(settings.protectedView && reasons.length > 0 && !trusted);
    } catch {
      setProtectedReasons(["estrutura não pôde ser totalmente inspecionada"]);
      setProtectedView(settings.protectedView && !isTrustedPath(summary.path, settings.trustedLocations));
    }

    await renderDocumentWindow(summary, nextPage, nextZoom);
  };

  const openPath = async (path: string, preferredView?: { page: number; zoom: number }) => {
    try {
      const existing = openTabs.find((tab) => tab.path === path);
      if (existing) {
        rememberRecent(existing);
        localStorage.setItem("seven-reader:last-document", existing.path);
        await activateDocument(existing, preferredView ?? tabViews[existing.id]);
        return;
      }

      const summary = await openDocument(path);
      setOpenTabs((current) => [...current, summary]);
      if (preferredView) {
        setTabViews((current) => ({ ...current, [summary.id]: preferredView }));
      }
      rememberRecent(summary);
      localStorage.setItem("seven-reader:last-document", summary.path);
      await activateDocument(summary, preferredView);
    } catch (error) {
      const text = errorMessage(error);
      setNotice(text);
      await message(text, { title: "Seven Reader", kind: "error" });
    }
  };

  useEffect(() => {
    if (!native) return;
    let unlisten: (() => void) | undefined;
    void getCurrentWebviewWindow().onDragDropEvent((event) => {
      if (event.payload.type !== "drop") return;
      const paths = event.payload.paths.filter((path) => /\.pdf$/i.test(path));
      if (!paths.length) return;
      void (async () => {
        for (const path of paths) {
          await openPath(path);
        }
      })();
    }).then((dispose) => { unlisten = dispose; });
    return () => unlisten?.();
  }, [native, openTabs, settings.defaultZoom]);

  const restoreSession = async () => {
    if (!native) return;
    try {
      const raw = localStorage.getItem(windowSessionKey)
        ?? (currentWindowLabel === "main" ? localStorage.getItem(SESSION_KEY) : null);
      const parsed = raw ? JSON.parse(raw) : [];
      const session = Array.isArray(parsed)
        ? parsed.filter((item): item is {
            path: string;
            activePath?: string;
            dirty?: boolean;
            page: number;
            zoom: number;
          } =>
            item
            && typeof item.path === "string"
            && typeof item.page === "number"
            && typeof item.zoom === "number")
        : [];

      if (!session.length) {
        const path = localStorage.getItem("seven-reader:last-document");
        if (path) await openPath(path);
        return;
      }

      let restored = 0;
      let failed = 0;
      for (const item of session.slice(0, 20)) {
        try {
          const view = {
            page: Math.max(0, Math.trunc(item.page)),
            zoom: Math.max(25, Math.min(400, item.zoom)),
          };
          const summary =
            item.dirty && item.activePath && item.activePath !== item.path
              ? await restoreDocumentSession(item.path, item.activePath)
              : await openDocument(item.path);

          setOpenTabs((current) => current.some((tab) => tab.path === summary.path)
            ? current
            : [...current, summary]);
          setTabViews((current) => ({ ...current, [summary.id]: view }));
          rememberRecent(summary);
          localStorage.setItem("seven-reader:last-document", summary.path);
          await activateDocument(summary, view);
          restored += 1;
        } catch {
          failed += 1;
        }
      }

      if (restored) {
        setNotice(
          failed
            ? `Sessão recuperada · ${restored} documento(s); ${failed} não puderam ser restaurados.`
            : `Sessão recuperada · ${restored} documento(s).`,
        );
      } else if (failed) {
        setNotice("Nenhum documento da sessão anterior pôde ser restaurado.");
      }
    } catch (error) {
      setNotice(`Não foi possível restaurar toda a sessão: ${errorMessage(error)}`);
    }
  };

  useEffect(() => {
    if (!native || splash || sessionRestoredRef.current) return;
    const launchPath = launchPathRef.current;
    if (launchPath) {
      sessionRestoredRef.current = true;
      void openPath(launchPath);
      return;
    }
    if (!settings.reopenLastDocument) return;
    sessionRestoredRef.current = true;
    void restoreSession();
  }, [native, splash, settings.reopenLastDocument, currentWindowLabel]);

  const openTabInNewWindow = async (documentId: string, move: boolean) => {
    if (!native || currentWindowLabel !== "main") {
      setNotice("A criação de novas janelas fica restrita à janela principal por segurança.");
      return;
    }
    const tab = openTabs.find((item) => item.id === documentId);
    if (!tab) return;

    const label = `document-${crypto.randomUUID().replace(/-/g, "")}`;
    const child = new WebviewWindow(label, {
      url: `/?open=${encodeURIComponent(tab.path)}`,
      title: `Seven Reader — ${tab.name}`,
      width: 1280,
      height: 860,
      minWidth: 900,
      minHeight: 620,
      center: true,
      resizable: true,
    });

    child.once("tauri://created", () => {
      setNotice(move ? "Documento movido para uma nova janela." : "Documento aberto em uma nova janela.");
      if (move) void closeTab(documentId);
    });
    child.once("tauri://error", (event) => {
      setNotice(`Não foi possível criar a nova janela: ${String(event.payload)}`);
    });
  };

  const choosePdf = async () => {
    if (!native) return;
    const selected = await open({
      title: "Abrir PDF",
      multiple: false,
      directory: false,
      filters: [{ name: "Documento PDF", extensions: ["pdf"] }],
    });
    if (typeof selected === "string") await openPath(selected);
  };

  const chooseFolder = async () => {
    if (!native) return;
    const selected = await open({
      title: "Abrir pasta com PDFs",
      multiple: false,
      directory: true,
    });
    if (typeof selected !== "string") return;
    try {
      const paths = await listPdfFilesInFolder(selected, false, 500);
      if (!paths.length) {
        setNotice("Nenhum PDF encontrado nesta pasta.");
        return;
      }
      setRecents((current) => {
        const now = Date.now();
        const byPath = new Map(current.map((item) => [item.path, item]));
        paths.forEach((path, index) => {
          const normalized = path.replace(/\\/g, "/");
          const name = normalized.split("/").pop() || "Documento.pdf";
          const existing = byPath.get(path);
          byPath.set(path, {
            path,
            activePath: existing?.activePath ?? path,
            name,
            pageCount: existing?.pageCount,
            lastOpenedAt: existing?.lastOpenedAt ?? now - index,
            pinned: existing?.pinned ?? false,
            favorite: existing?.favorite ?? false,
          });
        });
        const next = [...byPath.values()]
          .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.lastOpenedAt - a.lastOpenedAt)
          .slice(0, 100);
        localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
        return next;
      });
      setNotice(`${paths.length} PDF(s) encontrados e adicionados à biblioteca local.`);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const renderSplitDocument = async (
    tab: DocumentSummary,
    nextPage: number,
    nextZoom: number,
  ) => {
    const boundedPage = Math.max(0, Math.min(tab.pageCount - 1, nextPage));
    const boundedZoom = Math.max(25, Math.min(400, nextZoom));
    const targetWidth = Math.max(520, Math.min(3600, Math.round(1050 * (boundedZoom / 100))));
    const result = await renderPage(tab.id, boundedPage, targetWidth);
    setSplitPage(boundedPage);
    setSplitZoom(boundedZoom);
    setSplitRendered(result);
  };

  const openSideBySide = async (documentId: string) => {
    if (!document || documentId === document.id) return;
    const tab = openTabs.find((item) => item.id === documentId);
    if (!tab) return;
    const view = tabViews[tab.id] ?? { page: 0, zoom: settings.defaultZoom };
    try {
      setSplitDocumentId(tab.id);
      await renderSplitDocument(tab, view.page, view.zoom);
      setNotice(`"${tab.name}" aberto lado a lado.`);
    } catch (error) {
      setSplitDocumentId(null);
      setSplitRendered(null);
      setNotice(errorMessage(error));
    }
  };

  const closeSideBySide = () => {
    setSplitDocumentId(null);
    setSplitRendered(null);
  };

  const runPageTransferBetweenOpenDocuments = async (
    sourceDocumentId: string,
    targetDocumentId: string,
    pageRange: string,
    insertAfter: number,
    movePages: boolean,
  ) => {
    try {
      const result = await sessionTransferPages(
        sourceDocumentId,
        targetDocumentId,
        pageRange,
        insertAfter,
        movePages,
      );
      setOpenTabs((current) => current.map((tab) => {
        if (tab.id === result.target.id) return result.target;
        if (result.source && tab.id === result.source.id) return result.source;
        return tab;
      }));

      const currentSummary =
        document?.id === result.target.id
          ? result.target
          : result.source && document?.id === result.source.id
            ? result.source
            : null;
      if (currentSummary) {
        const nextPage = Math.min(page, Math.max(0, currentSummary.pageCount - 1));
        setDocument(currentSummary);
        setPage(nextPage);
        await renderDocumentWindow(currentSummary, nextPage, zoom);
      }

      const splitSummary =
        splitDocumentId === result.target.id
          ? result.target
          : result.source && splitDocumentId === result.source.id
            ? result.source
            : null;
      if (splitSummary) {
        const nextPage = Math.min(splitPage, Math.max(0, splitSummary.pageCount - 1));
        await renderSplitDocument(splitSummary, nextPage, splitZoom);
      }

      setNotice(
        movePages
          ? "Páginas movidas entre os documentos. Os dois PDFs podem ser desfeitos."
          : "Páginas copiadas para o documento de destino.",
      );
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const selectTab = async (summary: DocumentSummary) => {
    if (summary.id === document?.id) return;
    try {
      if (summary.id === splitDocumentId && document) {
        const previous = document;
        const previousView = tabViews[previous.id] ?? { page, zoom };
        setSplitDocumentId(previous.id);
        await renderSplitDocument(previous, previousView.page, previousView.zoom);
      }
      localStorage.setItem("seven-reader:last-document", summary.path);
      await activateDocument(summary, tabViews[summary.id]);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const finalizeCloseTabs = async (ids: string[], keepId?: string) => {
    if (!ids.length) return;
    const closing = openTabs.filter((tab) => ids.includes(tab.id));
    if (!closing.length) return;

    const recovered = closing.map((tab) => {
      const view = tabViews[tab.id] ?? {
        page: document?.id === tab.id ? page : 0,
        zoom: document?.id === tab.id ? zoom : settings.defaultZoom,
      };
      return { path: tab.path, page: view.page, zoom: view.zoom };
    });
    setClosedTabs((current) => [...current, ...recovered].slice(-20));

    await Promise.all(closing.map(async (tab) => {
      try { await closeDocument(tab.id); } catch { /* local state cleanup still proceeds */ }
    }));

    const remaining = openTabs.filter((tab) => !ids.includes(tab.id));
    setOpenTabs(remaining);
    if (splitDocumentId && ids.includes(splitDocumentId)) {
      setSplitDocumentId(null);
      setSplitRendered(null);
    }
    if (!remaining.length) localStorage.removeItem(windowSessionKey);
    setTabViews((current) => {
      const next = { ...current };
      ids.forEach((id) => delete next[id]);
      return next;
    });
    setNavHistories((current) => {
      const next = { ...current };
      ids.forEach((id) => delete next[id]);
      return next;
    });

    if (!document || !ids.includes(document.id)) return;
    const explicit = keepId ? remaining.find((tab) => tab.id === keepId) : undefined;
    const firstIndex = Math.max(0, openTabs.findIndex((tab) => ids.includes(tab.id)));
    const fallback = explicit ?? remaining[Math.min(firstIndex, Math.max(remaining.length - 1, 0))];

    if (fallback) {
      try {
        localStorage.setItem("seven-reader:last-document", fallback.path);
        await activateDocument(fallback, tabViews[fallback.id]);
      } catch (error) {
        setNotice(errorMessage(error));
      }
    } else {
      setDocument(null);
      setRendered(null);
      setRenderedPages([]);
      setSearchHits([]);
      setAdvancedSearchHits([]);
      setProtectedView(false);
      setProtectedReasons([]);
    }
  };

  const closeTab = async (documentId: string) => {
    const closing = openTabs.find((tab) => tab.id === documentId);
    if (!closing) return;
    if (closing.dirty) {
      setClosePrompt({
        scope: "tab",
        ids: [documentId],
        dirtyIds: [documentId],
      });
      return;
    }
    await finalizeCloseTabs([documentId]);
  };

  const closeOtherTabs = async (keepId: string) => {
    const closing = openTabs.filter((tab) => tab.id !== keepId);
    if (!closing.length) return;
    const dirtyIds = closing.filter((tab) => tab.dirty).map((tab) => tab.id);
    if (dirtyIds.length) {
      setClosePrompt({
        scope: "others",
        ids: closing.map((tab) => tab.id),
        dirtyIds,
        keepId,
      });
      return;
    }
    await finalizeCloseTabs(closing.map((tab) => tab.id), keepId);
  };

  const resolveClosePrompt = async (saveChanges: boolean) => {
    const prompt = closePrompt;
    if (!prompt) return;
    setCloseBusy(true);
    try {
      if (saveChanges) {
        for (const id of prompt.dirtyIds) {
          await saveDocument(id);
        }
      }

      if (prompt.scope === "quit") {
        if (settings.reopenLastDocument && openTabs.length) {
          const cleanSession = openTabs.map((tab) => {
            const view = tabViews[tab.id] ?? {
              page: document?.id === tab.id ? page : 0,
              zoom: document?.id === tab.id ? zoom : settings.defaultZoom,
            };
            return {
              path: tab.path,
              activePath: tab.path,
              dirty: false,
              page: view.page,
              zoom: view.zoom,
            };
          });
          localStorage.setItem(windowSessionKey, JSON.stringify(cleanSession));
        } else {
          localStorage.removeItem(windowSessionKey);
        }

        for (const tab of openTabs) {
          try { await closeDocument(tab.id); } catch { /* continue cleanup */ }
        }
        setClosePrompt(null);
        await getCurrentWebviewWindow().destroy();
        return;
      }

      await finalizeCloseTabs(prompt.ids, prompt.keepId);
      setClosePrompt(null);
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setCloseBusy(false);
    }
  };

  const cancelClosePrompt = () => {
    if (closeBusy) return;
    setClosePrompt(null);
  };

  useEffect(() => {
    if (!native) return;
    let unlisten: (() => void) | undefined;
    void getCurrentWebviewWindow().onCloseRequested((event) => {
      const dirtyIds = openTabs.filter((tab) => tab.dirty).map((tab) => tab.id);
      if (!dirtyIds.length) return;
      event.preventDefault();
      setClosePrompt({
        scope: "quit",
        ids: openTabs.map((tab) => tab.id),
        dirtyIds,
      });
    }).then((dispose) => { unlisten = dispose; });
    return () => unlisten?.();
  }, [native, openTabs]);

  const reopenClosedTab = async () => {
    const closed = closedTabs.at(-1);
    if (!closed) return;
    setClosedTabs((current) => current.slice(0, -1));
    await openPath(closed.path, { page: closed.page, zoom: closed.zoom });
  };

  const reorderTabs = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    setOpenTabs((current) => {
      const from = current.findIndex((tab) => tab.id === sourceId);
      const to = current.findIndex((tab) => tab.id === targetId);
      if (from < 0 || to < 0) return current;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const closeCurrent = async () => {
    if (document) await closeTab(document.id);
  };

  const render = async (nextPage: number, nextZoom: number, recordHistory = true) => {
    if (!document) return;
    const boundedPage = Math.max(0, Math.min(document.pageCount - 1, nextPage));
    const boundedZoom = Math.max(25, Math.min(400, nextZoom));
    const previousPage = page;
    setPage(boundedPage);
    setZoom(boundedZoom);
    setTabViews((current) => ({
      ...current,
      [document.id]: { page: boundedPage, zoom: boundedZoom },
    }));

    if (recordHistory && boundedPage !== previousPage) {
      setNavHistories((current) => {
        const history = current[document.id] ?? { entries: [previousPage], index: 0 };
        const base = history.entries.slice(0, history.index + 1);
        if (base.at(-1) === boundedPage) return current;
        const entries = [...base, boundedPage].slice(-100);
        return {
          ...current,
          [document.id]: { entries, index: entries.length - 1 },
        };
      });
    }

    try {
      await renderDocumentWindow(document, boundedPage, boundedZoom);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const updateVisiblePage = async (nextPage: number) => {
    if (!document) return;
    const boundedPage = Math.max(0, Math.min(document.pageCount - 1, nextPage));
    if (boundedPage === page) return;
    setPage(boundedPage);
    setTabViews((current) => ({
      ...current,
      [document.id]: { page: boundedPage, zoom },
    }));
    const currentRender = renderedPages.find((result) => result.pageIndex === boundedPage);
    if (currentRender) setRendered(currentRender);

    if (viewMode === "continuous" || viewMode === "facing-continuous") {
      const first = renderedPages.at(0)?.pageIndex ?? boundedPage;
      const last = renderedPages.at(-1)?.pageIndex ?? boundedPage;
      const nearStart = boundedPage <= first + 1 && first > 0;
      const nearEnd = boundedPage >= last - 1 && last < document.pageCount - 1;
      if (nearStart || nearEnd || !currentRender) {
        try {
          await renderDocumentWindow(document, boundedPage, zoom);
        } catch (error) {
          setNotice(errorMessage(error));
        }
      }
    }
  };

  const changeViewMode = async (mode: ViewMode) => {
    if (!document) return;
    setViewMode(mode);
    try {
      await renderDocumentWindow(document, page, zoom, mode);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const navigateHistory = async (direction: -1 | 1) => {
    if (!document) return;
    const history = navHistories[document.id];
    if (!history) return;
    const nextIndex = history.index + direction;
    if (nextIndex < 0 || nextIndex >= history.entries.length) return;
    const nextPage = history.entries[nextIndex];
    setNavHistories((current) => ({
      ...current,
      [document.id]: { ...history, index: nextIndex },
    }));
    await render(nextPage, zoom, false);
  };

  const runSearch = async (query: string) => {
    if (!document || !query.trim()) {
      setSearchHits([]);
      return;
    }
    try {
      const hits = await searchDocument(document.id, query);
      setSearchHits(hits);
      setNotice(hits.length ? `${hits.length} página(s) com resultado.` : "Nenhum resultado encontrado.");
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runAdvancedSearch = async (options: AdvancedSearchOptions) => {
    if (!document) return;
    try {
      const hits = await searchDocumentAdvanced(document.id, options);
      setAdvancedSearchHits(hits);
      setNotice(hits.length ? `${hits.length} resultado(s) na busca avançada.` : "Nenhum resultado na busca avançada.");
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const acceptDocumentRevision = async (
    summary: DocumentSummary,
    successMessage: string,
  ) => {
    setDocument(summary);
    setOpenTabs((current) => current.map((tab) => tab.id === summary.id ? summary : tab));
    await renderDocumentWindow(summary, page, zoom);
    setNotice(successMessage);
  };

  const reloadExternalDocument = async () => {
    if (!document) return;
    if (document.dirty) {
      setNotice("Há alterações locais não salvas. Use Salvar como antes de recarregar o arquivo externo.");
      return;
    }
    try {
      const summary = await reloadDocumentFromSource(document.id);
      setDocument(summary);
      setOpenTabs((current) => current.map((tab) => tab.id === summary.id ? summary : tab));
      setExternalFileStatus(null);
      await renderDocumentWindow(summary, page, zoom);
      setNotice("Arquivo recarregado do disco.");
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const saveCurrent = async () => {
    if (!document) return;
    const wasDirty = document.dirty;
    try {
      const summary = await saveDocument(document.id);
      await acceptDocumentRevision(summary, wasDirty ? "Documento salvo no arquivo original." : "Documento já estava salvo.");
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const undoCurrent = async () => {
    if (!document) return;
    try {
      const summary = await undoDocument(document.id);
      await acceptDocumentRevision(summary, "Alteração desfeita.");
      setAnnotations(await listAnnotations(summary.activePath));
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const redoCurrent = async () => {
    if (!document) return;
    try {
      const summary = await redoDocument(document.id);
      await acceptDocumentRevision(summary, "Alteração refeita.");
      setAnnotations(await listAnnotations(summary.activePath));
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const saveAs = async () => {
    if (!document) return;
    const destination = await save({
      title: "Salvar uma cópia",
      defaultPath: document.name.replace(/\.pdf$/i, "-copia.pdf"),
      filters: [{ name: "Documento PDF", extensions: ["pdf"] }],
    });
    if (!destination) return;
    try {
      await saveCopy(document.id, destination);
      setNotice("Cópia salva e validada.");
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const pickInputPdf = async (): Promise<string | null> => {
    if (document) return document.activePath;
    const selected = await open({
      title: "Selecionar PDF",
      multiple: false,
      directory: false,
      filters: [{ name: "Documento PDF", extensions: ["pdf"] }],
    });
    return typeof selected === "string" ? selected : null;
  };

  const selectTool = async (tool: ToolId) => {
    if (!native) {
      setNotice("Esta é uma prévia visual. Processamento de PDF funciona no aplicativo desktop.");
      return;
    }
    if (protectedView) {
      const readOnlyTools: ToolId[] = ["properties","compare","accessibility","bookmarks","attachments","layers","portfolio","articles","rich-media","three-d","geospatial","certificates"];
      if (!readOnlyTools.includes(tool)) {
        setNotice("Visualização protegida: confie no arquivo antes de executar operações de escrita.");
        return;
      }
    }
    if (!canRunTool(tool, capabilities)) {
      setNotice("Esta ferramenta ainda não está habilitada porque sua implementação real não está disponível.");
      return;
    }

    setRecentTools((current) => {
      const next = [tool, ...current.filter((id) => id !== tool)].slice(0, 8);
      localStorage.setItem(RECENT_TOOLS_KEY, JSON.stringify(next));
      return next;
    });

    try {
      if (["bookmarks","attachments","layers","portfolio","articles","rich-media","three-d","geospatial"].includes(tool)) {
        if (!document) {
          setNotice("Abra um PDF para inspecionar sua estrutura.");
          return;
        }
        setAdvancedReport(null);
        setAdvancedTab(
        tool === "bookmarks" ? "bookmarks"
          : tool === "attachments" ? "attachments"
            : tool === "layers" ? "layers"
              : tool === "portfolio" ? "portfolio"
                : "overview",
      );
        return;
      }

      if (tool === "shared-review") {
        if (!document) {
          setNotice("Abra um PDF para importar ou exportar comentários.");
          return;
        }
        setReviewTransferReport(null);
        setSharedReviewOpen(true);
        return;
      }

      if (tool === "automation") {
        setGuidedActionsOpen(true);
        return;
      }

      if (tool === "catalog") {
        setCatalogHits([]);
        setCatalogOpen(true);
        return;
      }

      if (tool === "print-production") {
        if (!document) {
          setNotice("Abra um PDF para executar o preflight.");
          return;
        }
        setPrintPreflight(null);
        setPrintProductionOpen(true);
        return;
      }

      if (tool === "javascript") {
        if (!document) {
          setNotice("Abra um PDF para inspecionar JavaScript e ações.");
          return;
        }
        setPdfActions([]);
        setActionsOpen(true);
        return;
      }

      if (tool === "redact") {
        if (!document) {
          setNotice("Abra um PDF para redigir conteúdo.");
          return;
        }
        setRedactionMatches([]);
        setRedactionOpen(true);
        return;
      }

      if (tool === "edit") {
        if (!document) {
          setNotice("Abra um PDF para editar.");
          return;
        }
        setImageObjects([]);
        setPdfLinks([]);
        setNamedDestinations([]);
        setEditingOpen(true);
        return;
      }

      if (tool === "convert" || tool === "export") {
        setConversionOpen(true);
        return;
      }

      if (tool === "protect") {
        if (!document) {
          setNotice("Abra um PDF para usar Proteção.");
          return;
        }
        setSecurityMode("protect");
        return;
      }

      if (tool === "sanitize") {
        if (!document) {
          setNotice("Abra um PDF para sanitizar.");
          return;
        }
        setSecurityMode("sanitize");
        return;
      }

      if (tool === "properties") {
        if (!document) {
          setNotice("Abra um PDF para ver as propriedades.");
          return;
        }
        setMetadata(null);
        setPropertiesOpen(true);
        return;
      }

      if (tool === "compare" || tool === "accessibility") {
        if (!document) {
          setNotice("Abra um PDF primeiro.");
          return;
        }
        setCompareReport(null);
        setAccessibilityReport(null);
        setReportMode(tool);
        return;
      }

      if (tool === "fill-sign" || tool === "certificates") {
        if (!document) {
          setNotice("Abra um PDF para assinar ou validar.");
          return;
        }
        setSignatureValidation(null);
        setSignatureTab(tool === "certificates" ? "digital" : "electronic");
        return;
      }

      if (tool === "comment") {
        if (!document) {
          setNotice("Abra um PDF para comentar.");
          return;
        }
        setAnnotations([]);
        setCommentsOpen(true);
        return;
      }

      if (tool === "forms") {
        if (!document) {
          setNotice("Abra um PDF para preparar formulário.");
          return;
        }
        setFormFields([]);
        setFieldActions([]);
        setFormsOpen(true);
        return;
      }

      if (tool === "scan-ocr") {
        setOcrSuspects([]);
        setOcrOpen(true);
        return;
      }

      if (tool === "create") {
        setCreateDialogOpen(true);
        return;
      }

      if (tool === "organize") {
        setOrganizerOpen(true);
        return;
      }

      if (tool === "combine") {
        const selected = await open({
          title: "Combinar PDFs",
          multiple: true,
          directory: false,
          filters: [{ name: "Documentos PDF", extensions: ["pdf"] }],
        });
        if (!Array.isArray(selected) || selected.length < 2) {
          setNotice("Selecione pelo menos dois PDFs para combinar.");
          return;
        }
        const output = await save({
          title: "Salvar PDF combinado",
          defaultPath: "Seven-Reader-Combinado.pdf",
          filters: [{ name: "Documento PDF", extensions: ["pdf"] }],
        });
        if (!output) return;
        const started = await startCombine(selected, output);
        setNotice(`Combinação iniciada · job ${started.jobId.slice(0, 8)}`);
        return;
      }

      if (tool === "optimize") {
        if (!document) {
          setNotice("Abra um PDF para usar o Otimizador avançado.");
          return;
        }
        setOptimizationAudit(null);
        setOptimizeOpen(true);
        return;
      }
    } catch (error) {
      const text = errorMessage(error);
      setNotice(text);
      await message(text, { title: "Seven Reader", kind: "error" });
    }
  };










  const reloadOptimizationAudit = async () => {
    if (!document) return;
    try {
      setOptimizationAuditLoading(true);
      setOptimizationAudit(await getOptimizationAudit(document.activePath));
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setOptimizationAuditLoading(false);
    }
  };

  const runOptimizeAdvanced = async (output: string, options: OptimizeOptions) => {
    if (!document) return;
    try {
      const started = await startOptimizeAdvanced(document.activePath, output, options);
      setOptimizeOpen(false);
      setNotice(`Otimização avançada iniciada · job ${started.jobId.slice(0, 8)}`);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const reloadPrintPreflight = async (path = document?.activePath) => {
    if (!path) return;
    try {
      setPrintPreflightLoading(true);
      setPrintPreflight(await getPrintPreflight(path));
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setPrintPreflightLoading(false);
    }
  };

  const runSetPageBoxes = async (update: PageBoxUpdate) => {
    if (!document) return;
    try {
      const summary = await sessionSetPageBoxes(document.id, update);
      await acceptDocumentRevision(summary, "TrimBox/BleedBox atualizados na sessão.");
      await reloadPrintPreflight(summary.activePath);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const reloadPdfActions = async () => {
    if (!document) return;
    try {
      setActionsLoading(true);
      setPdfActions(await listPdfActions(document.activePath));
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setActionsLoading(false);
    }
  };

  const trustCurrentOnce = () => {
    if (!document) return;
    setTrustedOnce((current) => new Set([...current, document.path]));
    setProtectedView(false);
    setNotice("Arquivo confiável apenas nesta sessão.");
  };

  const trustCurrentLocation = () => {
    if (!document) return;
    const normalized = document.path.replace(/\\/g, "/");
    const folder = normalized.slice(0, Math.max(normalized.lastIndexOf("/"), 1));
    if (!settings.trustedLocations.includes(folder)) {
      setSettings((current) => ({ ...current, trustedLocations: [...current.trustedLocations, folder] }));
    }
    setProtectedView(false);
    setNotice("Pasta adicionada aos locais confiáveis.");
  };

  const reloadAdvanced = async () => {
    if (!document) return;
    try {
      setAdvancedLoading(true);
      setAdvancedReport(await inspectAdvancedPdf(document.activePath));
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setAdvancedLoading(false);
    }
  };

  const refreshAdvancedFrom = async (summary: DocumentSummary) => {
    setAdvancedReport(await inspectAdvancedPdf(summary.activePath));
  };

  const runAddBookmark = async (title: string, pageIndex: number) => {
    if (!document) return;
    try {
      const summary = await sessionAddPdfBookmark(document.id, { title, pageIndex });
      await acceptDocumentRevision(summary, "Marcador criado na sessão.");
      await refreshAdvancedFrom(summary);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runUpdateBookmark = async (update: BookmarkUpdate) => {
    if (!document) return;
    try {
      const summary = await sessionUpdatePdfBookmark(document.id, update);
      await acceptDocumentRevision(summary, "Marcador atualizado.");
      await refreshAdvancedFrom(summary);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runSetAllBookmarksOpen = async (open: boolean) => {
    if (!document) return;
    try {
      const summary = await sessionSetAllPdfBookmarksOpen(document.id, open);
      await acceptDocumentRevision(summary, open ? "Todos os grupos de marcadores expandidos." : "Todos os grupos de marcadores recolhidos.");
      await refreshAdvancedFrom(summary);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runGenerateBookmarksFromStructure = async () => {
    if (!document) return;
    try {
      const result = await sessionGeneratePdfBookmarksFromStructure(document.id);
      await acceptDocumentRevision(result.document, `${result.created} marcador(es) gerado(s) a partir da estrutura Tagged PDF.`);
      await refreshAdvancedFrom(result.document);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runRenameBookmark = async (objectId: string, title: string) => {
    if (!document) return;
    try {
      const summary = await sessionRenamePdfBookmark(document.id, objectId, title);
      await acceptDocumentRevision(summary, "Marcador renomeado na sessão.");
      await refreshAdvancedFrom(summary);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runDeleteBookmark = async (objectId: string) => {
    if (!document) return;
    try {
      const summary = await sessionDeletePdfBookmark(document.id, objectId);
      await acceptDocumentRevision(summary, "Marcador e sua subárvore removidos.");
      await refreshAdvancedFrom(summary);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runMoveBookmark = async (
    objectId: string,
    direction: "up" | "down" | "indent" | "outdent",
  ) => {
    if (!document) return;
    try {
      const summary = await sessionMovePdfBookmark(document.id, objectId, direction);
      await acceptDocumentRevision(summary, "Hierarquia de marcadores atualizada.");
      await refreshAdvancedFrom(summary);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runSetBookmarkOpen = async (objectId: string, open: boolean) => {
    if (!document) return;
    try {
      const summary = await sessionSetPdfBookmarkOpen(document.id, objectId, open);
      await acceptDocumentRevision(summary, open ? "Marcador expandido." : "Marcador recolhido.");
      await refreshAdvancedFrom(summary);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runAddAttachment = async (filePath: string, displayName: string, description: string) => {
    if (!document) return;
    try {
      const summary = await sessionAddPdfAttachment(document.id, filePath, displayName, description);
      await acceptDocumentRevision(summary, "Arquivo incorporado à sessão.");
      await refreshAdvancedFrom(summary);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runUpdateAttachment = async (objectId: string, name: string, description: string) => {
    if (!document) return;
    try {
      const summary = await sessionUpdatePdfAttachment(document.id, objectId, name, description);
      await acceptDocumentRevision(summary, "Anexo atualizado na sessão.");
      await refreshAdvancedFrom(summary);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runRemoveAttachment = async (objectId: string) => {
    if (!document) return;
    try {
      const summary = await sessionRemovePdfAttachment(document.id, objectId);
      await acceptDocumentRevision(summary, "Anexo removido da sessão.");
      await refreshAdvancedFrom(summary);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runExtractAttachment = async (objectId: string, destination: string) => {
    if (!document) return;
    try {
      await extractPdfAttachment(document.activePath, objectId, destination);
      setNotice("Anexo extraído.");
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runApplyLayerOverrides = async (context: "view" | "print" | "export") => {
    if (!document) return;
    try {
      const summary = await sessionApplyPdfLayerOverrides(document.id, context);
      await acceptDocumentRevision(summary, `Overrides de layer para ${context} aplicados.`);
      await refreshAdvancedFrom(summary);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runResetLayerVisibility = async () => {
    if (!document) return;
    try {
      const summary = await sessionResetPdfLayerVisibility(document.id);
      await acceptDocumentRevision(summary, "Visibilidade das layers restaurada ao BaseState.");
      await refreshAdvancedFrom(summary);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runUpdateLayerProperties = async (update: LayerPropertiesUpdate) => {
    if (!document) return;
    try {
      const summary = await sessionUpdatePdfLayerProperties(document.id, update);
      await acceptDocumentRevision(summary, "Propriedades da camada atualizadas.");
      await refreshAdvancedFrom(summary);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runAddPortfolioItem = async (
    filePath: string,
    displayName: string,
    description: string,
    folderPath: string,
  ) => {
    if (!document) return;
    try {
      const summary = await sessionAddPdfPortfolioItem(
        document.id, filePath, displayName, description, folderPath,
      );
      await acceptDocumentRevision(summary, `Componente "${displayName}" incorporado ao portfólio.`);
      await reloadAdvanced(summary.activePath);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runConfigurePortfolio = async (view: "details" | "tile" | "hidden") => {
    if (!document) return;
    try {
      const summary = await sessionConfigurePdfPortfolio(document.id, view);
      await acceptDocumentRevision(summary, "Portfólio PDF 2.0 configurado.");
      await reloadAdvanced(summary.activePath);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runSetPortfolioView = async (view: "details" | "tile" | "hidden") => {
    if (!document) return;
    try {
      const summary = await sessionSetPdfPortfolioView(document.id, view);
      await acceptDocumentRevision(summary, "Visualização inicial do portfólio atualizada.");
      await reloadAdvanced(summary.activePath);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runCreatePortfolioFolder = async (path: string, description: string) => {
    if (!document) return;
    try {
      const result = await sessionCreatePdfPortfolioFolder(document.id, path, description);
      await acceptDocumentRevision(
        result.document,
        result.changed ? `${result.changed} pasta(s) criada(s) no portfólio.` : "Pasta do portfólio atualizada.",
      );
      await reloadAdvanced(result.document.activePath);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runMovePortfolioItem = async (objectId: string, folderPath: string) => {
    if (!document) return;
    try {
      const summary = await sessionMovePdfPortfolioItem(document.id, objectId, folderPath);
      await acceptDocumentRevision(summary, "Componente movido dentro do portfólio.");
      await reloadAdvanced(summary.activePath);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runRenamePortfolioFolder = async (folderId: string, newName: string) => {
    if (!document) return;
    try {
      const summary = await sessionRenamePdfPortfolioFolder(document.id, folderId, newName);
      await acceptDocumentRevision(summary, "Pasta do portfólio renomeada.");
      await reloadAdvanced(summary.activePath);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runRemovePortfolioFolder = async (folderId: string) => {
    if (!document) return;
    try {
      const result = await sessionRemovePdfPortfolioFolder(document.id, folderId);
      await acceptDocumentRevision(
        result.document,
        `Pasta removida · ${result.changed} componente(s) incorporado(s) excluído(s).`,
      );
      await reloadAdvanced(result.document.activePath);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runImportLayer = async (
    imagePath: string,
    name: string,
    x: number,
    y: number,
    width: number,
    height: number,
    visible: boolean,
    locked: boolean,
  ) => {
    if (!document) return;
    try {
      const summary = await sessionImportImageAsPdfLayer(
        document.id, page, imagePath, name, x, y, width, height, visible, locked,
      );
      await acceptDocumentRevision(summary, `Layer "${name}" importada na página ${page + 1}.`);
      await reloadAdvanced(summary.activePath);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runReorderLayer = async (objectId: string, direction: "up" | "down") => {
    if (!document) return;
    try {
      const summary = await sessionReorderPdfLayer(document.id, objectId, direction);
      await acceptDocumentRevision(summary, "Ordem das layers atualizada.");
      await reloadAdvanced(summary.activePath);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runMergeLayers = async (sourceId: string, targetId: string) => {
    if (!document) return;
    try {
      const summary = await sessionMergePdfLayers(document.id, sourceId, targetId);
      await acceptDocumentRevision(summary, "Layers mescladas.");
      await reloadAdvanced(summary.activePath);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runFlattenLayers = async () => {
    if (!document) return;
    try {
      const result = await sessionFlattenPdfLayers(document.id);
      await acceptDocumentRevision(
        result.document,
        `Layers achatadas em ${result.changedPages} página(s), respeitando a visibilidade atual.`,
      );
      await reloadAdvanced(result.document.activePath);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runLayerVisibility = async (objectId: string, visible: boolean) => {
    if (!document) return;
    try {
      const summary = await sessionSetPdfLayerVisibility(document.id, objectId, visible);
      await acceptDocumentRevision(
        summary,
        visible ? "Layer marcada como visível na sessão." : "Layer marcada como oculta na sessão.",
      );
      await refreshAdvancedFrom(summary);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const searchRedactions = async (query: string, matchCase: boolean, wholeWord: boolean) => {
    if (!document) return;
    try {
      setRedactionLoading(true);
      setRedactionMatches(await findRedactionMatches(document.activePath, query, matchCase, wholeWord));
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setRedactionLoading(false);
    }
  };

  const runRedactions = async (output: string, areas: RedactionArea[]) => {
    if (!document) return;
    try {
      setRedactionLoading(true);
      const report = await applyRedactions(document.activePath, output, areas);
      setRedactionOpen(false);
      setNotice(`${report.areasApplied} área(s) redigida(s); ${report.objectsRemoved} objeto(s) removido(s).`);
      await openPath(output);
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setRedactionLoading(false);
    }
  };

  const runEditAddText = async (placement: TextPlacement) => {
    if (!document) return;
    try {
      const summary = await sessionEditAddText(document.id, placement);
      await acceptDocumentRevision(summary, "Texto inserido na sessão.");
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runEditReplaceText = async (find: string, replacement: string, allPages: boolean) => {
    if (!document) return;
    try {
      const result = await sessionEditReplaceText(document.id, find, replacement, allPages, page);
      await acceptDocumentRevision(
        result.document,
        `${result.report.replacements} substituição(ões) em ${result.report.pagesChanged} página(s).`,
      );
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const reloadImageObjects = async () => {
    if (!document) return;
    try {
      setImageObjectsLoading(true);
      setImageObjects(await listPageImageObjects(document.id, page));
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setImageObjectsLoading(false);
    }
  };

  const runReplaceImageObject = async (resourceName: string, imagePath: string) => {
    if (!document) return;
    try {
      const summary = await sessionReplaceImageObject(document.id, page, resourceName, imagePath);
      await acceptDocumentRevision(summary, `Imagem ${resourceName} substituída na página.`);
      await reloadImageObjects();
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runRemoveImageObject = async (resourceName: string) => {
    if (!document) return;
    try {
      const summary = await sessionRemoveImageObject(document.id, page, resourceName);
      await acceptDocumentRevision(summary, `Imagem ${resourceName} removida da página.`);
      await reloadImageObjects();
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runEditAddImage = async (placement: ImagePlacement) => {
    if (!document) return;
    try {
      const summary = await sessionEditAddImage(document.id, placement);
      await acceptDocumentRevision(summary, "Imagem inserida na sessão.");
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const reloadNamedDestinations = async () => {
    if (!document) return;
    try {
      setNamedDestinations(await listPdfNamedDestinations(document.id));
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runUpsertNamedDestination = async (
    oldName: string | undefined,
    name: string,
    pageIndex: number,
  ) => {
    if (!document) return;
    try {
      const summary = await sessionUpsertPdfNamedDestination(document.id, oldName, name, pageIndex);
      await acceptDocumentRevision(summary, `Destino nomeado "${name}" atualizado.`);
      setNamedDestinations(await listPdfNamedDestinations(document.id));
      setPdfLinks(await listPdfLinks(document.id));
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runRemoveNamedDestination = async (name: string) => {
    if (!document) return;
    try {
      const summary = await sessionRemovePdfNamedDestination(document.id, name);
      await acceptDocumentRevision(summary, `Destino nomeado "${name}" removido.`);
      setNamedDestinations(await listPdfNamedDestinations(document.id));
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const reloadPdfLinks = async () => {
    if (!document) return;
    try {
      setPdfLinksLoading(true);
      setPdfLinks(await listPdfLinks(document.id));
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setPdfLinksLoading(false);
    }
  };

  const runEditUpdateLink = async (update: LinkUpdate) => {
    if (!document) return;
    try {
      const summary = await sessionEditUpdateLink(document.id, update);
      await acceptDocumentRevision(summary, "Link atualizado na sessão.");
      setPdfLinks(await listPdfLinks(document.id));
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runEditRemoveLink = async (pageIndex: number, objectId: string) => {
    if (!document) return;
    try {
      const summary = await sessionEditRemoveLink(document.id, pageIndex, objectId);
      await acceptDocumentRevision(summary, "Link removido da sessão.");
      setPdfLinks(await listPdfLinks(document.id));
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runEditAddLink = async (link: LinkPlacement) => {
    if (!document) return;
    try {
      const summary = await sessionEditAddLink(document.id, link);
      await acceptDocumentRevision(summary, "Link inserido na sessão.");
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const reloadManagedElements = async () => {
    if (!document) return;
    try {
      setManagedElements(await listManagedPdfElements(document.id));
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runUpdateManagedOverlay = async (elementId: string, options: OverlayTextOptions) => {
    if (!document) return;
    try {
      const summary = await sessionEditUpdateOverlayText(document.id, elementId, options);
      await acceptDocumentRevision(summary, "Elemento de texto atualizado.");
      setManagedElements(await listManagedPdfElements(document.id));
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runUpdateManagedBackground = async (elementId: string, options: BackgroundOptions) => {
    if (!document) return;
    try {
      const summary = await sessionEditUpdateBackground(document.id, elementId, options);
      await acceptDocumentRevision(summary, "Plano de fundo atualizado.");
      setManagedElements(await listManagedPdfElements(document.id));
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runRemoveManagedElement = async (elementId: string) => {
    if (!document) return;
    try {
      const summary = await sessionEditRemoveManagedElement(document.id, elementId);
      await acceptDocumentRevision(summary, "Elemento gerenciado removido.");
      setManagedElements(await listManagedPdfElements(document.id));
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runSetPageLabels = async (options: PageLabelOptions) => {
    if (!document) return;
    try {
      const summary = await sessionSetPageLabels(document.id, options);
      await acceptDocumentRevision(summary, "Rótulos de página atualizados.");
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runEditOverlay = async (options: OverlayTextOptions) => {
    if (!document) return;
    try {
      const summary = await sessionEditOverlayText(document.id, options);
      await acceptDocumentRevision(summary, "Conteúdo aplicado às páginas na sessão.");
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runEditBackground = async (options: BackgroundOptions) => {
    if (!document) return;
    try {
      const summary = await sessionEditSetBackground(document.id, options);
      await acceptDocumentRevision(summary, "Fundo aplicado às páginas na sessão.");
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runElectronicSignature = async (output: string, annotation: AnnotationInput) => {
    if (!document) return;
    try {
      await addAnnotation(document.activePath, output, annotation);
      setSignatureTab(null);
      setNotice("Assinatura eletrônica visual aplicada. Ela não possui certificado digital.");
      await openPath(output);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runDigitalSignature = async (output: string, request: SignRequest) => {
    if (!document) return;
    try {
      setSignatureLoading(true);
      await signDocument(document.activePath, output, request);
      setSignatureTab(null);
      setNotice(request.certify ? "PDF certificado digitalmente." : "Assinatura digital PAdES aplicada.");
      await openPath(output);
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setSignatureLoading(false);
    }
  };

  const runSignatureValidation = async (trustDirectory?: string, allowOnline = false) => {
    if (!document) return;
    try {
      setSignatureLoading(true);
      setSignatureValidation(await validateSignatures(document.activePath, trustDirectory, allowOnline));
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setSignatureLoading(false);
    }
  };

  const reloadAnnotations = async () => {
    if (!document) return;
    try {
      setAnnotationsLoading(true);
      setAnnotations(await listAnnotations(document.activePath));
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setAnnotationsLoading(false);
    }
  };

  const runAddAnnotation = async (annotation: AnnotationInput) => {
    if (!document) return;
    try {
      const summary = await sessionAddAnnotation(document.id, annotation);
      await acceptDocumentRevision(summary, "Comentário adicionado à sessão.");
      setAnnotations(await listAnnotations(summary.activePath));
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runDeleteAnnotation = async (objectId: string) => {
    if (!document) return;
    try {
      const summary = await sessionDeleteAnnotation(document.id, objectId);
      await acceptDocumentRevision(summary, "Comentário removido da sessão.");
      setAnnotations(await listAnnotations(summary.activePath));
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const reloadFormFields = async () => {
    if (!document) return;
    try {
      setFormsLoading(true);
      setFormFields(await listFormFields(document.activePath));
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setFormsLoading(false);
    }
  };

  const runFillForm = async (values: FormValue[]) => {
    if (!document) return;
    try {
      const result = await sessionFillFormFields(document.id, values);
      await acceptDocumentRevision(result.document, `${result.changed} campo(s) preenchido(s) na sessão.`);
      setFormFields(await listFormFields(result.document.activePath));
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runCreateFormField = async (field: NewFormField) => {
    if (!document) return;
    try {
      const summary = await sessionCreateFormField(document.id, field);
      await acceptDocumentRevision(summary, `Campo "${field.name}" criado no AcroForm.`);
      setFormFields(await listFormFields(summary.activePath));
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runExportReview = async (destination: string) => {
    if (!document) return;
    try {
      const report = await exportReviewXfdf(document.activePath, destination);
      setReviewTransferReport(report);
      setNotice(`XFDF exportado · ${report.annotations} anotação(ões).`);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runImportReview = async (xfdf: string) => {
    if (!document) return;
    try {
      const result = await sessionImportReviewXfdf(document.id, xfdf);
      setReviewTransferReport(result.report);
      await acceptDocumentRevision(result.document, `${result.report.annotations} comentário(s) importado(s) do XFDF.`);
      setAnnotations(await listAnnotations(result.document.activePath));
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runGuidedAction = async (
    kind: GuidedActionKind,
    inputs: string[],
    outputDirectory: string,
  ) => {
    try {
      const started =
        kind === "ocr"
          ? await startBatchOcr(inputs, outputDirectory, {
              language: settings.ocrLanguage,
              deskew: true,
              rotatePages: true,
              outputType: settings.ocrOutputType,
              mode: "skip",
            })
          : kind === "optimize"
            ? await startBatchOptimize(inputs, outputDirectory, "ebook")
            : await startBatchConvertToPdf(inputs, outputDirectory);
      setGuidedActionsOpen(false);
      setNotice(`Ação guiada iniciada · ${inputs.length} arquivo(s) · job ${started.jobId.slice(0, 8)}`);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const reloadCatalogs = async () => {
    try { setCatalogs(await listCatalogs()); } catch (error) { setNotice(errorMessage(error)); }
  };

  const runBuildCatalog = async (name: string, inputs: string[]) => {
    try {
      setCatalogLoading(true);
      const created = await buildCatalog(name, inputs);
      setNotice(`Índice "${created.name}" criado com ${created.documentCount} documento(s).`);
      setCatalogs(await listCatalogs());
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setCatalogLoading(false); }
  };

  const runCatalogSearch = async (id: string, query: string, matchCase: boolean) => {
    try {
      setCatalogLoading(true);
      setCatalogHits(await searchCatalog(id, query, matchCase));
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setCatalogLoading(false); }
  };

  const runDeleteCatalog = async (id: string) => {
    try {
      await deleteCatalog(id);
      setCatalogHits([]);
      setCatalogs(await listCatalogs());
      setNotice("Índice local excluído.");
    } catch (error) { setNotice(errorMessage(error)); }
  };

  const reloadFieldActions = async () => {
    if (!document) return;
    try {
      setFieldActions(await listFormFieldActions(document.id));
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runSetFieldAction = async (request: FieldActionInput) => {
    if (!document) return;
    try {
      const summary = await sessionSetFormFieldAction(document.id, request);
      await acceptDocumentRevision(summary, "Ação de campo atualizada.");
      setFieldActions(await listFormFieldActions(document.id));
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runDeleteFieldAction = async (objectId: string, trigger: string) => {
    if (!document) return;
    try {
      const summary = await sessionDeleteFormFieldAction(document.id, objectId, trigger);
      await acceptDocumentRevision(summary, "Ação de campo removida.");
      setFieldActions(await listFormFieldActions(document.id));
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runDuplicateFormField = async (request: DuplicateFieldRequest) => {
    if (!document) return;
    try {
      const result = await sessionDuplicateFormField(document.id, request);
      await acceptDocumentRevision(result.document, `${result.changed} cópia(s) de campo criada(s).`);
      setFormFields(await listFormFields(result.document.activePath));
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runSetTabOrder = async (order: "row" | "column" | "structure") => {
    if (!document) return;
    try {
      const summary = await sessionSetPageTabOrder(document.id, page, order);
      await acceptDocumentRevision(summary, `Ordem de tabulação da página definida por ${order}.`);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runExportFormData = async (destination: string) => {
    if (!document) return;
    try {
      const count = await exportFormData(document.activePath, destination);
      setNotice(`${count} campo(s) exportado(s).`);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runImportFormData = async (dataPath: string) => {
    if (!document) return;
    try {
      const result = await sessionImportFormData(document.id, dataPath);
      await acceptDocumentRevision(result.document, `${result.changed} campo(s) importado(s).`);
      setFormFields(await listFormFields(result.document.activePath));
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runResetForm = async (useDefaults: boolean) => {
    if (!document) return;
    try {
      const result = await sessionResetForm(document.id, useDefaults);
      await acceptDocumentRevision(
        result.document,
        useDefaults ? "Formulário restaurado para os valores padrão." : "Formulário limpo.",
      );
      setFormFields(await listFormFields(result.document.activePath));
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runUpdateFormField = async (update: FormFieldUpdate) => {
    if (!document) return;
    try {
      const summary = await sessionUpdateFormField(document.id, update);
      await acceptDocumentRevision(summary, `Campo "${update.name}" atualizado.`);
      setFormFields(await listFormFields(summary.activePath));
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runDeleteFormField = async (objectId: string) => {
    if (!document) return;
    try {
      const summary = await sessionDeleteFormField(document.id, objectId);
      await acceptDocumentRevision(summary, "Campo removido do AcroForm.");
      setFormFields(await listFormFields(summary.activePath));
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const createImagesPdf = async (inputs: string[], dpi: number) => {
    const destination = await save({
      title: "Criar PDF a partir de imagens",
      defaultPath: "Imagens-Seven.pdf",
      filters: [{ name: "Documento PDF", extensions: ["pdf"] }],
    });
    if (!destination) return;
    try {
      await createPdfFromImages(inputs, destination, dpi);
      setCreateDialogOpen(false);
      setNotice("PDF criado a partir das imagens.");
      await openPath(destination);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const createTextPdf = async (text: string, pageSize: BlankPageSize, fontSize: number) => {
    const destination = await save({
      title: "Criar PDF a partir de texto",
      defaultPath: "Texto-Seven.pdf",
      filters: [{ name: "Documento PDF", extensions: ["pdf"] }],
    });
    if (!destination) return;
    try {
      await createPdfFromText(destination, text, pageSize, fontSize);
      setCreateDialogOpen(false);
      setNotice("PDF de texto criado com conteúdo pesquisável.");
      await openPath(destination);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const createClipboardImagePdf = async (
    rgba: number[],
    width: number,
    height: number,
    dpi: number,
  ) => {
    const destination = await save({
      title: "Criar PDF a partir da imagem do clipboard",
      defaultPath: "Clipboard-Seven.pdf",
      filters: [{ name: "Documento PDF", extensions: ["pdf"] }],
    });
    if (!destination) return;
    try {
      await createPdfFromClipboardImage(destination, rgba, width, height, dpi);
      setCreateDialogOpen(false);
      setNotice("PDF criado a partir da imagem da área de transferência.");
      await openPath(destination);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const createFilePdf = async (input: string, outputDirectory: string) => {
    try {
      const started = await startConvertToPdf(input, outputDirectory);
      setCreateDialogOpen(false);
      setNotice(`Conversão para PDF iniciada · job ${started.jobId.slice(0, 8)}`);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const createWebPdf = async (url: string) => {
    const destination = await save({
      title: "Criar PDF a partir da Web",
      defaultPath: "Pagina-Web-Seven.pdf",
      filters: [{ name: "Documento PDF", extensions: ["pdf"] }],
    });
    if (!destination) return;
    try {
      const started = await startWebToPdf(url, destination);
      setCreateDialogOpen(false);
      setNotice(`Captura da página iniciada · job ${started.jobId.slice(0, 8)}`);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runAdvancedOcr = async (output: string, options: OcrOptions) => {
    if (!document) return;
    try {
      const started = await startOcrAdvanced(document.activePath, output, options);
      setOcrOpen(false);
      setNotice(`OCR iniciado · job ${started.jobId.slice(0, 8)}`);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runBatchOcr = async (inputs: string[], outputDirectory: string, options: OcrOptions) => {
    try {
      const started = await startBatchOcr(inputs, outputDirectory, options);
      setOcrOpen(false);
      setNotice(`OCR em lote iniciado · ${inputs.length} arquivo(s) · job ${started.jobId.slice(0, 8)}`);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const reviewCurrentOcrPage = async (language: string, threshold: number) => {
    if (!document) return;
    try {
      setOcrReviewLoading(true);
      setOcrSuspects(await reviewOcrPage(document.id, page, language, threshold));
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setOcrReviewLoading(false);
    }
  };

  const runScan = async (output: string, dpi: number) => {
    try {
      await scanPageToPdf(output, dpi);
      setOcrOpen(false);
      setNotice("Digitalização salva como PDF.");
      await openPath(output);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const createBlankPdf = async (pageSize: BlankPageSize, pageCount: number) => {
    const destination = await save({
      title: "Criar novo PDF",
      defaultPath: "Novo-documento.pdf",
      filters: [{ name: "Documento PDF", extensions: ["pdf"] }],
    });
    if (!destination) return;

    try {
      await createBlankDocument(destination, pageSize, pageCount);
      setCreateDialogOpen(false);
      setNotice("PDF criado com sucesso.");
      await openPath(destination);
    } catch (error) {
      const text = errorMessage(error);
      setNotice(text);
      await message(text, { title: "Seven Reader", kind: "error" });
    }
  };

  const runPageGeometry = async (update: PageGeometryUpdate) => {
    if (!document) return;
    try {
      const summary = await sessionSetPageGeometry(document.id, update);
      await acceptDocumentRevision(
        summary,
        update.mode === "crop" ? "CropBox aplicado às páginas selecionadas." : "MediaBox/CropBox redimensionados.",
      );
      setOrganizerOpen(false);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runPageOperation = async (request: PageOperationRequest) => {
    const input = await pickInputPdf();
    if (!input) return;

    const suffix =
      request.operation === "extract" ? "extraido"
        : request.operation === "rotate" ? "girado"
          : request.operation === "split" ? "dividido"
            : request.operation === "delete" ? "paginas-removidas"
              : request.operation === "insert" ? "paginas-inseridas"
                : request.operation === "replace" ? "paginas-substituidas"
                  : "organizado";

    const output = await save({
      title:
        request.operation === "extract" ? "Salvar páginas extraídas"
          : request.operation === "rotate" ? "Salvar PDF girado"
            : request.operation === "split" ? "Nome base dos PDFs divididos"
              : request.operation === "delete" ? "Salvar PDF sem as páginas selecionadas"
                : request.operation === "insert" ? "Salvar PDF com páginas inseridas"
                  : request.operation === "replace" ? "Salvar PDF com páginas substituídas"
                    : "Salvar PDF reorganizado",
      defaultPath: `Seven-Reader-${suffix}.pdf`,
      filters: [{ name: "Documento PDF", extensions: ["pdf"] }],
    });
    if (!output) return;

    try {
      const started =
        request.operation === "extract"
          ? await startExtractPages(input, output, request.pageExpression)
          : request.operation === "rotate"
            ? await startRotatePages(input, output, request.pageExpression, request.angle)
            : request.operation === "split"
              ? await startSplitPages(input, output, request.pagesPerFile)
              : request.operation === "delete"
                ? await startDeletePages(input, output, request.pageExpression)
                : request.operation === "insert"
                  ? request.insertKind === "blank"
                    ? await startInsertBlankPages(
                        input,
                        output,
                        request.insertAfter ?? 0,
                        request.pageSize ?? "a4",
                        request.blankPageCount ?? 1,
                      )
                    : request.insertKind === "images"
                      ? await startInsertImagePages(
                          input,
                          output,
                          request.insertAfter ?? 0,
                          request.images ?? [],
                          request.dpi ?? 150,
                        )
                      : request.insertKind === "clipboard-text"
                        ? await startInsertTextPages(
                            input,
                            output,
                            request.insertAfter ?? 0,
                            request.text ?? "",
                            request.pageSize ?? "a4",
                            request.fontSize ?? 11,
                          )
                        : request.insertKind === "clipboard-image"
                          ? await startInsertClipboardImagePages(
                              input,
                              output,
                              request.insertAfter ?? 0,
                              request.rgba ?? [],
                              request.imageWidth ?? 0,
                              request.imageHeight ?? 0,
                              request.dpi ?? 150,
                            )
                          : request.insertKind === "web"
                            ? await startInsertWebPages(
                                input,
                                output,
                                request.insertAfter ?? 0,
                                request.url ?? "",
                              )
                            : request.insertKind === "scan"
                              ? await startInsertScannedPage(
                                  input,
                                  output,
                                  request.insertAfter ?? 0,
                                  request.dpi ?? 150,
                                )
                              : await startInsertPages(
                                  input,
                                  output,
                                  request.source ?? "",
                                  request.sourceRange ?? "1-z",
                                  request.insertAfter ?? 0,
                                )
                  : request.operation === "replace"
                    ? await startReplacePages(
                        input,
                        output,
                        request.source ?? "",
                        request.targetStart ?? 1,
                        request.sourceStart ?? 1,
                        request.count ?? 1,
                      )
                    : await startReorderPages(input, output, request.pageExpression);

      setOrganizerOpen(false);
      setNotice(`Operação de páginas iniciada · job ${started.jobId.slice(0, 8)}`);
    } catch (error) {
      const text = errorMessage(error);
      setNotice(text);
      await message(text, { title: "Seven Reader", kind: "error" });
    }
  };


  const runConvertToPdf = async (input: string, outputDirectory: string) => {
    try {
      const started = await startConvertToPdf(input, outputDirectory);
      setConversionOpen(false);
      setNotice(`Conversão iniciada · job ${started.jobId.slice(0, 8)}`);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runBatchConvertToPdf = async (inputs: string[], outputDirectory: string) => {
    try {
      const started = await startBatchConvertToPdf(inputs, outputDirectory);
      setConversionOpen(false);
      setNotice(`Conversão em lote iniciada · ${inputs.length} arquivo(s) · job ${started.jobId.slice(0, 8)}`);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runExport = async (
    input: string,
    output: string,
    format: "png" | "jpeg" | "tiff" | "txt" | "ps",
    dpi?: number,
  ) => {
    try {
      const started = await startExportPdf(input, output, format, dpi);
      setConversionOpen(false);
      setNotice(`Exportação iniciada · job ${started.jobId.slice(0, 8)}`);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runEncrypt = async (output: string, userPassword: string, ownerPassword: string) => {
    if (!document) return;
    try {
      const started = await startEncryptPdf(document.activePath, output, userPassword, ownerPassword);
      setSecurityMode(null);
      setNotice(`Criptografia iniciada · job ${started.jobId.slice(0, 8)}`);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runDecrypt = async (output: string, password: string) => {
    if (!document) return;
    try {
      const started = await startDecryptPdf(document.activePath, output, password);
      setSecurityMode(null);
      setNotice(`Descriptografia iniciada · job ${started.jobId.slice(0, 8)}`);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runSanitize = async (output: string, options: SanitizeOptions) => {
    if (!document) return;
    try {
      const report = await sanitizeDocument(document.activePath, output, options);
      setSecurityMode(null);
      setNotice(`Sanitização concluída · ${report.removedEntries} entrada(s) removida(s).`);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const loadMetadata = async () => {
    if (!document || metadata) return;
    try {
      setReportLoading(true);
      setMetadata(await getDocumentMetadata(document.activePath));
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setReportLoading(false);
    }
  };

  const saveMetadata = async (update: { title: string; author: string; subject: string; keywords: string }) => {
    if (!document) return;
    try {
      const summary = await sessionUpdateDocumentMetadata(document.id, update);
      await acceptDocumentRevision(summary, "Metadados atualizados na sessão.");
      setMetadata(await getDocumentMetadata(summary.activePath));
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runAccessibility = async () => {
    if (!document) return;
    try {
      setReportLoading(true);
      setAccessibilityReport(await getAccessibilityReport(document.activePath));
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setReportLoading(false);
    }
  };

  const runCompare = async (other: string) => {
    if (!document) return;
    try {
      setReportLoading(true);
      setCompareReport(await compareDocuments(document.activePath, other));
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setReportLoading(false);
    }
  };

  const updateRecent = (path: string, update: (item: RecentDocument) => RecentDocument) => {
    setRecents((current) => {
      const next = current.map((item) => item.path === path ? update(item) : item);
      localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
      return next;
    });
  };

  const togglePinned = (path: string) => {
    updateRecent(path, (item) => ({ ...item, pinned: !item.pinned }));
  };

  const toggleFavorite = (path: string) => {
    updateRecent(path, (item) => ({ ...item, favorite: !item.favorite }));
  };

  const removeRecent = (path: string) => {
    setRecents((current) => {
      const next = current.filter((item) => item.path !== path);
      localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
      return next;
    });
    setNotice("Item removido da lista de recentes. O arquivo não foi apagado.");
  };

  const revealRecent = async (path: string) => {
    try {
      await revealInFileManager(path);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runPrint = async () => {
    if (!document) return;
    try {
      const started = await printDocument(document.activePath);
      setNotice(`Impressão enviada ao sistema · job ${started.jobId.slice(0, 8)}`);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const status = (
    <>
      {notice && (
        <button className="global-notice" onClick={() => setNotice(null)} aria-label="Fechar aviso">
          {notice}
        </button>
      )}
      {closePrompt && (
        <UnsavedChangesDialog
          scope={closePrompt.scope}
          count={closePrompt.dirtyIds.length}
          documentName={
            closePrompt.dirtyIds.length === 1
              ? openTabs.find((tab) => tab.id === closePrompt.dirtyIds[0])?.name
              : undefined
          }
          busy={closeBusy}
          onSave={() => void resolveClosePrompt(true)}
          onDiscard={() => void resolveClosePrompt(false)}
          onCancel={cancelClosePrompt}
        />
      )}
      {optimizeOpen && document && <OptimizeDialog documentPath={document.activePath} audit={optimizationAudit} loading={optimizationAuditLoading} onClose={() => setOptimizeOpen(false)} onAudit={() => void reloadOptimizationAudit()} onRun={(output, options) => void runOptimizeAdvanced(output, options)} />}
      {sharedReviewOpen && document && <SharedReviewDialog documentPath={document.activePath} lastReport={reviewTransferReport} onClose={() => setSharedReviewOpen(false)} onExport={(destination) => void runExportReview(destination)} onImport={(xfdf) => void runImportReview(xfdf)} />}
      {guidedActionsOpen && <GuidedActionsDialog onClose={() => setGuidedActionsOpen(false)} onRun={(kind, inputs, outputDirectory) => void runGuidedAction(kind, inputs, outputDirectory)} />}
      {catalogOpen && <CatalogDialog catalogs={catalogs} hits={catalogHits} loading={catalogLoading} onClose={() => setCatalogOpen(false)} onReload={() => void reloadCatalogs()} onBuild={(name, inputs) => void runBuildCatalog(name, inputs)} onSearch={(id, query, matchCase) => void runCatalogSearch(id, query, matchCase)} onDelete={(id) => void runDeleteCatalog(id)} onOpenHit={(path, pageIndex) => { setCatalogOpen(false); void openPath(path, { page: pageIndex, zoom: settings.defaultZoom }); }} />}
      {settingsOpen && <SettingsDialog settings={settings} onClose={() => setSettingsOpen(false)} onChange={setSettings} />}
      {printProductionOpen && document && (
        <PrintProductionDialog
          report={printPreflight}
          loading={printPreflightLoading}
          pageCount={document.pageCount}
          onClose={() => setPrintProductionOpen(false)}
          onReload={() => void reloadPrintPreflight()}
          onSetBoxes={(update) => void runSetPageBoxes(update)}
        />
      )}
      {actionsOpen && document && (
        <ActionsDialog
          actions={pdfActions}
          loading={actionsLoading}
          onClose={() => setActionsOpen(false)}
          onReload={() => void reloadPdfActions()}
        />
      )}
      {advancedTab && document && (
        <AdvancedPdfDialog
          pageIndex={page}
          report={advancedReport}
          loading={advancedLoading}
          initialTab={advancedTab}
          onClose={() => setAdvancedTab(null)}
          onReload={() => void reloadAdvanced()}
          onAddBookmark={(title,pageIndex)=>void runAddBookmark(title,pageIndex)}
          onRenameBookmark={(objectId,title)=>void runRenameBookmark(objectId,title)}
          onUpdateBookmark={(update)=>void runUpdateBookmark(update)}
          onSetAllBookmarksOpen={(open)=>void runSetAllBookmarksOpen(open)}
          onGenerateBookmarksFromStructure={()=>void runGenerateBookmarksFromStructure()}
          onDeleteBookmark={(objectId)=>void runDeleteBookmark(objectId)}
          onMoveBookmark={(objectId,direction)=>void runMoveBookmark(objectId,direction)}
          onSetBookmarkOpen={(objectId,open)=>void runSetBookmarkOpen(objectId,open)}
          onAddAttachment={(filePath,displayName,description)=>void runAddAttachment(filePath,displayName,description)}
          onUpdateAttachment={(objectId,name,description)=>void runUpdateAttachment(objectId,name,description)}
          onRemoveAttachment={(objectId)=>void runRemoveAttachment(objectId)}
          onExtractAttachment={(objectId,destination)=>void runExtractAttachment(objectId,destination)}
          onLayerVisibility={(objectId,visible)=>void runLayerVisibility(objectId,visible)}
          onUpdateLayer={(update)=>void runUpdateLayerProperties(update)}
          onApplyLayerOverrides={(context)=>void runApplyLayerOverrides(context)}
          onResetLayerVisibility={()=>void runResetLayerVisibility()}
        />
      )}
      {redactionOpen && document && (
        <RedactionDialog
          documentPath={document.path}
          pageIndex={page}
          matches={redactionMatches}
          loading={redactionLoading}
          onClose={() => setRedactionOpen(false)}
          onSearch={(query, matchCase, wholeWord) => void searchRedactions(query, matchCase, wholeWord)}
          onApply={(output, areas) => void runRedactions(output, areas)}
        />
      )}
      {editingOpen && document && (
        <EditingDialog
          pageIndex={page}
          pageCount={document.pageCount}
          imageObjects={imageObjects}
          imageObjectsLoading={imageObjectsLoading}
          links={pdfLinks}
          linksLoading={pdfLinksLoading}
          namedDestinations={namedDestinations}
          managedElements={managedElements}
          onClose={() => setEditingOpen(false)}
          onAddText={(placement) => void runEditAddText(placement)}
          onReplaceText={(find, replacement, allPages) => void runEditReplaceText(find, replacement, allPages)}
          onReloadImages={() => void reloadImageObjects()}
          onReplaceImage={(resourceName, imagePath) => void runReplaceImageObject(resourceName, imagePath)}
          onRemoveImage={(resourceName) => void runRemoveImageObject(resourceName)}
          onAddImage={(placement) => void runEditAddImage(placement)}
          onReloadLinks={() => void reloadPdfLinks()}
          onReloadNamedDestinations={() => void reloadNamedDestinations()}
          onUpsertNamedDestination={(oldName,name,pageIndex)=>void runUpsertNamedDestination(oldName,name,pageIndex)}
          onRemoveNamedDestination={(name)=>void runRemoveNamedDestination(name)}
          onUpdateLink={(update) => void runEditUpdateLink(update)}
          onRemoveLink={(pageIndex,objectId) => void runEditRemoveLink(pageIndex,objectId)}
          onAddLink={(link) => void runEditAddLink(link)}
          onReloadManagedElements={() => void reloadManagedElements()}
          onUpdateManagedOverlay={(elementId, options) => void runUpdateManagedOverlay(elementId, options)}
          onUpdateManagedBackground={(elementId, options) => void runUpdateManagedBackground(elementId, options)}
          onRemoveManagedElement={(elementId) => void runRemoveManagedElement(elementId)}
          onSetPageLabels={(options) => void runSetPageLabels(options)}
          onOverlay={(options) => void runEditOverlay(options)}
          onBackground={(options) => void runEditBackground(options)}
        />
      )}
      {signatureTab && document && (
        <SignatureDialog
          documentPath={document.path}
          pageIndex={page}
          initialTab={signatureTab}
          validation={signatureValidation}
          loading={signatureLoading}
          onClose={() => setSignatureTab(null)}
          onElectronic={(output, annotation) => void runElectronicSignature(output, annotation)}
          onDigital={(output, request) => void runDigitalSignature(output, request)}
          onValidate={(trustDirectory, allowOnline) => void runSignatureValidation(trustDirectory, allowOnline)}
        />
      )}
      {commentsOpen && document && (
        <CommentsDialog
          pageIndex={page}
          annotations={annotations}
          loading={annotationsLoading}
          onClose={() => setCommentsOpen(false)}
          onReload={() => void reloadAnnotations()}
          onAdd={(annotation) => void runAddAnnotation(annotation)}
          onDelete={(objectId) => void runDeleteAnnotation(objectId)}
        />
      )}
      {formsOpen && document && (
        <FormsDialog
          pageIndex={page}
          fields={formFields}
          actions={fieldActions}
          loading={formsLoading}
          onClose={() => setFormsOpen(false)}
          onReload={() => void reloadFormFields()}
          onReloadActions={() => void reloadFieldActions()}
          onFill={(values) => void runFillForm(values)}
          onCreate={(field) => void runCreateFormField(field)}
          onUpdate={(update) => void runUpdateFormField(update)}
          onDelete={(objectId) => void runDeleteFormField(objectId)}
          onExportData={(destination) => void runExportFormData(destination)}
          onImportData={(path) => void runImportFormData(path)}
          onReset={(useDefaults) => void runResetForm(useDefaults)}
          onDuplicate={(request) => void runDuplicateFormField(request)}
          onSetTabOrder={(order) => void runSetTabOrder(order)}
          onSetAction={(request) => void runSetFieldAction(request)}
          onDeleteAction={(objectId, trigger) => void runDeleteFieldAction(objectId, trigger)}
        />
      )}
      {ocrOpen && (
        <OcrDialog
          capabilities={capabilities}
          documentPath={document?.path}
          documentId={document?.id}
          pageIndex={page}
          suspects={ocrSuspects}
          loadingReview={ocrReviewLoading}
          onClose={() => setOcrOpen(false)}
          onRunOcr={(output, options) => void runAdvancedOcr(output, options)}
          onRunBatchOcr={(inputs, outputDirectory, options) => void runBatchOcr(inputs, outputDirectory, options)}
          onReview={(language, threshold) => void reviewCurrentOcrPage(language, threshold)}
          onScan={(output, dpi) => void runScan(output, dpi)}
        />
      )}
      {conversionOpen && (
        <ConversionDialog
          capabilities={capabilities}
          currentPdf={document?.activePath}
          onClose={() => setConversionOpen(false)}
          onConvertToPdf={(input, outputDirectory) => void runConvertToPdf(input, outputDirectory)}
          onBatchConvertToPdf={(inputs, outputDirectory) => void runBatchConvertToPdf(inputs, outputDirectory)}
          onExport={(input, output, format, dpi) => void runExport(input, output, format, dpi)}
        />
      )}
      {securityMode && document && (
        <SecurityDialog
          mode={securityMode}
          currentPdf={document.activePath}
          onClose={() => setSecurityMode(null)}
          onEncrypt={(output, userPassword, ownerPassword) => void runEncrypt(output, userPassword, ownerPassword)}
          onDecrypt={(output, password) => void runDecrypt(output, password)}
          onSanitize={(output, options) => void runSanitize(output, options)}
        />
      )}
      {propertiesOpen && document && (
        <PropertiesDialog
          metadata={metadata}
          loading={reportLoading}
          onClose={() => setPropertiesOpen(false)}
          onReload={() => void loadMetadata()}
          onSave={(update) => void saveMetadata(update)}
        />
      )}
      {reportMode && document && (
        <ReportDialog
          mode={reportMode}
          currentPdf={document.path}
          accessibility={accessibilityReport}
          comparison={compareReport}
          loading={reportLoading}
          onClose={() => setReportMode(null)}
          onAccessibility={() => void runAccessibility()}
          onCompare={(other) => void runCompare(other)}
        />
      )}
      {createDialogOpen && (
        <CreatePdfDialog
          capabilities={capabilities}
          onClose={() => setCreateDialogOpen(false)}
          onCreate={(pageSize, pageCount) => void createBlankPdf(pageSize, pageCount)}
          onCreateImages={(inputs, dpi) => void createImagesPdf(inputs, dpi)}
          onCreateText={(text, pageSize, fontSize) => void createTextPdf(text, pageSize, fontSize)}
          onCreateClipboardImage={(rgba, width, height, dpi) => void createClipboardImagePdf(rgba, width, height, dpi)}
          onCreateFile={(input, outputDirectory) => void createFilePdf(input, outputDirectory)}
          onCreateWeb={(url) => void createWebPdf(url)}
        />
      )}
      {organizerOpen && (
        <PageOrganizerDialog
          documentId={document?.id ?? ""}
          fileName={document?.name ?? "Selecionar PDF"}
          pageCount={document?.pageCount}
          capabilities={capabilities}
          onClose={() => setOrganizerOpen(false)}
          onGeometry={(update) => void runPageGeometry(update)}
          onRun={(request) => void runPageOperation(request)}
        />
      )}
      {activeJobs.length > 0 && (
        <div className="job-stack" aria-live="polite">
          {activeJobs.slice(0, 3).map((job) => (
            <div className="job-chip" key={job.id}>
              <span className="job-pulse" />
              <div><strong>{job.kind}</strong><small>{job.stage}</small></div>
              <button onClick={() => void cancelJob(job.id)}>Cancelar</button>
            </div>
          ))}
        </div>
      )}
    </>
  );

  if (splash) return <SplashScreen leaving={leavingSplash} />;

  if (document) {
    return (
      <>
        <DocumentWorkspace
          document={document}
          tabs={openTabs}
          rendered={rendered}
          renderedPages={renderedPages}
          splitDocument={splitDocument}
          splitRendered={splitRendered}
          splitPage={splitPage}
          splitZoom={splitZoom}
          splitOrientation={splitOrientation}
          viewMode={viewMode}
          canReopenClosed={closedTabs.length > 0}
          canNavigateBack={canNavigateBack}
          canNavigateForward={canNavigateForward}
          capabilities={capabilities}
          quickTools={settings.quickTools}
          quickToolsPosition={settings.quickToolsPosition}
          sidePanels={settings.sidePanels}
          taskHistory={taskHistory}
          searchHits={searchHits}
          advancedSearchHits={advancedSearchHits}
          page={page}
          zoom={zoom}
          onHome={() => void closeCurrent()}
          onSelectTab={(tab) => void selectTab(tab)}
          onCloseTab={(documentId) => void closeTab(documentId)}
          onCloseOtherTabs={(documentId) => void closeOtherTabs(documentId)}
          onReopenClosed={() => void reopenClosedTab()}
          onReorderTabs={reorderTabs}
          canCreateWindow={currentWindowLabel === "main"}
          onOpenInNewWindow={(documentId) => void openTabInNewWindow(documentId, false)}
          onMoveToNewWindow={(documentId) => void openTabInNewWindow(documentId, true)}
          onOpenSideBySide={(documentId) => void openSideBySide(documentId)}
          onCloseSideBySide={closeSideBySide}
          onSplitRender={(nextPage, nextZoom) => splitDocument && void renderSplitDocument(splitDocument, nextPage, nextZoom)}
          onSplitOrientationChange={setSplitOrientation}
          onTransferPages={(sourceId, targetId, range, insertAfter, movePages) =>
            void runPageTransferBetweenOpenDocuments(sourceId, targetId, range, insertAfter, movePages)}
          onNavigateBack={() => void navigateHistory(-1)}
          onNavigateForward={() => void navigateHistory(1)}
          onQuickToolsPositionChange={(position) => setSettings((current) => ({ ...current, quickToolsPosition: position }))}
          onOpen={() => void choosePdf()}
          onSave={() => void saveCurrent()}
          onSaveAs={() => void saveAs()}
          onUndo={() => void undoCurrent()}
          onRedo={() => void redoCurrent()}
          onPrint={() => void runPrint()}
          onRender={(nextPage, nextZoom) => void render(nextPage, nextZoom)}
          onVisiblePage={(nextPage) => void updateVisiblePage(nextPage)}
          onViewModeChange={(mode) => void changeViewMode(mode)}
          onSearch={(query) => void runSearch(query)}
          onInk={(ink) => void runInkAnnotation(ink)}
          onMarkup={(kind, rect) => void runMarkupAnnotation(kind, rect)}
          onAdvancedSearch={(options) => void runAdvancedSearch(options)}
          onTool={(tool) => void selectTool(tool)}
          onSettings={() => setSettingsOpen(true)}
          externalFileStatus={externalFileStatus}
          onReloadExternal={() => void reloadExternalDocument()}
          protectedView={protectedView}
          protectedReasons={protectedReasons}
          onTrustOnce={trustCurrentOnce}
          onTrustLocation={trustCurrentLocation}
        />
        {status}
      </>
    );
  }

  return (
    <>
      <Home
        native={native}
        capabilities={capabilities}
        recents={recents}
        recentTools={recentTools}
        taskHistory={taskHistory}
        onOpen={() => void choosePdf()}
        onOpenFolder={() => void chooseFolder()}
        lastSessionPath={localStorage.getItem("seven-reader:last-document")}
        onRecoverSession={() => void restoreSession()}
        onOpenRecent={(path) => void openPath(path)}
        onClearRecent={() => {
          localStorage.removeItem(RECENTS_KEY);
          setRecents([]);
          setNotice("Lista de recentes limpa.");
        }}
        onTogglePinned={togglePinned}
        onToggleFavorite={toggleFavorite}
        onRemoveRecent={removeRecent}
        onRevealRecent={(path) => void revealRecent(path)}
        onTool={(tool) => void selectTool(tool)}
        onSettings={() => setSettingsOpen(true)}
      />
      {status}
    </>
  );
}
