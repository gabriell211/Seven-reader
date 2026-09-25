import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type {
  Capabilities,
  DocumentSummary,
  JobStart,
  RenderResult,
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

export async function startCombine(inputs: string[], output: string): Promise<JobStart> {
  return invoke<JobStart>("start_combine_documents", { inputs, output });
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

export async function cancelJob(jobId: string): Promise<void> {
  await invoke("cancel_job", { jobId });
}

export function nativeAssetUrl(path: string): string {
  return isNativeDesktop() ? convertFileSrc(path) : path;
}
