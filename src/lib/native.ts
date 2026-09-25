import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type {
  Capabilities,
  DocumentSummary,
  AccessibilityReport,
  CompareReport,
  DocumentMetadata,
  JobStart,
  MetadataUpdate,
  OcrOptions,
  OcrWord,
  RenderResult,
  SanitizeOptions,
  SanitizeReport,
  SearchHit,
} from "../types";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export const isNativeDesktop = (): boolean =>
  typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);

export async function getCapabilities(): Promise<Capabilities | null> {
  if (!isNativeDesktop()) return null;
  return invoke<Capabilities>("get_capabilities");
}

export async function openDocument(path: string, password?: string): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("open_document", { path, password: password ?? null });
}

export async function closeDocument(documentId: string): Promise<void> {
  await invoke("close_document", { documentId });
}

export async function renderPage(
  documentId: string,
  pageIndex: number,
  targetWidth: number,
): Promise<RenderResult> {
  return invoke<RenderResult>("render_page", { documentId, pageIndex, targetWidth });
}

export async function searchDocument(documentId: string, query: string): Promise<SearchHit[]> {
  return invoke<SearchHit[]>("search_document", { documentId, query });
}

export async function saveCopy(documentId: string, destination: string): Promise<void> {
  await invoke("save_document_as", { documentId, destination });
}

export async function createBlankDocument(
  destination: string,
  pageSize: "a4" | "letter" | "legal",
  pageCount: number,
): Promise<void> {
  await invoke("create_blank_document", { destination, pageSize, pageCount });
}

export async function createPdfFromImages(
  inputs: string[],
  destination: string,
  dpi: number,
): Promise<void> {
  await invoke("create_pdf_from_images", { inputs, destination, dpi });
}

export async function startOcrAdvanced(
  input: string,
  output: string,
  options: OcrOptions,
): Promise<JobStart> {
  return invoke<JobStart>("start_ocr_advanced", { input, output, options });
}

export async function reviewOcrPage(
  documentId: string,
  pageIndex: number,
  language: string,
  threshold: number,
): Promise<OcrWord[]> {
  return invoke<OcrWord[]>("review_ocr_page", { documentId, pageIndex, language, threshold });
}

export async function scanPageToPdf(destination: string, dpi: number): Promise<void> {
  await invoke("scan_page_to_pdf", { destination, dpi });
}

export async function startCombine(inputs: string[], output: string): Promise<JobStart> {
  return invoke<JobStart>("start_combine_documents", { inputs, output });
}

export async function startSplitPages(
  input: string,
  output: string,
  pagesPerFile: number,
): Promise<JobStart> {
  return invoke<JobStart>("start_split_pages", { input, output, pagesPerFile });
}

export async function startExtractPages(
  input: string,
  output: string,
  pageRange: string,
): Promise<JobStart> {
  return invoke<JobStart>("start_extract_pages", { input, output, pageRange });
}

export async function startReorderPages(
  input: string,
  output: string,
  pageOrder: string,
): Promise<JobStart> {
  return invoke<JobStart>("start_reorder_pages", { input, output, pageOrder });
}

export async function startRotatePages(
  input: string,
  output: string,
  pageRange: string,
  angle: -270 | -180 | -90 | 0 | 90 | 180 | 270,
): Promise<JobStart> {
  return invoke<JobStart>("start_rotate_pages", { input, output, pageRange, angle });
}

export async function startOcr(
  input: string,
  output: string,
  language = "por+eng",
): Promise<JobStart> {
  return invoke<JobStart>("start_ocr", { input, output, language });
}

export async function startOptimize(
  input: string,
  output: string,
  preset = "default",
): Promise<JobStart> {
  return invoke<JobStart>("start_optimize_pdf", { input, output, preset });
}

export async function getDocumentMetadata(path: string): Promise<DocumentMetadata> {
  return invoke<DocumentMetadata>("get_document_metadata", { path });
}

export async function updateDocumentMetadata(
  input: string,
  output: string,
  update: MetadataUpdate,
): Promise<void> {
  await invoke("update_document_metadata", { input, output, update });
}

export async function sanitizeDocument(
  input: string,
  output: string,
  options: SanitizeOptions,
): Promise<SanitizeReport> {
  return invoke<SanitizeReport>("sanitize_document", { input, output, options });
}

export async function getAccessibilityReport(path: string): Promise<AccessibilityReport> {
  return invoke<AccessibilityReport>("get_accessibility_report", { path });
}

export async function compareDocuments(left: string, right: string): Promise<CompareReport> {
  return invoke<CompareReport>("compare_documents", { left, right });
}

export async function startEncryptPdf(
  input: string,
  output: string,
  userPassword: string,
  ownerPassword: string,
): Promise<JobStart> {
  return invoke<JobStart>("start_encrypt_pdf", { input, output, userPassword, ownerPassword });
}

export async function startDecryptPdf(
  input: string,
  output: string,
  password: string,
): Promise<JobStart> {
  return invoke<JobStart>("start_decrypt_pdf", { input, output, password });
}

export async function startConvertToPdf(
  input: string,
  outputDirectory: string,
): Promise<JobStart> {
  return invoke<JobStart>("start_convert_to_pdf", { input, outputDirectory });
}

export async function startExportPdf(
  input: string,
  output: string,
  format: "png" | "jpeg" | "tiff" | "txt" | "ps",
  dpi?: number,
): Promise<JobStart> {
  return invoke<JobStart>("start_export_pdf", { input, output, format, dpi: dpi ?? null });
}

export async function cancelJob(jobId: string): Promise<void> {
  await invoke("cancel_job", { jobId });
}

export function nativeAssetUrl(path: string): string {
  return isNativeDesktop() ? convertFileSrc(path) : path;
}
