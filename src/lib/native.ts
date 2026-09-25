import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { Capabilities, DocumentSummary, RenderResult } from "../types";

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

export async function openDocument(path: string): Promise<DocumentSummary> {
  return invoke<DocumentSummary>("open_document", { path });
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

export async function searchDocument(
  documentId: string,
  query: string,
): Promise<Array<{ pageIndex: number; excerpt: string; occurrences: number }>> {
  return invoke("search_document", { documentId, query });
}

export async function saveCopy(
  documentId: string,
  destination: string,
): Promise<void> {
  await invoke("save_document_as", { documentId, destination });
}

export function nativeAssetUrl(path: string): string {
  return isNativeDesktop() ? convertFileSrc(path) : path;
}
