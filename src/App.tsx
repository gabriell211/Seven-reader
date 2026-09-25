import { useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { message, open, save } from "@tauri-apps/plugin-dialog";
import { SplashScreen } from "./components/SplashScreen";
import { Home } from "./components/Home";
import { DocumentWorkspace } from "./components/DocumentWorkspace";
import { PageOrganizerDialog, type PageOperation } from "./components/PageOrganizerDialog";
import { CreatePdfDialog, type BlankPageSize } from "./components/CreatePdfDialog";
import { ConversionDialog } from "./components/ConversionDialog";
import { SecurityDialog } from "./components/SecurityDialog";
import { PropertiesDialog } from "./components/PropertiesDialog";
import { ReportDialog } from "./components/ReportDialog";
import {
  cancelJob,
  closeDocument,
  compareDocuments,
  createBlankDocument,
  getAccessibilityReport,
  getCapabilities,
  getDocumentMetadata,
  isNativeDesktop,
  openDocument,
  renderPage,
  sanitizeDocument,
  saveCopy,
  searchDocument,
  startCombine,
  startConvertToPdf,
  startDecryptPdf,
  startEncryptPdf,
  startExportPdf,
  startExtractPages,
  startReorderPages,
  startRotatePages,
  startSplitPages,
  startOcr,
  startOptimize,
  updateDocumentMetadata,
} from "./lib/native";
import { canRunTool } from "./data/tools";
import type {
  AccessibilityReport,
  Capabilities,
  CompareReport,
  DocumentMetadata,
  DocumentSummary,
  JobStatus,
  RecentDocument,
  RenderResult,
  SanitizeOptions,
  SearchHit,
  ToolId,
} from "./types";

const RECENTS_KEY = "seven-reader:recents:v1";

const emptyCapabilities: Capabilities = {
  pdf_engine: { available: false },
  qpdf: { available: false },
  ocr: { available: false },
  office: { available: false },
  ghostscript: { available: false },
  scanner: { available: false },
  printing: { available: false },
  certificates: { available: false },
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

export default function App() {
  const native = isNativeDesktop();
  const [splash, setSplash] = useState(true);
  const [leavingSplash, setLeavingSplash] = useState(false);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(native ? emptyCapabilities : null);
  const [document, setDocument] = useState<DocumentSummary | null>(null);
  const [rendered, setRendered] = useState<RenderResult | null>(null);
  const [page, setPage] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [recents, setRecents] = useState<RecentDocument[]>(loadRecents);
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const [jobs, setJobs] = useState<Record<string, JobStatus>>({});
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
      if (payload.state === "completed") setNotice("Operação concluída com sucesso.");
      if (payload.state === "failed") setNotice(payload.error ?? "A operação falhou.");
      if (payload.state === "cancelled") setNotice("Operação cancelada.");
    }).then((unlisten) => { dispose = unlisten; });
    return () => dispose?.();
  }, [native]);

  const activeJobs = useMemo(
    () => Object.values(jobs).filter((job) => job.state === "queued" || job.state === "running"),
    [jobs],
  );

  const rememberRecent = (summary: DocumentSummary) => {
    setRecents((current) => {
      const next: RecentDocument[] = [
        {
          path: summary.path,
          name: summary.name,
          pageCount: summary.pageCount,
          lastOpenedAt: Date.now(),
        },
        ...current.filter((item) => item.path !== summary.path),
      ].slice(0, 20);
      localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
      return next;
    });
  };

  const openPath = async (path: string) => {
    try {
      const summary = await openDocument(path);
      setDocument(summary);
      setPage(0);
      setZoom(100);
      setSearchHits([]);
      setRendered(null);
      rememberRecent(summary);
      const first = await renderPage(summary.id, 0, 1400);
      setRendered(first);
    } catch (error) {
      const text = errorMessage(error);
      setNotice(text);
      await message(text, { title: "Seven Reader", kind: "error" });
    }
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

  const closeCurrent = async () => {
    if (document) {
      try { await closeDocument(document.id); } catch { /* state cleanup still proceeds */ }
    }
    setDocument(null);
    setRendered(null);
    setSearchHits([]);
  };

  const render = async (nextPage: number, nextZoom: number) => {
    if (!document) return;
    const boundedPage = Math.max(0, Math.min(document.pageCount - 1, nextPage));
    const boundedZoom = Math.max(25, Math.min(400, nextZoom));
    setPage(boundedPage);
    setZoom(boundedZoom);
    const targetWidth = Math.max(900, Math.min(6000, Math.round(1400 * (boundedZoom / 100))));
    try {
      const next = await renderPage(document.id, boundedPage, targetWidth);
      setRendered(next);
    } catch (error) {
      setNotice(errorMessage(error));
    }
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
    if (document) return document.path;
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
    if (!canRunTool(tool, capabilities)) {
      setNotice("Esta ferramenta ainda não está habilitada porque sua implementação real não está disponível.");
      return;
    }

    try {
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

      if (tool === "scan-ocr") {
        const input = await pickInputPdf();
        if (!input) return;
        const output = await save({
          title: "Salvar PDF com OCR",
          defaultPath: "Seven-Reader-OCR.pdf",
          filters: [{ name: "Documento PDF", extensions: ["pdf"] }],
        });
        if (!output) return;
        const started = await startOcr(input, output);
        setNotice(`OCR iniciado · job ${started.jobId.slice(0, 8)}`);
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

  const runPageOperation = async (
    operation: PageOperation,
    pageExpression: string,
    angle: 90 | 180 | 270,
    pagesPerFile: number,
  ) => {
    const input = await pickInputPdf();
    if (!input) return;

    const suffix =
      operation === "extract" ? "extraido"
        : operation === "rotate" ? "girado"
          : operation === "split" ? "dividido"
            : "organizado";
    const output = await save({
      title:
        operation === "extract" ? "Salvar páginas extraídas"
          : operation === "rotate" ? "Salvar PDF girado"
            : operation === "split" ? "Nome base dos PDFs divididos"
              : "Salvar PDF reorganizado",
      defaultPath: `Seven-Reader-${suffix}.pdf`,
      filters: [{ name: "Documento PDF", extensions: ["pdf"] }],
    });
    if (!output) return;

    try {
      const started =
        operation === "extract"
          ? await startExtractPages(input, output, pageExpression)
          : operation === "rotate"
            ? await startRotatePages(input, output, pageExpression, angle)
            : operation === "split"
              ? await startSplitPages(input, output, pagesPerFile)
              : await startReorderPages(input, output, pageExpression);
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
      const started = await startEncryptPdf(document.path, output, userPassword, ownerPassword);
      setSecurityMode(null);
      setNotice(`Criptografia iniciada · job ${started.jobId.slice(0, 8)}`);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runDecrypt = async (output: string, password: string) => {
    if (!document) return;
    try {
      const started = await startDecryptPdf(document.path, output, password);
      setSecurityMode(null);
      setNotice(`Descriptografia iniciada · job ${started.jobId.slice(0, 8)}`);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runSanitize = async (output: string, options: SanitizeOptions) => {
    if (!document) return;
    try {
      const report = await sanitizeDocument(document.path, output, options);
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
      setMetadata(await getDocumentMetadata(document.path));
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setReportLoading(false);
    }
  };

  const saveMetadata = async (output: string, update: { title: string; author: string; subject: string; keywords: string }) => {
    if (!document) return;
    try {
      await updateDocumentMetadata(document.path, output, update);
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
      setAccessibilityReport(await getAccessibilityReport(document.path));
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
      setCompareReport(await compareDocuments(document.path, other));
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setReportLoading(false);
    }
  };

  const status = (
    <>
      {notice && (
        <button className="global-notice" onClick={() => setNotice(null)} aria-label="Fechar aviso">
          {notice}
        </button>
      )}
      {conversionOpen && (
        <ConversionDialog
          capabilities={capabilities}
          currentPdf={document?.path}
          onClose={() => setConversionOpen(false)}
          onConvertToPdf={(input, outputDirectory) => void runConvertToPdf(input, outputDirectory)}
          onExport={(input, output, format, dpi) => void runExport(input, output, format, dpi)}
        />
      )}
      {securityMode && document && (
        <SecurityDialog
          mode={securityMode}
          currentPdf={document.path}
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
          onClose={() => setCreateDialogOpen(false)}
          onCreate={(pageSize, pageCount) => void createBlankPdf(pageSize, pageCount)}
        />
      )}
      {organizerOpen && (
        <PageOrganizerDialog
          fileName={document?.name ?? "Selecionar PDF"}
          pageCount={document?.pageCount}
          onClose={() => setOrganizerOpen(false)}
          onRun={(operation, pageExpression, angle, pagesPerFile) => void runPageOperation(operation, pageExpression, angle, pagesPerFile)}
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
          rendered={rendered}
          capabilities={capabilities}
          searchHits={searchHits}
          page={page}
          zoom={zoom}
          onHome={() => void closeCurrent()}
          onClose={() => void closeCurrent()}
          onOpen={() => void choosePdf()}
          onSaveAs={() => void saveAs()}
          onRender={(nextPage, nextZoom) => void render(nextPage, nextZoom)}
          onSearch={(query) => void runSearch(query)}
          onTool={(tool) => void selectTool(tool)}
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
        onOpen={() => void choosePdf()}
        onOpenRecent={(path) => void openPath(path)}
        onClearRecent={() => {
          localStorage.removeItem(RECENTS_KEY);
          setRecents([]);
          setNotice("Lista de recentes limpa.");
        }}
        onTool={(tool) => void selectTool(tool)}
      />
      {status}
    </>
  );
}
