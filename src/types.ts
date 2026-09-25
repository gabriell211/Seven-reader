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
  | "openssl";

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

export type ToolId =
  | "edit" | "convert" | "create" | "organize" | "combine" | "comment"
  | "fill-sign" | "certificates" | "scan-ocr" | "forms" | "protect"
  | "sanitize" | "properties" | "export"
  | "redact" | "compare" | "optimize" | "accessibility" | "print-production"
  | "automation" | "javascript" | "portfolio" | "layers" | "articles"
  | "catalog" | "rich-media" | "three-d" | "shared-review" | "geospatial";
