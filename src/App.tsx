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
import { OcrDialog } from "./components/OcrDialog";
import { CommentsDialog } from "./components/CommentsDialog";
import { FormsDialog } from "./components/FormsDialog";
import { SignatureDialog } from "./components/SignatureDialog";
import { EditingDialog } from "./components/EditingDialog";
import {
  addAnnotation,
  cancelJob,
  closeDocument,
  compareDocuments,
  createFormField,
  createPdfFromImages,
  createBlankDocument,
  getAccessibilityReport,
  getCapabilities,
  getDocumentMetadata,
  isNativeDesktop,
  listAnnotations,
  listFormFields,
  openDocument,
  renderPage,
  deleteAnnotation,
  fillFormFields,
  editAddImage,
  editAddLink,
  editAddText,
  editOverlayText,
  editReplaceText,
  editSetBackground,
  reviewOcrPage,
  sanitizeDocument,
  scanPageToPdf,
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
  JobStatus,
  LinkPlacement,
  NewFormField,
  OcrOptions,
  OcrWord,
  OverlayTextOptions,
  RecentDocument,
  RenderResult,
  SanitizeOptions,
  SearchHit,
  SignRequest,
  SignatureValidationReport,
  TextPlacement,
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
  pdftotext: { available: false },
  openssl: { available: false },
  tesseract: { available: false },
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







  const saveEditedAndOpen = async (operation: () => Promise<void>, output: string, messageText: string) => {
    try {
      await operation();
      setEditingOpen(false);
      setNotice(messageText);
      await openPath(output);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runEditAddText = (output: string, placement: TextPlacement) =>
    saveEditedAndOpen(() => editAddText(document!.path, output, placement), output, "Texto inserido no PDF.");

  const runEditReplaceText = async (output: string, find: string, replacement: string, allPages: boolean) => {
    if (!document) return;
    try {
      const report = await editReplaceText(document.path, output, find, replacement, allPages, page);
      setEditingOpen(false);
      setNotice(`${report.replacements} substituição(ões) em ${report.pagesChanged} página(s).`);
      await openPath(output);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runEditAddImage = (output: string, placement: ImagePlacement) =>
    saveEditedAndOpen(() => editAddImage(document!.path, output, placement), output, "Imagem inserida no PDF.");

  const runEditAddLink = (output: string, link: LinkPlacement) =>
    saveEditedAndOpen(() => editAddLink(document!.path, output, link), output, "Link inserido no PDF.");

  const runEditOverlay = (output: string, options: OverlayTextOptions) =>
    saveEditedAndOpen(() => editOverlayText(document!.path, output, options), output, "Conteúdo aplicado às páginas.");

  const runEditBackground = (output: string, options: BackgroundOptions) =>
    saveEditedAndOpen(() => editSetBackground(document!.path, output, options), output, "Fundo aplicado às páginas.");

  const runElectronicSignature = async (output: string, annotation: AnnotationInput) => {
    if (!document) return;
    try {
      await addAnnotation(document.path, output, annotation);
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
      await signDocument(document.path, output, request);
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
      setSignatureValidation(await validateSignatures(document.path, trustDirectory, allowOnline));
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
      setAnnotations(await listAnnotations(document.path));
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setAnnotationsLoading(false);
    }
  };

  const runAddAnnotation = async (output: string, annotation: AnnotationInput) => {
    if (!document) return;
    try {
      await addAnnotation(document.path, output, annotation);
      setCommentsOpen(false);
      setNotice("Comentário persistido no PDF.");
      await openPath(output);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runDeleteAnnotation = async (output: string, objectId: string) => {
    if (!document) return;
    try {
      await deleteAnnotation(document.path, output, objectId);
      setCommentsOpen(false);
      setNotice("Comentário removido da cópia.");
      await openPath(output);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const reloadFormFields = async () => {
    if (!document) return;
    try {
      setFormsLoading(true);
      setFormFields(await listFormFields(document.path));
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setFormsLoading(false);
    }
  };

  const runFillForm = async (output: string, values: FormValue[]) => {
    if (!document) return;
    try {
      const changed = await fillFormFields(document.path, output, values);
      setFormsOpen(false);
      setNotice(`${changed} campo(s) preenchido(s).`);
      await openPath(output);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const runCreateFormField = async (output: string, field: NewFormField) => {
    if (!document) return;
    try {
      await createFormField(document.path, output, field);
      setFormsOpen(false);
      setNotice(`Campo "${field.name}" criado no AcroForm.`);
      await openPath(output);
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

  const runAdvancedOcr = async (output: string, options: OcrOptions) => {
    if (!document) return;
    try {
      const started = await startOcrAdvanced(document.path, output, options);
      setOcrOpen(false);
      setNotice(`OCR iniciado · job ${started.jobId.slice(0, 8)}`);
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
      {editingOpen && document && (
        <EditingDialog
          documentPath={document.path}
          pageIndex={page}
          pageCount={document.pageCount}
          onClose={() => setEditingOpen(false)}
          onAddText={(output, placement) => void runEditAddText(output, placement)}
          onReplaceText={(output, find, replacement, allPages) => void runEditReplaceText(output, find, replacement, allPages)}
          onAddImage={(output, placement) => void runEditAddImage(output, placement)}
          onAddLink={(output, link) => void runEditAddLink(output, link)}
          onOverlay={(output, options) => void runEditOverlay(output, options)}
          onBackground={(output, options) => void runEditBackground(output, options)}
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
          documentPath={document.path}
          pageIndex={page}
          annotations={annotations}
          loading={annotationsLoading}
          onClose={() => setCommentsOpen(false)}
          onReload={() => void reloadAnnotations()}
          onAdd={(output, annotation) => void runAddAnnotation(output, annotation)}
          onDelete={(output, objectId) => void runDeleteAnnotation(output, objectId)}
        />
      )}
      {formsOpen && document && (
        <FormsDialog
          documentPath={document.path}
          pageIndex={page}
          fields={formFields}
          loading={formsLoading}
          onClose={() => setFormsOpen(false)}
          onReload={() => void reloadFormFields()}
          onFill={(output, values) => void runFillForm(output, values)}
          onCreate={(output, field) => void runCreateFormField(output, field)}
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
          onReview={(language, threshold) => void reviewCurrentOcrPage(language, threshold)}
          onScan={(output, dpi) => void runScan(output, dpi)}
        />
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
          onCreateImages={(inputs, dpi) => void createImagesPdf(inputs, dpi)}
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
