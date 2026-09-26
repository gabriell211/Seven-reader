import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type {
  Capabilities,
  WatchFolderConfig,
  ConversionPreset,
  ConversionOptions,
  CatalogHit,
  CatalogSummary,
  DocumentSummary,
  ExternalFileStatus,
  DuplicateFieldRequest,
  AccessibilityReport,
  AccessibilityProperties,
  AutoTagResult,
  StructureTagInfo,
  StructureTagUpdate,
  AdvancedPdfReport,
  ArticleInfo,
  ArticleMetadataUpdate,
  NewArticleBox,
  ArticleBoxUpdate,
  AdvancedSearchHit,
  AdvancedSearchOptions,
  AnnotationInfo,
  AnnotationInput,
  CompareReport,
  CompareOptions,
  DocumentMetadata,
  JobStart,
  BackgroundOptions,
  BookmarkInput,
  BookmarkUpdate,
  GeneratedBookmarksResult,
  FormFieldInfo,
  FieldActionInfo,
  FieldActionInput,
  FormFieldUpdate,
  FormValue,
  ImagePlacement,
  IsoValidationReport,
  InteractiveAssetInfo,
  GeospatialViewportInfo,
  GeospatialCoordinate,
  GeospatialLocation,
  GeospatialMeasurementResult,
  ImageObjectInfo,
  InkAnnotationInput,
  LinkPlacement,
  LinkInfo,
  LinkUpdate,
  MeasurementInfo,
  MeasurementInput,
  SessionMeasurementResult,
  ManagedElementInfo,
  PageLabelOptions,
  PagePreflight,
  PageTransferResult,
  MetadataUpdate,
  NamedDestinationInfo,
  NewFormField,
  NormalizedRect,
  OcrOptions,
  OcrLanguageDetection,
  OcrWord,
  OcrReviewResult,
  OptimizationAudit,
  OptimizeOptions,
  OverlayTextOptions,
  PdfActionInfo,
  PageActionInfo,
  PageActionInput,
  ActionExecution,
  PrintPreflightReport,
  PrinterInfo,
  PrintOptions,
  PortfolioPreview,
  PortfolioSearchHit,
  PageBoxUpdate,
  PageGeometryUpdate,
  PdfEncryptionOptions,
  RedactionArea,
  RedactionReport,
  ReviewTransferReport,
  SessionReviewImportResult,
  RenderResult,
  ReplaceTextReport,
  SanitizeAnalysis,
  SanitizeOptions,
  SignRequest,
  SignatureValidationReport,
  SanitizeReport,
  ScannedPage,
  ScannerInfo,
  ScanFinalizeResult,
  SessionFormFillResult,
  SessionFlattenLayersResult,
  SessionPortfolioFolderResult,
  SessionPortfolioDirectoryImportResult,
  SessionReplaceTextResult,
  TextPlacement,
  TextSelectionResult,
  SearchHit,
  SearchOccurrence,
  StampInput,
} from "../types";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export const isNativeDesktop = (): boolean =>
  typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);

export async function buildCatalog(name: string, inputs: string[]): Promise<CatalogSummary> {
  return invoke<CatalogSummary>("build_catalog", { name, inputs });
}

export async function listCatalogs(): Promise<CatalogSummary[]> {
  return invoke<CatalogSummary[]>("list_catalogs");
}

export async function searchCatalog(
  id: string,
  query: string,
  matchCase = false,
): Promise<CatalogHit[]> {
  return invoke<CatalogHit[]>("search_catalog", { id, query, matchCase });
}

export async function deleteCatalog(id: string): Promise<void> {
  await invoke("delete_catalog", { id });
}

export async function exportReviewXfdf(
  input: string,
  destination: string,
): Promise<ReviewTransferReport> {
  return invoke<ReviewTransferReport>("export_review_xfdf", { input, destination });
}

export async function sessionImportReviewXfdf(
  documentId: string,
  xfdf: string,
): Promise<SessionReviewImportResult> {
  return invoke<SessionReviewImportResult>("session_import_review_xfdf", { documentId, xfdf });
}

export async function listPdfArticles(documentId: string): Promise<ArticleInfo[]> {
  return invoke<ArticleInfo[]>("list_pdf_articles", { documentId });
}

export async function sessionAddPdfArticleBox(
  documentId: string,
  request: NewArticleBox,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_add_pdf_article_box", { documentId, request });
}

export async function sessionUpdatePdfArticle(
  documentId: string,
  update: ArticleMetadataUpdate,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_update_pdf_article", { documentId, update });
}

export async function sessionUpdatePdfArticleBox(
  documentId: string,
  update: ArticleBoxUpdate,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_update_pdf_article_box", { documentId, update });
}

export async function sessionMovePdfArticleBox(
  documentId: string,
  objectId: string,
  direction: "up" | "down" | "first" | "last",
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_move_pdf_article_box", { documentId, objectId, direction });
}

export async function sessionDeletePdfArticleBox(
  documentId: string,
  objectId: string,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_delete_pdf_article_box", { documentId, objectId });
}

export async function sessionDeletePdfArticle(
  documentId: string,
  objectId: string,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_delete_pdf_article", { documentId, objectId });
}

export async function sessionMergePdfArticles(
  documentId: string,
  targetId: string,
  sourceId: string,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_merge_pdf_articles", { documentId, targetId, sourceId });
}

export async function listInteractiveAssets(
  documentId: string,
): Promise<InteractiveAssetInfo[]> {
  return invoke<InteractiveAssetInfo[]>("list_interactive_assets", { documentId });
}

export async function extractInteractiveAsset(
  documentId: string,
  objectId: string,
  destination: string,
): Promise<number> {
  return invoke<number>("extract_interactive_asset", { documentId, objectId, destination });
}

export async function materializeInteractiveMedia(
  documentId: string,
  objectId: string,
  displayName: string,
): Promise<string> {
  return invoke<string>("materialize_interactive_media", {
    documentId,
    objectId,
    displayName,
  });
}

export async function listGeospatialViewports(
  documentId: string,
): Promise<GeospatialViewportInfo[]> {
  return invoke<GeospatialViewportInfo[]>("list_geospatial_viewports", { documentId });
}

export async function resolveGeospatialCoordinate(
  documentId: string,
  pageIndex: number,
  normalizedX: number,
  normalizedY: number,
): Promise<GeospatialCoordinate> {
  return invoke<GeospatialCoordinate>("resolve_geospatial_coordinate", {
    documentId, pageIndex, normalizedX, normalizedY,
  });
}

export async function locateGeospatialCoordinate(
  documentId: string,
  pageIndex: number,
  first: number,
  second: number,
): Promise<GeospatialLocation> {
  return invoke<GeospatialLocation>("locate_geospatial_coordinate", {
    documentId,
    pageIndex,
    first,
    second,
  });
}

export async function measureGeospatial(
  documentId: string,
  pageIndex: number,
  kind: "distance" | "perimeter" | "area",
  normalizedPoints: Array<[number, number]>,
): Promise<GeospatialMeasurementResult> {
  return invoke<GeospatialMeasurementResult>("measure_geospatial", {
    documentId,
    pageIndex,
    kind,
    normalizedPoints,
  });
}


export async function startWatchFolder(config: WatchFolderConfig): Promise<WatchFolderConfig> {
  return invoke<WatchFolderConfig>("start_watch_folder", { config });
}

export async function stopWatchFolder(id: string): Promise<void> {
  await invoke("stop_watch_folder", { id });
}

export async function listWatchFolders(): Promise<WatchFolderConfig[]> {
  return invoke<WatchFolderConfig[]>("list_watch_folders");
}

export async function importConversionPresets(path: string): Promise<ConversionPreset[]> {
  return invoke<ConversionPreset[]>("import_conversion_presets", { path });
}

export async function exportConversionPresets(path: string, presets: ConversionPreset[]): Promise<void> {
  await invoke("export_conversion_presets", { path, presets });
}

export async function getCapabilities(): Promise<Capabilities | null> {
  if (!isNativeDesktop()) return null;
  return invoke<Capabilities>("get_capabilities");
}

export async function openDocument(path: string, password?: string): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("open_document", { path, password: password ?? null });
}

export async function restoreDocumentSession(
  path: string,
  workingPath: string,
  password?: string,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("restore_document_session", {
    path,
    workingPath,
    password: password ?? null,
  });
}

export async function sessionTransferPages(
  sourceDocumentId: string,
  targetDocumentId: string,
  pageRange: string,
  insertAfter: number,
  movePages: boolean,
): Promise<PageTransferResult> {
  return invoke<PageTransferResult>("session_transfer_pages", {
    sourceDocumentId,
    targetDocumentId,
    pageRange,
    insertAfter,
    movePages,
  });
}

export async function getExternalFileStatus(
  documentId: string,
): Promise<ExternalFileStatus> {
  return invoke<ExternalFileStatus>("get_external_file_status", { documentId });
}

export async function reloadDocumentFromSource(
  documentId: string,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("reload_document_from_source", { documentId });
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

export async function renderPages(
  documentId: string,
  pageIndices: number[],
  targetWidth: number,
): Promise<RenderResult[]> {
  return invoke<RenderResult[]>("render_pages", { documentId, pageIndices, targetWidth });
}

export async function searchDocument(documentId: string, query: string): Promise<SearchHit[]> {
  return invoke<SearchHit[]>("search_document", { documentId, query });
}

export async function searchDocumentOccurrences(
  documentId: string,
  query: string,
  matchCase = false,
  wholeWord = false,
): Promise<SearchOccurrence[]> {
  return invoke<SearchOccurrence[]>("search_document_occurrences", {
    documentId,
    query,
    matchCase,
    wholeWord,
  });
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

export async function sessionAddMeasurement(
  documentId: string,
  measurement: MeasurementInput,
): Promise<SessionMeasurementResult> {
  return invoke<SessionMeasurementResult>("session_add_measurement", { documentId, measurement });
}

export async function listMeasurements(documentId: string): Promise<MeasurementInfo[]> {
  return invoke<MeasurementInfo[]>("list_measurements", { documentId });
}

export async function exportMeasurements(
  documentId: string,
  destination: string,
): Promise<number> {
  return invoke<number>("export_measurements", { documentId, destination });
}

export async function sessionAddStamp(
  documentId: string,
  stamp: StampInput,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_add_stamp", { documentId, stamp });
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

export async function sessionCorrectOcrWord(
  documentId: string,
  pageIndex: number,
  recognized: string,
  replacement: string,
  occurrence: number,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_correct_ocr_word", {
    documentId,
    pageIndex,
    recognized,
    replacement,
    occurrence,
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

export async function getImageDimensions(path: string): Promise<[number, number]> {
  return invoke<[number, number]>("get_image_dimensions", { path });
}

export async function listPageImageObjects(
  documentId: string,
  pageIndex: number,
): Promise<ImageObjectInfo[]> {
  return invoke<ImageObjectInfo[]>("list_page_image_objects", { documentId, pageIndex });
}

export async function sessionReplaceImageObject(
  documentId: string,
  pageIndex: number,
  resourceName: string,
  imagePath: string,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_replace_image_object", {
    documentId, pageIndex, resourceName, imagePath,
  });
}

export async function sessionRemoveImageObject(
  documentId: string,
  pageIndex: number,
  resourceName: string,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_remove_image_object", {
    documentId, pageIndex, resourceName,
  });
}

export async function sessionEditAddImage(
  documentId: string,
  placement: ImagePlacement,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_edit_add_image", { documentId, placement });
}

export async function listPdfNamedDestinations(
  documentId: string,
): Promise<NamedDestinationInfo[]> {
  return invoke<NamedDestinationInfo[]>("list_pdf_named_destinations", { documentId });
}

export async function sessionUpsertPdfNamedDestination(
  documentId: string,
  oldName: string | undefined,
  name: string,
  pageIndex: number,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_upsert_pdf_named_destination", {
    documentId, oldName: oldName ?? null, name, pageIndex,
  });
}

export async function sessionRemovePdfNamedDestination(
  documentId: string,
  name: string,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_remove_pdf_named_destination", { documentId, name });
}

export async function listPdfLinks(
  documentId: string,
): Promise<LinkInfo[]> {
  return invoke<LinkInfo[]>("list_pdf_links", { documentId });
}

export async function sessionEditUpdateLink(
  documentId: string,
  update: LinkUpdate,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_edit_update_link", { documentId, update });
}

export async function sessionEditRemoveLink(
  documentId: string,
  pageIndex: number,
  objectId: string,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_edit_remove_link", {
    documentId, pageIndex, objectId,
  });
}

export async function sessionEditAddLink(
  documentId: string,
  link: LinkPlacement,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_edit_add_link", { documentId, link });
}

export async function listManagedPdfElements(
  documentId: string,
): Promise<ManagedElementInfo[]> {
  return invoke<ManagedElementInfo[]>("list_managed_pdf_elements", { documentId });
}

export async function sessionEditUpdateOverlayText(
  documentId: string,
  elementId: string,
  options: OverlayTextOptions,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_edit_update_overlay_text", { documentId, elementId, options });
}

export async function sessionEditUpdateBackground(
  documentId: string,
  elementId: string,
  options: BackgroundOptions,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_edit_update_background", { documentId, elementId, options });
}

export async function sessionEditRemoveManagedElement(
  documentId: string,
  elementId: string,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_edit_remove_managed_element", { documentId, elementId });
}

export async function sessionSetPageLabels(
  documentId: string,
  options: PageLabelOptions,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_set_page_labels", { documentId, options });
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

export async function listFormFieldActions(
  documentId: string,
): Promise<FieldActionInfo[]> {
  return invoke<FieldActionInfo[]>("list_form_field_actions", { documentId });
}

export async function sessionSetFormFieldAction(
  documentId: string,
  request: FieldActionInput,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_set_form_field_action", { documentId, request });
}

export async function sessionDeleteFormFieldAction(
  documentId: string,
  objectId: string,
  trigger: string,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_delete_form_field_action", {
    documentId, objectId, trigger,
  });
}

export async function sessionDuplicateFormField(
  documentId: string,
  request: DuplicateFieldRequest,
): Promise<SessionFormFillResult> {
  return invoke<SessionFormFillResult>("session_duplicate_form_field", { documentId, request });
}

export async function sessionSetPageTabOrder(
  documentId: string,
  pageIndex: number,
  order: "row" | "column" | "structure",
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_set_page_tab_order", { documentId, pageIndex, order });
}

export async function exportFormData(
  input: string,
  destination: string,
): Promise<number> {
  return invoke<number>("export_form_data", { input, destination });
}

export async function sessionImportFormData(
  documentId: string,
  dataPath: string,
): Promise<SessionFormFillResult> {
  return invoke<SessionFormFillResult>("session_import_form_data", { documentId, dataPath });
}

export async function sessionResetForm(
  documentId: string,
  useDefaults: boolean,
): Promise<SessionFormFillResult> {
  return invoke<SessionFormFillResult>("session_reset_form", { documentId, useDefaults });
}

export async function sessionUpdateFormField(
  documentId: string,
  update: FormFieldUpdate,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_update_form_field", { documentId, update });
}

export async function sessionDeleteFormField(
  documentId: string,
  objectId: string,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_delete_form_field", { documentId, objectId });
}

export async function sessionUpdatePdfBookmark(
  documentId: string,
  update: BookmarkUpdate,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_update_pdf_bookmark", { documentId, update });
}

export async function sessionSetAllPdfBookmarksOpen(
  documentId: string,
  open: boolean,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_set_all_pdf_bookmarks_open", { documentId, open });
}

export async function sessionGeneratePdfBookmarksFromStructure(
  documentId: string,
): Promise<GeneratedBookmarksResult> {
  return invoke<GeneratedBookmarksResult>("session_generate_pdf_bookmarks_from_structure", { documentId });
}

export async function sessionAddPdfBookmark(
  documentId: string,
  bookmark: BookmarkInput,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_add_pdf_bookmark", { documentId, bookmark });
}

export async function sessionRenamePdfBookmark(
  documentId: string,
  objectId: string,
  title: string,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_rename_pdf_bookmark", { documentId, objectId, title });
}

export async function sessionDeletePdfBookmark(
  documentId: string,
  objectId: string,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_delete_pdf_bookmark", { documentId, objectId });
}

export async function sessionMovePdfBookmark(
  documentId: string,
  objectId: string,
  direction: "up" | "down" | "indent" | "outdent",
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_move_pdf_bookmark", {
    documentId, objectId, direction,
  });
}

export async function sessionSetPdfBookmarkOpen(
  documentId: string,
  objectId: string,
  open: boolean,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_set_pdf_bookmark_open", {
    documentId, objectId, open,
  });
}

export async function sessionAddPdfAttachment(
  documentId: string,
  filePath: string,
  displayName: string,
  description: string,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_add_pdf_attachment", {
    documentId, filePath, displayName, description,
  });
}

export async function sessionUpdatePdfAttachment(
  documentId: string,
  objectId: string,
  name: string,
  description: string,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_update_pdf_attachment", {
    documentId, objectId, name, description,
  });
}

export async function sessionRemovePdfAttachment(
  documentId: string,
  objectId: string,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_remove_pdf_attachment", {
    documentId, objectId,
  });
}

export async function materializePdfPortfolioItem(
  documentId: string,
  objectId: string,
): Promise<PortfolioPreview> {
  return invoke<PortfolioPreview>("materialize_pdf_portfolio_item", { documentId, objectId });
}

export async function openPdfPortfolioItemExternal(
  documentId: string,
  objectId: string,
): Promise<void> {
  await invoke("open_pdf_portfolio_item_external", { documentId, objectId });
}

export async function searchPdfPortfolioItems(
  documentId: string,
  query: string,
): Promise<PortfolioSearchHit[]> {
  return invoke<PortfolioSearchHit[]>("search_pdf_portfolio_items", { documentId, query });
}

export async function sessionAddPdfPortfolioClipboardText(
  documentId: string,
  text: string,
  displayName: string,
  folderPath: string,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_add_pdf_portfolio_clipboard_text", {
    documentId, text, displayName, folderPath,
  });
}

export async function sessionAddPdfPortfolioClipboardImage(
  documentId: string,
  rgba: number[],
  width: number,
  height: number,
  displayName: string,
  folderPath: string,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_add_pdf_portfolio_clipboard_image", {
    documentId, rgba, width, height, displayName, folderPath,
  });
}

export async function sessionAddPdfPortfolioWeb(
  documentId: string,
  url: string,
  displayName: string,
  folderPath: string,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_add_pdf_portfolio_web", {
    documentId, url, displayName, folderPath,
  });
}

export async function sessionAddPdfPortfolioScan(
  documentId: string,
  dpi: number,
  displayName: string,
  folderPath: string,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_add_pdf_portfolio_scan", {
    documentId, dpi, displayName, folderPath,
  });
}

export async function sessionAddPdfPortfolioItem(
  documentId: string,
  filePath: string,
  displayName: string,
  description: string,
  folderPath: string,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_add_pdf_portfolio_item", {
    documentId, filePath, displayName, description, folderPath,
  });
}

export async function sessionConfigurePdfPortfolio(
  documentId: string,
  view: "details" | "tile" | "hidden",
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_configure_pdf_portfolio", { documentId, view });
}

export async function sessionSetPdfPortfolioView(
  documentId: string,
  view: "details" | "tile" | "hidden",
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_set_pdf_portfolio_view", { documentId, view });
}

export async function sessionImportPdfPortfolioDirectory(
  documentId: string,
  directory: string,
  targetPath: string,
): Promise<SessionPortfolioDirectoryImportResult> {
  return invoke<SessionPortfolioDirectoryImportResult>("session_import_pdf_portfolio_directory", {
    documentId, directory, targetPath,
  });
}

export async function sessionCreatePdfPortfolioFolder(
  documentId: string,
  path: string,
  description: string,
): Promise<SessionPortfolioFolderResult> {
  return invoke<SessionPortfolioFolderResult>("session_create_pdf_portfolio_folder", {
    documentId, path, description,
  });
}

export async function sessionMovePdfPortfolioItem(
  documentId: string,
  objectId: string,
  folderPath: string,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_move_pdf_portfolio_item", {
    documentId, objectId, folderPath,
  });
}

export async function sessionRenamePdfPortfolioFolder(
  documentId: string,
  folderId: string,
  newName: string,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_rename_pdf_portfolio_folder", {
    documentId, folderId, newName,
  });
}

export async function sessionRemovePdfPortfolioFolder(
  documentId: string,
  folderId: string,
): Promise<SessionPortfolioFolderResult> {
  return invoke<SessionPortfolioFolderResult>("session_remove_pdf_portfolio_folder", {
    documentId, folderId,
  });
}

export async function sessionImportImageAsPdfLayer(
  documentId: string,
  pageIndex: number,
  imagePath: string,
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
  visible: boolean,
  locked: boolean,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_import_image_as_pdf_layer", {
    documentId, pageIndex, imagePath, name, x, y, width, height, visible, locked,
  });
}

export async function sessionReorderPdfLayer(
  documentId: string,
  objectId: string,
  direction: "up" | "down",
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_reorder_pdf_layer", {
    documentId, objectId, direction,
  });
}

export async function sessionMergePdfLayers(
  documentId: string,
  sourceId: string,
  targetId: string,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_merge_pdf_layers", {
    documentId, sourceId, targetId,
  });
}

export async function sessionFlattenPdfLayers(
  documentId: string,
): Promise<SessionFlattenLayersResult> {
  return invoke<SessionFlattenLayersResult>("session_flatten_pdf_layers", { documentId });
}

export async function sessionApplyPdfLayerOverrides(
  documentId: string,
  context: "view" | "print" | "export",
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_apply_pdf_layer_overrides", {
    documentId, context,
  });
}

export async function sessionResetPdfLayerVisibility(
  documentId: string,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_reset_pdf_layer_visibility", { documentId });
}

export async function sessionUpdatePdfLayerProperties(
  documentId: string,
  update: LayerPropertiesUpdate,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_update_pdf_layer_properties", {
    documentId, update,
  });
}

export async function sessionSetPdfLayerVisibility(
  documentId: string,
  objectId: string,
  visible: boolean,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_set_pdf_layer_visibility", {
    documentId, objectId, visible,
  });
}

export async function sessionUpdateDocumentMetadata(
  documentId: string,
  update: MetadataUpdate,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_update_document_metadata", { documentId, update });
}

export async function listPrinters(): Promise<PrinterInfo[]> {
  return invoke<PrinterInfo[]>("list_printers");
}

export async function printDocumentAdvanced(
  input: string,
  options: PrintOptions,
): Promise<JobStart> {
  return invoke<JobStart>("start_print_document_advanced", { input, options });
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

export async function startInsertBlankPages(
  input: string,
  output: string,
  insertAfter: number,
  pageSize: "a4" | "letter" | "legal",
  pageCount: number,
): Promise<JobStart> {
  return invoke<JobStart>("start_insert_blank_pages", { input, output, insertAfter, pageSize, pageCount });
}

export async function startInsertImagePages(
  input: string,
  output: string,
  insertAfter: number,
  images: string[],
  dpi: number,
): Promise<JobStart> {
  return invoke<JobStart>("start_insert_image_pages", { input, output, insertAfter, images, dpi });
}

export async function startInsertTextPages(
  input: string,
  output: string,
  insertAfter: number,
  text: string,
  pageSize: "a4" | "letter" | "legal",
  fontSize: number,
): Promise<JobStart> {
  return invoke<JobStart>("start_insert_text_pages", { input, output, insertAfter, text, pageSize, fontSize });
}

export async function startInsertClipboardImagePages(
  input: string,
  output: string,
  insertAfter: number,
  rgba: number[],
  width: number,
  height: number,
  dpi: number,
): Promise<JobStart> {
  return invoke<JobStart>("start_insert_clipboard_image_pages", {
    input, output, insertAfter, rgba, width, height, dpi,
  });
}

export async function startInsertWebPages(
  input: string,
  output: string,
  insertAfter: number,
  url: string,
): Promise<JobStart> {
  return invoke<JobStart>("start_insert_web_pages", { input, output, insertAfter, url });
}

export async function startInsertScannedPage(
  input: string,
  output: string,
  insertAfter: number,
  dpi: number,
): Promise<JobStart> {
  return invoke<JobStart>("start_insert_scanned_page", { input, output, insertAfter, dpi });
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

export async function detectOcrLanguage(
  documentId: string,
  pageIndex: number,
  candidates: string[],
): Promise<OcrLanguageDetection> {
  return invoke<OcrLanguageDetection>("detect_ocr_language", {
    documentId,
    pageIndex,
    candidates,
  });
}

export async function reviewOcrPage(
  documentId: string,
  pageIndex: number,
  language: string,
  threshold: number,
): Promise<OcrReviewResult> {
  return invoke<OcrReviewResult>("review_ocr_page", { documentId, pageIndex, language, threshold });
}

export async function listScanners(): Promise<ScannerInfo[]> {
  return invoke<ScannerInfo[]>("list_scanners");
}

export async function scanPageImage(
  dpi: number,
  colorMode: "color" | "gray" | "lineart",
  scannerId?: string,
): Promise<ScannedPage> {
  return invoke<ScannedPage>("scan_page_image", { dpi, colorMode, scannerId: scannerId ?? null });
}

export async function deleteScanPages(inputs: string[]): Promise<number> {
  return invoke<number>("delete_scan_pages", { inputs });
}

export async function finalizeScanSession(
  inputs: string[],
  destination: string,
  dpi: number,
  ocrOptions?: OcrOptions,
): Promise<ScanFinalizeResult> {
  return invoke<ScanFinalizeResult>("finalize_scan_session", {
    inputs,
    destination,
    dpi,
    ocrOptions: ocrOptions ?? null,
  });
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

export async function getOptimizationAudit(input: string): Promise<OptimizationAudit> {
  return invoke<OptimizationAudit>("get_optimization_audit", { input });
}

export async function startOptimizeAdvanced(
  input: string,
  output: string,
  options: OptimizeOptions,
): Promise<JobStart> {
  return invoke<JobStart>("start_optimize_pdf_advanced", { input, output, options });
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

export async function listPdfPageActions(path: string): Promise<PageActionInfo[]> {
  return invoke<PageActionInfo[]>("list_pdf_page_actions", { path });
}

export async function sessionSetPdfPageAction(
  documentId: string,
  request: PageActionInput,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_set_pdf_page_action", { documentId, request });
}

export async function sessionRemovePdfPageAction(
  documentId: string,
  pageIndex: number,
  trigger: string,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_remove_pdf_page_action", {
    documentId, pageIndex, trigger,
  });
}

export async function resolvePdfAction(
  path: string,
  objectId: string,
): Promise<ActionExecution> {
  return invoke<ActionExecution>("resolve_pdf_action", { path, objectId });
}

export async function listPdfActions(path: string): Promise<PdfActionInfo[]> {
  return invoke<PdfActionInfo[]>("list_pdf_actions", { path });
}

export async function getPagePreflight(
  documentId: string,
  pageIndex: number,
): Promise<PagePreflight> {
  return invoke<PagePreflight>("get_page_preflight", { documentId, pageIndex });
}

export async function validatePdfIso(
  input: string,
  flavour: string,
  customProfile?: string,
): Promise<IsoValidationReport> {
  return invoke<IsoValidationReport>("validate_pdf_iso", {
    input,
    flavour,
    customProfile: customProfile ?? null,
  });
}

export async function getPrintPreflight(path: string): Promise<PrintPreflightReport> {
  return invoke<PrintPreflightReport>("get_print_preflight", { path });
}

export async function sessionSetPageGeometry(
  documentId: string,
  update: PageGeometryUpdate,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_set_page_geometry", { documentId, update });
}

export async function sessionSetPageBoxes(
  documentId: string,
  update: PageBoxUpdate,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_set_page_boxes", { documentId, update });
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

export async function addSignatureImage(
  input: string,
  output: string,
  signature: SignatureImageInput,
): Promise<void> {
  await invoke("add_signature_image", { input, output, signature });
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

export async function analyzeSanitization(path: string): Promise<SanitizeAnalysis> {
  return invoke<SanitizeAnalysis>("analyze_sanitization", { path });
}

export async function sanitizeDocument(
  input: string,
  output: string,
  options: SanitizeOptions,
): Promise<SanitizeReport> {
  return invoke<SanitizeReport>("sanitize_document", { input, output, options });
}

export async function listAccessibilityTags(
  documentId: string,
): Promise<StructureTagInfo[]> {
  return invoke<StructureTagInfo[]>("list_accessibility_tags", { documentId });
}

export async function sessionUpdateAccessibilityProperties(
  documentId: string,
  properties: AccessibilityProperties,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_update_accessibility_properties", { documentId, properties });
}

export async function sessionUpdateStructureTag(
  documentId: string,
  update: StructureTagUpdate,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_update_structure_tag", { documentId, update });
}

export async function sessionDeleteStructureTag(
  documentId: string,
  objectId: string,
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_delete_structure_tag", { documentId, objectId });
}

export async function sessionMoveStructureTag(
  documentId: string,
  objectId: string,
  direction: "up" | "down",
): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("session_move_structure_tag", { documentId, objectId, direction });
}

export async function sessionAutoTagBasic(
  documentId: string,
): Promise<AutoTagResult> {
  return invoke<AutoTagResult>("session_auto_tag_basic", { documentId });
}

export async function getAccessibilityReport(path: string): Promise<AccessibilityReport> {
  return invoke<AccessibilityReport>("get_accessibility_report", { path });
}

export async function compareDocumentsAdvanced(
  left: string,
  right: string,
  options: CompareOptions,
): Promise<CompareReport> {
  return invoke<CompareReport>("compare_documents_advanced", { left, right, options });
}

export async function exportCompareReportPdf(
  destination: string,
  leftName: string,
  rightName: string,
  report: CompareReport,
): Promise<void> {
  await invoke("export_compare_report_pdf", { destination, leftName, rightName, report });
}

export async function compareDocuments(left: string, right: string): Promise<CompareReport> {
  return invoke<CompareReport>("compare_documents", { left, right });
}

export async function startEncryptPdf(
  input: string,
  output: string,
  userPassword: string,
  ownerPassword: string,
  options?: PdfEncryptionOptions,
): Promise<JobStart> {
  return invoke<JobStart>("start_encrypt_pdf", { input, output, userPassword, ownerPassword, options: options ?? null });
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
  options?: ConversionOptions,
): Promise<JobStart> {
  return invoke<JobStart>("start_convert_to_pdf", { input, outputDirectory, options: options ?? null });
}

export async function startBatchConvertToPdf(
  inputs: string[],
  outputDirectory: string,
  options?: ConversionOptions,
): Promise<JobStart> {
  return invoke<JobStart>("start_batch_convert_to_pdf", { inputs, outputDirectory, options: options ?? null });
}


export async function startExportPdf(
  input: string,
  output: string,
  format: "png" | "jpeg" | "tiff" | "txt" | "ps",
  dpi?: number,
): Promise<JobStart> {
  return invoke<JobStart>("start_export_pdf", { input, output, format, dpi: dpi ?? null });
}

export async function pauseJob(jobId: string): Promise<void> {
  await invoke("pause_job", { jobId });
}

export async function resumeJob(jobId: string): Promise<void> {
  await invoke("resume_job", { jobId });
}

export async function cancelJob(jobId: string): Promise<void> {
  await invoke("cancel_job", { jobId });
}

export function nativeAssetUrl(path: string): string {
  return isNativeDesktop() ? convertFileSrc(path) : path;
}
