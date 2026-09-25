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
  fieldType: "text" | "button" | "choice" | "signature" | "unknown";
  value: string;
  required: boolean;
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
  options: string[];
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
}

export interface LinkPlacement {
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  target: string;
  targetPage?: number;
}

export interface OverlayTextOptions {
  kind: "header" | "footer" | "page-number" | "watermark" | "bates";
  text: string;
  prefix: string;
  startNumber: number;
  digits: number;
  fontSize: number;
  pageStart: number;
  pageEnd?: number;
}

export interface BackgroundOptions {
  pageStart: number;
  pageEnd?: number;
  red: number;
  green: number;
  blue: number;
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
  title: string;
  depth: number;
  pageIndex?: number;
  open: boolean;
}

export interface BookmarkInput {
  title: string;
  pageIndex: number;
}

export interface AttachmentInfo {
  name: string;
  description: string;
  size?: number;
  objectId: string;
}

export interface LayerInfo {
  objectId: string;
  name: string;
  visible: boolean;
  intent: string[];
}

export interface AdvancedPdfReport {
  bookmarks: BookmarkInfo[];
  attachments: AttachmentInfo[];
  layers: LayerInfo[];
  isPortfolio: boolean;
  portfolioView?: string;
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
