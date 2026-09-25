export type CapabilityKey =
  | "pdf_engine"
  | "qpdf"
  | "ocr"
  | "office"
  | "ghostscript"
  | "scanner"
  | "printing"
  | "certificates";

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

export type ToolId =
  | "edit" | "convert" | "create" | "organize" | "combine" | "comment"
  | "fill-sign" | "certificates" | "scan-ocr" | "forms" | "protect"
  | "redact" | "compare" | "optimize" | "accessibility" | "print-production"
  | "automation" | "javascript" | "portfolio" | "layers" | "articles"
  | "catalog" | "rich-media" | "three-d" | "shared-review" | "geospatial";
