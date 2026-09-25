import { useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
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
import { applyAppearance, isTrustedPath, loadSettings, saveSettings, type SevenSettings } from "./lib/settings";
import {
  addAnnotation,
  addInkAnnotation,
  addPdfAttachment,
  addPdfBookmark,
  cancelJob,
  closeDocument,
  compareDocuments,
  createPdfFromImages,
  createPdfFromClipboardImage,
  createPdfFromText,
  createBlankDocument,
  getAccessibilityReport,
  getCapabilities,
  getDocumentMetadata,
  inspectAdvancedPdf,
  isNativeDesktop,
  listPdfFilesInFolder,
  listAnnotations,
  listFormFields,
  extractPdfAttachment,
  renamePdfBookmark,
  setPdfLayerVisibility,
  openDocument,
  printDocument,
  renderPage,
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
  sessionEditAddImage,
  sessionEditAddLink,
  sessionEditOverlayText,
  sessionEditSetBackground,
  sessionFillFormFields,
  sessionCreateFormField,
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
  startInsertPages,
  startReplacePages,
  signDocument,
  validateSignatures,
  startOcr,
  startOcrAdvanced,
  startOptimize,
  updateDocumentMetadata,
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
  CompareReport,
  DocumentMetadata,
  DocumentSummary,
  FormFieldInfo,
  FormValue,
  ImagePlacement,
  InkAnnotationInput,
  JobStatus,
  LinkPlacement,
  NewFormField,
  OcrOptions,
  OcrWord,
  OverlayTextOptions,
  RecentDocument,
  RedactionArea,
  RenderResult,
  SanitizeOptions,
  SearchHit,
  SignRequest,
  SignatureValidationReport,
  TextPlacement,
  ToolId,
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
  const [splash, setSplash] = useState(true);
  const [leavingSplash, setLeavingSplash] = useState(false);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(native ? emptyCapabilities : null);
  const [document, setDocument] = useState<DocumentSummary | null>(null);
  const [openTabs, setOpenTabs] = useState<DocumentSummary[]>([]);
  const [tabViews, setTabViews] = useState<Record<string, { page: number; zoom: number }>>({});
  const [closedTabs, setClosedTabs] = useState<Array<{ path: string; page: number; zoom: number }>>([]);
  const [navHistories, setNavHistories] = useState<Record<string, { entries: number[]; index: number }>>({});
  const [rendered, setRendered] = useState<RenderResult | null>(null);
  const [page, setPage] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [recents, setRecents] = useState<RecentDocument[]>(loadRecents);
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const [advancedSearchHits, setAdvancedSearchHits] = useState<AdvancedSearchHit[]>([]);
  const [jobs, setJobs] = useState<Record<string, JobStatus>>({});
  const [taskHistory, setTaskHistory] = useState<JobStatus[]>(loadTaskHistory);
  const [recentTools, setRecentTools] = useState<ToolId[]>(loadRecentTools);
  const [notice, setNotice] = useState<string | null>(null);
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
  const [ocrSuspects, setOcrSuspects] = useState<OcrWord[]>([]);
  const [ocrReviewLoading, setOcrReviewLoading] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [annotations, setAnnotations] = useState<AnnotationInfo[]>([]);
  const [annotationsLoading, setAnnotationsLoading] = useState(false);
  const [formsOpen, setFormsOpen] = useState(false);
  const [formFields, setFormFields] = useState<FormFieldInfo[]>([]);
  const [formsLoading, setFormsLoading] = useState(false);
  const [signatureTab, setSignatureTab] = useState<"electronic" | "digital" | "validate" | null>(null);
  const [signatureValidation, setSignatureValidation] = useState<SignatureValidationReport | null>(null);
  const [signatureLoading, setSignatureLoading] = useState(false);
  const [editingOpen, setEditingOpen] = useState(false);
  const [redactionOpen, setRedactionOpen] = useState(false);
  const [redactionMatches, setRedactionMatches] = useState<RedactionArea[]>([]);
  const [redactionLoading, setRedactionLoading] = useState(false);
  const [advancedTab, setAdvancedTab] = useState<"overview"|"bookmarks"|"attachments"|"layers"|null>(null);
  const [advancedReport, setAdvancedReport] = useState<AdvancedPdfReport|null>(null);
  const [advancedLoading, setAdvancedLoading] = useState(false);
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
    if (!native) return;
    const session = openTabs.map((tab) => {
      const view = tabViews[tab.id] ?? (tab.id === document?.id ? { page, zoom } : { page: 0, zoom: settings.defaultZoom });
      return { path: tab.path, page: view.page, zoom: view.zoom };
    });
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }, [native, openTabs, tabViews, document?.id, page, zoom, settings.defaultZoom]);

  const activeJobs = useMemo(
    () => Object.values(jobs).filter((job) => job.state === "queued" || job.state === "running"),
    [jobs],
  );

  const currentNavigation = document ? navHistories[document.id] : undefined;
  const canNavigateBack = Boolean(currentNavigation && currentNavigation.index > 0);
  const canNavigateForward = Boolean(
    currentNavigation && currentNavigation.index < currentNavigation.entries.length - 1,
  );

  const rememberRecent = (summary: DocumentSummary) => {
    setRecents((current) => {
      const previous = current.find((item) => item.path === summary.path);
      const next: RecentDocument[] = [
        {
          path: summary.path,
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
    setPage(nextPage);
    setZoom(nextZoom);
    setTabViews((current) => ({ ...current, [summary.id]: { page: nextPage, zoom: nextZoom } }));
    setNavHistories((current) => current[summary.id]
      ? current
      : { ...current, [summary.id]: { entries: [nextPage], index: 0 } });
    setSearchHits([]);
    setAdvancedSearchHits([]);
    setRendered(null);

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

    const targetWidth = Math.max(900, Math.min(6000, Math.round(1400 * (nextZoom / 100))));
    const first = await renderPage(summary.id, nextPage, targetWidth);
    setRendered(first);
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
      const raw = localStorage.getItem(SESSION_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      const session = Array.isArray(parsed)
        ? parsed.filter((item): item is { path: string; page: number; zoom: number } =>
            item && typeof item.path === "string" && typeof item.page === "number" && typeof item.zoom === "number")
        : [];
      if (!session.length) {
        const path = localStorage.getItem("seven-reader:last-document");
        if (path) await openPath(path);
        return;
      }
      for (const item of session.slice(0, 20)) {
        await openPath(item.path, {
          page: Math.max(0, Math.trunc(item.page)),
          zoom: Math.max(25, Math.min(400, item.zoom)),
        });
      }
      setNotice(`Sessão restaurada · ${session.length} documento(s).`);
    } catch (error) {
      setNotice(`Não foi possível restaurar toda a sessão: ${errorMessage(error)}`);
    }
  };

  useEffect(() => {
    if (!native || splash || sessionRestoredRef.current || !settings.reopenLastDocument) return;
    sessionRestoredRef.current = true;
    void restoreSession();
  }, [native, splash, settings.reopenLastDocument]);

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

  const selectTab = async (summary: DocumentSummary) => {
    if (summary.id === document?.id) return;
    try {
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
        for (const tab of openTabs) {
          try { await closeDocument(tab.id); } catch { /* continue cleanup */ }
        }
        localStorage.removeItem(SESSION_KEY);
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

    const targetWidth = Math.max(900, Math.min(6000, Math.round(1400 * (boundedZoom / 100))));
    try {
      const next = await renderPage(document.id, boundedPage, targetWidth);
      setRendered(next);
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
    const targetWidth = Math.max(900, Math.min(6000, Math.round(1400 * (zoom / 100))));
    const next = await renderPage(summary.id, page, targetWidth);
    setRendered(next);
    setNotice(successMessage);
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
        setAdvancedTab(tool === "bookmarks" ? "bookmarks" : tool === "attachments" ? "attachments" : tool === "layers" ? "layers" : "overview");
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
        const input = await pickInputPdf();
        if (!input) return;
        const output = await save({
          title: "Salvar PDF otimizado",
          defaultPath: "Seven-Reader-Otimizado.pdf",
          filters: [{ name: "Documento PDF", extensions: ["pdf"] }],
        });
        if (!output) return;
        const started = await startOptimize(input, output);
        setNotice(`Otimização iniciada · job ${started.jobId.slice(0, 8)}`);
      }
    } catch (error) {
      const text = errorMessage(error);
      setNotice(text);
      await message(text, { title: "Seven Reader", kind: "error" });
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

  const reopenAdvancedOutput = async (operation: () => Promise<void>, output: string, success: string) => {
    try {
      await operation();
      setAdvancedTab(null);
      setNotice(success);
      await openPath(output);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runAddBookmark = (output: string, title: string, pageIndex: number) =>
    reopenAdvancedOutput(() => addPdfBookmark(document!.path, output, {title,pageIndex}), output, "Marcador criado.");

  const runRenameBookmark = (output: string, objectId: string, title: string) =>
    reopenAdvancedOutput(() => renamePdfBookmark(document!.path, output, objectId, title), output, "Marcador renomeado.");

  const runAddAttachment = (output: string, filePath: string, displayName: string, description: string) =>
    reopenAdvancedOutput(() => addPdfAttachment(document!.path, output, filePath, displayName, description), output, "Arquivo incorporado ao PDF.");

  const runExtractAttachment = async (objectId: string, destination: string) => {
    if (!document) return;
    try {
      await extractPdfAttachment(document.activePath, objectId, destination);
      setNotice("Anexo extraído.");
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runLayerVisibility = (output: string, objectId: string, visible: boolean) =>
    reopenAdvancedOutput(() => setPdfLayerVisibility(document!.path, output, objectId, visible), output, visible ? "Layer marcada como visível." : "Layer marcada como oculta.");

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

  const runEditAddImage = async (placement: ImagePlacement) => {
    if (!document) return;
    try {
      const summary = await sessionEditAddImage(document.id, placement);
      await acceptDocumentRevision(summary, "Imagem inserida na sessão.");
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
                  ? await startInsertPages(
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

  const saveMetadata = async (output: string, update: { title: string; author: string; subject: string; keywords: string }) => {
    if (!document) return;
    try {
      await updateDocumentMetadata(document.activePath, output, update);
      setPropertiesOpen(false);
      setNotice("Metadados salvos em uma nova cópia.");
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
      {settingsOpen && <SettingsDialog settings={settings} onClose={() => setSettingsOpen(false)} onChange={setSettings} />}
      {advancedTab && document && (
        <AdvancedPdfDialog
          documentPath={document.path}
          pageIndex={page}
          report={advancedReport}
          loading={advancedLoading}
          initialTab={advancedTab}
          onClose={() => setAdvancedTab(null)}
          onReload={() => void reloadAdvanced()}
          onAddBookmark={(output,title,pageIndex)=>void runAddBookmark(output,title,pageIndex)}
          onRenameBookmark={(output,objectId,title)=>void runRenameBookmark(output,objectId,title)}
          onAddAttachment={(output,filePath,displayName,description)=>void runAddAttachment(output,filePath,displayName,description)}
          onExtractAttachment={(objectId,destination)=>void runExtractAttachment(objectId,destination)}
          onLayerVisibility={(output,objectId,visible)=>void runLayerVisibility(output,objectId,visible)}
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
          onClose={() => setEditingOpen(false)}
          onAddText={(placement) => void runEditAddText(placement)}
          onReplaceText={(find, replacement, allPages) => void runEditReplaceText(find, replacement, allPages)}
          onAddImage={(placement) => void runEditAddImage(placement)}
          onAddLink={(link) => void runEditAddLink(link)}
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
          loading={formsLoading}
          onClose={() => setFormsOpen(false)}
          onReload={() => void reloadFormFields()}
          onFill={(values) => void runFillForm(values)}
          onCreate={(field) => void runCreateFormField(field)}
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
          path={document.path}
          metadata={metadata}
          loading={reportLoading}
          onClose={() => setPropertiesOpen(false)}
          onReload={() => void loadMetadata()}
          onSave={(output, update) => void saveMetadata(output, update)}
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
          fileName={document?.name ?? "Selecionar PDF"}
          pageCount={document?.pageCount}
          onClose={() => setOrganizerOpen(false)}
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
          onSearch={(query) => void runSearch(query)}
          onInk={(ink) => void runInkAnnotation(ink)}
          onMarkup={(kind, rect) => void runMarkupAnnotation(kind, rect)}
          onAdvancedSearch={(options) => void runAdvancedSearch(options)}
          onTool={(tool) => void selectTool(tool)}
          onSettings={() => setSettingsOpen(true)}
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
