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
  | "tesseract";

export interface Capability {
  available: boolean;
  version?: string;
  detail?: string;
}

export type Capabilities = Record<CapabilityKey, Capability>;

export interface RecentDocument {
  path: string;
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

export type AnnotationKind = "note" | "highlight" | "underline" | "strikeout" | "stamp" | "freetext";

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

export type ToolId =
  | "edit" | "convert" | "create" | "organize" | "combine" | "comment"
  | "fill-sign" | "certificates" | "scan-ocr" | "forms" | "protect"
  | "sanitize" | "properties" | "export"
  | "redact" | "compare" | "optimize" | "accessibility" | "print-production"
  | "automation" | "javascript" | "portfolio" | "layers" | "articles"
  | "catalog" | "rich-media" | "three-d" | "shared-review" | "geospatial";
