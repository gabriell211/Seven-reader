import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type {
  Capabilities,
  DocumentSummary,
  AccessibilityReport,
  AdvancedPdfReport,
  AdvancedSearchHit,
  AdvancedSearchOptions,
  AnnotationInfo,
  AnnotationInput,
  CompareReport,
  DocumentMetadata,
  JobStart,
  BackgroundOptions,
  BookmarkInput,
  FormFieldInfo,
  FormValue,
  ImagePlacement,
  InkAnnotationInput,
  LinkPlacement,
  MetadataUpdate,
  NewFormField,
  NormalizedRect,
  OcrOptions,
  OcrWord,
  OverlayTextOptions,
  RedactionArea,
  RedactionReport,
  RenderResult,
  ReplaceTextReport,
  SanitizeOptions,
  SignRequest,
  SignatureValidationReport,
  SanitizeReport,
  SessionFormFillResult,
  SessionReplaceTextResult,
  TextPlacement,
  TextSelectionResult,
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

export async function searchDocumentAdvanced(
  documentId: string,
  options: AdvancedSearchOptions,
): Promise<AdvancedSearchHit[]> {
  return invoke<AdvancedSearchHit[]>("search_document_advanced", { documentId, options });
}

export async function extractTextInRect(
  documentId: string,
  pageIndex: number,
  rect: NormalizedRect,
): Promise<TextSelectionResult> {
  return invoke<TextSelectionResult>("extract_text_in_rect", { documentId, pageIndex, rect });
}

export async function cropPageSelection(
  documentId: string,
  pageIndex: number,
  targetWidth: number,
  rect: NormalizedRect,
): Promise<string> {
  return invoke<string>("crop_page_selection", { documentId, pageIndex, targetWidth, rect });
}

export async function saveCopy(documentId: string, destination: string): Promise<void> {
  await invoke("save_document_as", { documentId, destination });
}

export async function saveDocument(documentId: string): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("save_document", { documentId });
}

export async function undoDocument(documentId: string): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("undo_document", { documentId });
}

export async function redoDocument(documentId: string): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("redo_document", { documentId });
}

export async function sessionAddAnnotation(
  documentId: string,
  annotation: AnnotationInput,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_add_annotation", { documentId, annotation });
}

export async function sessionDeleteAnnotation(
  documentId: string,
  objectId: string,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_delete_annotation", { documentId, objectId });
}

export async function sessionAddInk(
  documentId: string,
  ink: InkAnnotationInput,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_add_ink", { documentId, ink });
}

export async function sessionAddMarkup(
  documentId: string,
  pageIndex: number,
  kind: "highlight" | "underline" | "strikeout",
  author: string,
  rect: NormalizedRect,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_add_markup", {
    documentId, pageIndex, kind, author, rect,
  });
}

export async function sessionEditAddText(
  documentId: string,
  placement: TextPlacement,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_edit_add_text", { documentId, placement });
}

export async function sessionEditReplaceText(
  documentId: string,
  find: string,
  replacement: string,
  allPages: boolean,
  pageIndex: number,
): Promise<SessionReplaceTextResult> {
  return invoke<SessionReplaceTextResult>("session_edit_replace_text", {
    documentId, find, replacement, allPages, pageIndex,
  });
}

export async function sessionEditAddImage(
  documentId: string,
  placement: ImagePlacement,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_edit_add_image", { documentId, placement });
}

export async function sessionEditAddLink(
  documentId: string,
  link: LinkPlacement,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_edit_add_link", { documentId, link });
}

export async function sessionEditOverlayText(
  documentId: string,
  options: OverlayTextOptions,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_edit_overlay_text", { documentId, options });
}

export async function sessionEditSetBackground(
  documentId: string,
  options: BackgroundOptions,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_edit_set_background", { documentId, options });
}

export async function sessionFillFormFields(
  documentId: string,
  values: FormValue[],
): Promise<SessionFormFillResult> {
  return invoke<SessionFormFillResult>("session_fill_form_fields", { documentId, values });
}

export async function sessionCreateFormField(
  documentId: string,
  field: NewFormField,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_create_form_field", { documentId, field });
}

export async function printDocument(input: string): Promise<JobStart> {
  return invoke<JobStart>("start_print_document", { input });
}

export async function revealInFileManager(path: string): Promise<void> {
  await invoke("reveal_in_file_manager", { path });
}

export async function listPdfFilesInFolder(
  path: string,
  recursive = false,
  limit = 500,
): Promise<string[]> {
  return invoke<string[]>("list_pdf_files_in_folder", { path, recursive, limit });
}

export async function createBlankDocument(
  destination: string,
  pageSize: "a4" | "letter" | "legal",
  pageCount: number,
): Promise<void> {
  await invoke("create_blank_document", { destination, pageSize, pageCount });
}

export async function createPdfFromText(
  destination: string,
  text: string,
  pageSize: "a4" | "letter" | "legal",
  fontSize: number,
): Promise<void> {
  await invoke("create_pdf_from_text", { destination, text, pageSize, fontSize });
}

export async function createPdfFromClipboardImage(
  destination: string,
  rgba: number[],
  width: number,
  height: number,
  dpi: number,
): Promise<void> {
  await invoke("create_pdf_from_clipboard_image", { destination, rgba, width, height, dpi });
}

export async function startWebToPdf(url: string, output: string): Promise<JobStart> {
  return invoke<JobStart>("start_web_to_pdf", { url, output });
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

export async function startBatchOcr(
  inputs: string[],
  outputDirectory: string,
  options: OcrOptions,
): Promise<JobStart> {
  return invoke<JobStart>("start_batch_ocr", { inputs, outputDirectory, options });
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

export async function startDeletePages(
  input: string,
  output: string,
  pageRange: string,
): Promise<JobStart> {
  return invoke<JobStart>("start_delete_pages", { input, output, pageRange });
}

export async function startInsertPages(
  input: string,
  output: string,
  source: string,
  sourceRange: string,
  insertAfter: number,
): Promise<JobStart> {
  return invoke<JobStart>("start_insert_pages", { input, output, source, sourceRange, insertAfter });
}

export async function startReplacePages(
  input: string,
  output: string,
  source: string,
  targetStart: number,
  sourceStart: number,
  count: number,
): Promise<JobStart> {
  return invoke<JobStart>("start_replace_pages", {
    input, output, source, targetStart, sourceStart, count,
  });
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

export async function findRedactionMatches(
  input: string,
  query: string,
  matchCase: boolean,
  wholeWord: boolean,
): Promise<RedactionArea[]> {
  return invoke<RedactionArea[]>("find_redaction_matches", {
    input, query, matchCase, wholeWord,
  });
}

export async function applyRedactions(
  input: string,
  output: string,
  areas: RedactionArea[],
): Promise<RedactionReport> {
  return invoke<RedactionReport>("apply_redactions", { input, output, areas });
}

export async function editAddText(
  input: string,
  output: string,
  placement: TextPlacement,
): Promise<void> {
  await invoke("edit_add_text", { input, output, placement });
}

export async function editReplaceText(
  input: string,
  output: string,
  find: string,
  replacement: string,
  allPages: boolean,
  pageIndex: number,
): Promise<ReplaceTextReport> {
  return invoke<ReplaceTextReport>("edit_replace_text", {
    input, output, find, replacement, allPages, pageIndex,
  });
}

export async function editAddImage(
  input: string,
  output: string,
  placement: ImagePlacement,
): Promise<void> {
  await invoke("edit_add_image", { input, output, placement });
}

export async function editAddLink(
  input: string,
  output: string,
  link: LinkPlacement,
): Promise<void> {
  await invoke("edit_add_link", { input, output, link });
}

export async function editOverlayText(
  input: string,
  output: string,
  options: OverlayTextOptions,
): Promise<void> {
  await invoke("edit_overlay_text", { input, output, options });
}

export async function editSetBackground(
  input: string,
  output: string,
  options: BackgroundOptions,
): Promise<void> {
  await invoke("edit_set_background", { input, output, options });
}

export async function inspectAdvancedPdf(path: string): Promise<AdvancedPdfReport> {
  return invoke<AdvancedPdfReport>("inspect_advanced_pdf", { path });
}

export async function addPdfAttachment(
  input: string,
  output: string,
  filePath: string,
  displayName: string,
  description: string,
): Promise<void> {
  await invoke("add_pdf_attachment", { input, output, filePath, displayName, description });
}

export async function extractPdfAttachment(
  input: string,
  objectId: string,
  destination: string,
): Promise<void> {
  await invoke("extract_pdf_attachment", { input, objectId, destination });
}

export async function addPdfBookmark(
  input: string,
  output: string,
  bookmark: BookmarkInput,
): Promise<void> {
  await invoke("add_pdf_bookmark", { input, output, bookmark });
}

export async function renamePdfBookmark(
  input: string,
  output: string,
  objectId: string,
  title: string,
): Promise<void> {
  await invoke("rename_pdf_bookmark", { input, output, objectId, title });
}

export async function setPdfLayerVisibility(
  input: string,
  output: string,
  objectId: string,
  visible: boolean,
): Promise<void> {
  await invoke("set_pdf_layer_visibility", { input, output, objectId, visible });
}

export async function listAnnotations(path: string): Promise<AnnotationInfo[]> {
  return invoke<AnnotationInfo[]>("list_annotations", { path });
}

export async function addAnnotation(
  input: string,
  output: string,
  annotation: AnnotationInput,
): Promise<void> {
  await invoke("add_annotation", { input, output, annotation });
}

export async function addInkAnnotation(
  input: string,
  output: string,
  ink: InkAnnotationInput,
): Promise<void> {
  await invoke("add_ink_annotation", { input, output, ink });
}

export async function deleteAnnotation(
  input: string,
  output: string,
  objectId: string,
): Promise<void> {
  await invoke("delete_annotation", { input, output, objectId });
}

export async function listFormFields(path: string): Promise<FormFieldInfo[]> {
  return invoke<FormFieldInfo[]>("list_form_fields", { path });
}

export async function fillFormFields(
  input: string,
  output: string,
  values: FormValue[],
): Promise<number> {
  return invoke<number>("fill_form_fields", { input, output, values });
}

export async function createFormField(
  input: string,
  output: string,
  field: NewFormField,
): Promise<void> {
  await invoke("create_form_field", { input, output, field });
}

export async function signDocument(
  input: string,
  output: string,
  request: SignRequest,
): Promise<void> {
  await invoke("sign_document", { input, output, request });
}

export async function validateSignatures(
  input: string,
  trustDirectory?: string,
  allowOnline = false,
): Promise<SignatureValidationReport> {
  return invoke<SignatureValidationReport>("validate_signatures", {
    input,
    trustDirectory: trustDirectory ?? null,
    allowOnline,
  });
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

export async function startBatchConvertToPdf(
  inputs: string[],
  outputDirectory: string,
): Promise<JobStart> {
  return invoke<JobStart>("start_batch_convert_to_pdf", { inputs, outputDirectory });
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
