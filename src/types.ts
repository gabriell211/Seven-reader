export type CapabilityKey =
  | "pdf_engine"
  | "qpdf"
  | "ocr"
  | "office"
  | "ghostscript"
  | "scanner"
  | "printing"
  | "certificates"
  | "pdftotext"
  | "openssl"
  | "tesseract"
  | "web_pdf";

export interface Capability {
  available: boolean;
  version?: string;
  detail?: string;
}

export type Capabilities = Record<CapabilityKey, Capability>;

export interface RecentDocument {
  path: string;
  activePath: string;
  name: string;
  pageCount?: number;
  lastOpenedAt: number;
  pinned?: boolean;
  favorite?: boolean;
}

export interface DocumentSummary {
  id: string;
  path: string;
  activePath: string;
  name: string;
  pageCount: number;
  fileSize: number;
  pdfVersion?: string;
  encrypted: boolean;
  hasSignatures: boolean;
  hasForms: boolean;
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

export type ViewMode = "single" | "continuous" | "facing" | "facing-continuous";

export interface PageTransferResult {
  target: DocumentSummary;
  source?: DocumentSummary;
  moved: boolean;
}

export interface ExternalFileStatus {
  exists: boolean;
  changed: boolean;
  fileSize?: number;
  modifiedNs?: string;
}

export interface RenderResult {
  documentId: string;
  pageIndex: number;
  width: number;
  height: number;
  cachePath: string;
  revision: number;
}

export interface SearchHit {
  pageIndex: number;
  excerpt: string;
  occurrences: number;
}

export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextSelectionResult {
  text: string;
  pageIndex: number;
  rect: NormalizedRect;
}

export interface AdvancedSearchOptions {
  query: string;
  matchCase: boolean;
  wholeWord: boolean;
  regex: boolean;
  pageStart?: number;
  pageEnd?: number;
  includeText: boolean;
  includeComments: boolean;
  includeBookmarks: boolean;
  includeForms: boolean;
  includeMetadata: boolean;
}

export interface AdvancedSearchHit {
  kind: "text" | "comment" | "bookmark" | "form" | "metadata" | string;
  pageIndex?: number;
  title: string;
  excerpt: string;
  occurrences: number;
}

export interface ReviewTransferReport {
  annotations: number;
  skipped: number;
}

export interface SessionReviewImportResult {
  document: DocumentSummary;
  report: ReviewTransferReport;
}

export interface CatalogSummary {
  id: string;
  name: string;
  createdAtUnix: number;
  documentCount: number;
  pageCount: number;
}

export interface CatalogHit {
  catalogId: string;
  documentPath: string;
  documentName: string;
  pageIndex: number;
  excerpt: string;
  occurrences: number;
}

export interface JobStart {
  jobId: string;
}

export interface JobStatus {
  id: string;
  kind: string;
  state: "queued" | "running" | "completed" | "failed" | "cancelled";
  stage: string;
  progress?: number;
  output?: string;
  error?: string;
}

export interface DocumentMetadata {
  title: string;
  author: string;
  subject: string;
  keywords: string;
  creator: string;
  producer: string;
  pdfVersion: string;
  encrypted: boolean;
  pageCount: number;
}

export interface MetadataUpdate {
  title: string;
  author: string;
  subject: string;
  keywords: string;
}

export interface SanitizeOptions {
  removeJavascript: boolean;
  removeOpenActions: boolean;
  removeEmbeddedFiles: boolean;
  removeMetadata: boolean;
  removeXfa: boolean;
  removeAnnotations: boolean;
  removeForms: boolean;
  removeMultimedia: boolean;
}

export interface SanitizeReport {
  removedEntries: number;
  removedMetadata: boolean;
  output: string;
}

export interface AccessibilityCheck {
  id: string;
  label: string;
  passed: boolean;
  severity: "error" | "warning" | "info";
  detail: string;
}

export interface AccessibilityReport {
  tagged: boolean;
  language?: string;
  title?: string;
  checks: AccessibilityCheck[];
}

export interface ComparePage {
  pageIndex: number;
  leftExcerpt: string;
  rightExcerpt: string;
}

export interface CompareReport {
  leftPages: number;
  rightPages: number;
  changedPages: number;
  pages: ComparePage[];
}

export interface OcrOptions {
  language: string;
  deskew: boolean;
  rotatePages: boolean;
  outputType: "auto" | "pdf" | "pdfa" | "pdfa-1" | "pdfa-2" | "pdfa-3";
  mode: "skip" | "redo" | "force";
  sidecar?: string;
}

export interface OcrWord {
  text: string;
  confidence: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

export type AnnotationKind = "note" | "highlight" | "underline" | "strikeout" | "stamp" | "freetext" | "ink";

export interface AnnotationInput {
  pageIndex: number;
  kind: AnnotationKind;
  text: string;
  author: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface InkAnnotationInput {
  pageIndex: number;
  author: string;
  points: Array<[number, number]>;
  lineWidth: number;
}

export interface AnnotationInfo {
  objectId: string;
  pageIndex: number;
  kind: string;
  text: string;
  author: string;
  rect: [number, number, number, number];
}

export interface FormFieldInfo {
  objectId: string;
  name: string;
  fieldType: "text" | "checkbox" | "radio" | "dropdown" | "list" | "button" | "signature" | "unknown";
  value: string;
  defaultValue: string;
  tooltip: string;
  required: boolean;
  readOnly: boolean;
  multiline: boolean;
  maxLength?: number;
  pageIndex?: number;
  rect?: [number, number, number, number];
  options: string[];
  borderColor?: [number, number, number];
  fillColor?: [number, number, number];
  borderWidth: number;
  borderStyle: "S" | "D" | "B" | "I" | "U";
  fontSize: number;
  textColor: [number, number, number];
  rotation: 0 | 90 | 180 | 270;
  visibility: "visible" | "visible-no-print" | "hidden" | "hidden-printable";
}

export interface FormValue {
  name: string;
  value: string;
}

export type NewFormFieldType = "text" | "checkbox" | "radio" | "dropdown" | "list" | "button" | "signature";

export interface NewFormField {
  name: string;
  fieldType: NewFormFieldType;
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  required: boolean;
  readOnly: boolean;
  multiline: boolean;
  maxLength?: number;
  tooltip: string;
  defaultValue: string;
  options: string[];
  borderColor?: [number, number, number];
  fillColor?: [number, number, number];
  borderWidth: number;
  borderStyle: "S" | "D" | "B" | "I" | "U";
  fontSize: number;
  textColor: [number, number, number];
  rotation: 0 | 90 | 180 | 270;
  visibility: "visible" | "visible-no-print" | "hidden" | "hidden-printable";
}

export interface FieldActionInfo {
  fieldObjectId: string;
  fieldName: string;
  trigger: "mouse-up" | "mouse-down" | "mouse-enter" | "mouse-exit" | "focus" | "blur" | string;
  actionType: string;
  target: string;
  blocked: boolean;
}

export interface FieldActionInput {
  fieldObjectId: string;
  trigger: "mouse-up" | "mouse-down" | "mouse-enter" | "mouse-exit" | "focus" | "blur";
  actionType: "uri" | "goto" | "reset" | "hide" | "submit" | "javascript" | "launch";
  target: string;
  targetPage?: number;
  hide: boolean;
}

export interface DuplicateFieldRequest {
  objectId: string;
  pageStart: number;
  pageEnd: number;
  rows: number;
  columns: number;
  gapX: number;
  gapY: number;
  offsetX: number;
  offsetY: number;
}

export interface FormFieldUpdate {
  objectId: string;
  name: string;
  tooltip: string;
  defaultValue: string;
  required: boolean;
  readOnly: boolean;
  multiline: boolean;
  maxLength?: number;
  x: number;
  y: number;
  width: number;
  height: number;
  options: string[];
  borderColor?: [number, number, number];
  fillColor?: [number, number, number];
  borderWidth: number;
  borderStyle: "S" | "D" | "B" | "I" | "U";
  fontSize: number;
  textColor: [number, number, number];
  rotation: 0 | 90 | 180 | 270;
  visibility: "visible" | "visible-no-print" | "hidden" | "hidden-printable";
}

export type PadesLevelId = "bb" | "bt" | "blt" | "blta";

export interface SignRequest {
  pkcs12Path: string;
  password: string;
  level: PadesLevelId;
  fieldName: string;
  pageIndex: number;
  reason?: string;
  location?: string;
  contactInfo?: string;
  tsaUrl?: string;
  certify: boolean;
  visible: boolean;
  appearanceText: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SignatureValidationItem {
  fieldName: string;
  status: string;
  signerName?: string;
  signatureType: string;
  padesLevel: string;
  integrityOk: boolean;
  coversWholeDocument: boolean;
  digestMatches: boolean;
  cryptographicValidity: string;
  certificateValidity: string;
  chainTrusted: boolean;
  trustAnchor?: string;
  modificationsAfterSigning: boolean;
  signingTime?: string;
  cmsSigningTime?: string;
  timestampTime?: string;
  summary: string;
  integrityIssues: string[];
}

export interface SignatureValidationReport {
  signatures: SignatureValidationItem[];
  documentModified: boolean;
  validCount: number;
  invalidCount: number;
  summary: string;
}

export interface TextPlacement {
  pageIndex: number;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  rotation: number;
  gray: number;
}

export interface ImagePlacement {
  pageIndex: number;
  imagePath: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  mirrorX: boolean;
  mirrorY: boolean;
  cropLeft: number;
  cropTop: number;
  cropRight: number;
  cropBottom: number;
}

export interface ImageObjectInfo {
  pageIndex: number;
  resourceName: string;
  objectId: string;
  pixelWidth?: number;
  pixelHeight?: number;
}

export type LinkTargetKind = "url" | "page" | "file" | "named";

export interface LinkPlacement {
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  targetKind: LinkTargetKind;
  target: string;
  targetPage?: number;
  namedDestination?: string;
  borderWidth: number;
  borderColor: [number, number, number];
}

export interface NamedDestinationInfo {
  name: string;
  pageIndex?: number;
  editable: boolean;
}

export interface LinkInfo {
  objectId: string;
  pageIndex: number;
  rect: [number, number, number, number];
  targetKind: LinkTargetKind | "unknown";
  target: string;
  targetPage?: number;
  namedDestination?: string;
  borderWidth: number;
  borderColor: [number, number, number];
}

export interface LinkUpdate {
  objectId: string;
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  targetKind: LinkTargetKind;
  target: string;
  targetPage?: number;
  namedDestination?: string;
  borderWidth: number;
  borderColor: [number, number, number];
}

export interface OverlayTextOptions {
  kind: "header" | "footer" | "page-number" | "watermark" | "bates";
  text: string;
  prefix: string;
  suffix: string;
  startNumber: number;
  digits: number;
  fontSize: number;
  pageStart: number;
  pageEnd?: number;
  parity: "all" | "odd" | "even";
  position: "left" | "center" | "right";
  marginX: number;
  marginY: number;
  rotation: number;
  opacity: number;
  imagePath?: string;
  imageScale: number;
}

export interface PageLabelOptions {
  pageStart: number;
  pageEnd?: number;
  style: "decimal" | "roman-lower" | "roman-upper" | "letters-lower" | "letters-upper";
  prefix: string;
  suffix: string;
  startNumber: number;
}

export interface ManagedElementInfo {
  id: string;
  kind: string;
  pageIndices: number[];
  optionsJson: string;
}

export interface BackgroundOptions {
  pageStart: number;
  pageEnd?: number;
  red: number;
  green: number;
  blue: number;
  opacity: number;
  imagePath?: string;
  imageScale: number;
  position: "center" | "stretch" | "tile";
}

export interface SessionReplaceTextResult {
  document: DocumentSummary;
  report: ReplaceTextReport;
}

export interface SessionFormFillResult {
  document: DocumentSummary;
  changed: number;
}

export interface ReplaceTextReport {
  replacements: number;
  pagesChanged: number;
  unsupportedTextOperators: number;
}

export interface RedactionArea {
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  sourceText?: string;
}

export interface RedactionReport {
  areasApplied: number;
  objectsRemoved: number;
  annotationsRemoved: number;
  output: string;
}

export interface BookmarkInfo {
  objectId: string;
  parentObjectId?: string;
  title: string;
  depth: number;
  pageIndex?: number;
  open: boolean;
  hasChildren: boolean;
  bold: boolean;
  italic: boolean;
  color: [number, number, number];
  actionType: string;
  actionTarget: string;
}

export interface BookmarkUpdate {
  objectId: string;
  title: string;
  actionType: "goto" | "uri" | "named" | "none";
  targetPage?: number;
  target: string;
  bold: boolean;
  italic: boolean;
  color: [number, number, number];
}

export interface GeneratedBookmarksResult {
  document: DocumentSummary;
  created: number;
}

export interface BookmarkInput {
  title: string;
  pageIndex: number;
}

export interface AttachmentInfo {
  name: string;
  description: string;
  size?: number;
  mime: string;
  sha256: string;
  objectId: string;
  collectionPath: string;
}

export interface PortfolioPreview {
  objectId: string;
  name: string;
  mime: string;
  kind: "pdf" | "image" | "text" | "file";
  cachePath: string;
  text?: string;
  size: number;
}

export interface PortfolioSearchHit {
  objectId: string;
  name: string;
  mime: string;
  collectionPath: string;
  excerpt: string;
  occurrences: number;
}

export interface PortfolioFolderInfo {
  objectId: string;
  id: number;
  name: string;
  path: string;
  description: string;
  parentObjectId?: string;
  depth: number;
}

export interface PortfolioDirectoryImportReport {
  addedFiles: number;
  createdFolders: number;
  skippedFiles: number;
  totalBytes: number;
}

export interface SessionPortfolioDirectoryImportResult {
  document: DocumentSummary;
  report: PortfolioDirectoryImportReport;
}

export interface SessionPortfolioFolderResult {
  document: DocumentSummary;
  changed: number;
}

export interface LayerInfo {
  objectId: string;
  name: string;
  visible: boolean;
  locked: boolean;
  depth: number;
  viewState: "on" | "off" | "unchanged";
  printState: "on" | "off" | "unchanged";
  exportState: "on" | "off" | "unchanged";
  intent: string[];
}

export interface SessionFlattenLayersResult {
  document: DocumentSummary;
  changedPages: number;
}

export interface LayerPropertiesUpdate {
  objectId: string;
  name: string;
  locked: boolean;
  viewState: "on" | "off" | "unchanged";
  printState: "on" | "off" | "unchanged";
  exportState: "on" | "off" | "unchanged";
}

export interface OptimizationAudit {
  fileSize: number;
  objectCount: number;
  streamBytes: number;
  imageStreamBytes: number;
  fontStreamBytes: number;
  embeddedFileBytes: number;
  pageContentBytes: number;
  otherStreamBytes: number;
  imageCount: number;
  fontCount: number;
  embeddedFileCount: number;
}

export interface OptimizeOptions {
  compatibility: "1.4" | "1.5" | "1.6" | "1.7" | "2.0";
  colorDpi: number;
  grayscaleDpi: number;
  monochromeDpi: number;
  downsample: "bicubic" | "average" | "subsample";
  colorCompression: "jpeg" | "flate";
  grayscaleCompression: "jpeg" | "flate";
  jpegQuality: number;
  embedFonts: boolean;
  subsetFonts: boolean;
  linearize: boolean;
  cleanup: boolean;
  removeJavascript: boolean;
  removeOpenActions: boolean;
  removeEmbeddedFiles: boolean;
  removeMetadata: boolean;
  removeXfa: boolean;
  removeAnnotations: boolean;
  removeForms: boolean;
  removeMultimedia: boolean;
}

export interface PagePreflight {
  pageIndex: number;
  widthPt: number;
  heightPt: number;
  mediaBox: [number, number, number, number];
  cropBox?: [number, number, number, number];
  trimBox?: [number, number, number, number];
  bleedBox?: [number, number, number, number];
  artBox?: [number, number, number, number];
  rotation: number;
  annotations: number;
}

export interface FontPreflight {
  objectId: string;
  name: string;
  subtype: string;
  embedded: boolean;
  subset: boolean;
}

export interface PrintPreflightReport {
  pdfVersion: string;
  pageCount: number;
  hasOutputIntent: boolean;
  usesDeviceRgb: boolean;
  usesDeviceCmyk: boolean;
  usesDeviceGray: boolean;
  usesIcc: boolean;
  hasTransparency: boolean;
  hasOverprint: boolean;
  spotColors: string[];
  fonts: FontPreflight[];
  pages: PagePreflight[];
  warnings: string[];
}

export interface PageGeometryUpdate {
  mode: "crop" | "resize";
  pageIndices: number[];
  cropLeftPt: number;
  cropRightPt: number;
  cropTopPt: number;
  cropBottomPt: number;
  widthPt?: number;
  heightPt?: number;
}

export interface PageBoxUpdate {
  pageStart: number;
  pageEnd: number;
  trimInsetPt: number;
  bleedInsetPt: number;
  cropToTrim: boolean;
}

export interface PdfActionInfo {
  objectId: string;
  actionType: string;
  target: string;
  blocked: boolean;
  automatic: boolean;
}

export interface AdvancedPdfReport {
  bookmarks: BookmarkInfo[];
  attachments: AttachmentInfo[];
  layers: LayerInfo[];
  isPortfolio: boolean;
  portfolioView?: string;
  portfolioFolders: PortfolioFolderInfo[];
  hasRichMedia: boolean;
  hasThreeD: boolean;
  hasGeospatial: boolean;
  hasArticles: boolean;
  hasJavascript: boolean;
  hasLaunchActions: boolean;
  hasOpenAction: boolean;
  suspiciousActions: number;
}

export type ToolId =
  | "edit" | "convert" | "create" | "organize" | "combine" | "comment"
  | "fill-sign" | "certificates" | "scan-ocr" | "forms" | "protect"
  | "sanitize" | "properties" | "export" | "bookmarks" | "attachments"
  | "redact" | "compare" | "optimize" | "accessibility" | "print-production"
  | "automation" | "javascript" | "portfolio" | "layers" | "articles"
  | "catalog" | "rich-media" | "three-d" | "shared-review" | "geospatial";
