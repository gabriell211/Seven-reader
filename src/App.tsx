import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { SplashScreen } from "./components/SplashScreen";
import { Home } from "./components/Home";
import { DocumentWorkspace } from "./components/DocumentWorkspace";
import {
  getCapabilities, isNativeDesktop, openDocument, renderPage,
} from "./lib/native";
import type { Capabilities, DocumentSummary, RecentDocument, RenderResult, ToolId } from "./types";

const emptyCapabilities: Capabilities = {
  pdf_engine: { available: false },
  qpdf: { available: false },
  ocr: { available: false },
  office: { available: false },
  ghostscript: { available: false },
  scanner: { available: false },
  printing: { available: false },
  certificates: { available: false },
};

export default function App() {
  const native = isNativeDesktop();
  const [splash, setSplash] = useState(true);
  const [leavingSplash, setLeavingSplash] = useState(false);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(native ? emptyCapabilities : null);
  const [document, setDocument] = useState<DocumentSummary | null>(null);
  const [rendered, setRendered] = useState<RenderResult | null>(null);
  const [page, setPage] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [recents] = useState<RecentDocument[]>([]);

  useEffect(() => {
    let active = true;
    const boot = async () => {
      try {
        if (native) {
          const detected = await getCapabilities();
          if (active && detected) setCapabilities(detected);
        }
      } finally {
        window.setTimeout(() => {
          if (!active) return;
          setLeavingSplash(true);
          window.setTimeout(() => active && setSplash(false), 420);
        }, 900);
      }
    };
    void boot();
    return () => { active = false; };
  }, [native]);

  const choosePdf = async () => {
    if (!native) return;
    const selected = await open({
      title: "Abrir PDF",
      multiple: false,
      filters: [{ name: "Documento PDF", extensions: ["pdf"] }],
    });
    if (typeof selected !== "string") return;
    const summary = await openDocument(selected);
    setDocument(summary);
    setPage(0);
    setZoom(100);
    const first = await renderPage(summary.id, 0, 1400);
    setRendered(first);
  };

  const render = async (nextPage: number, nextZoom: number) => {
    if (!document) return;
    setPage(nextPage);
    setZoom(nextZoom);
    const targetWidth = Math.max(900, Math.round(1400 * (nextZoom / 100)));
    const next = await renderPage(document.id, nextPage, targetWidth);
    setRendered(next);
  };

  const selectTool = (tool: ToolId) => {
    window.dispatchEvent(new CustomEvent("seven:tool", { detail: tool }));
  };

  if (splash) return <SplashScreen leaving={leavingSplash} />;

  if (document) {
    return (
      <DocumentWorkspace
        document={document}
        rendered={rendered}
        capabilities={capabilities}
        page={page}
        zoom={zoom}
        onHome={() => setDocument(null)}
        onRender={render}
        onSearch={() => undefined}
        onTool={selectTool}
      />
    );
  }

  return (
    <Home
      native={native}
      capabilities={capabilities}
      recents={recents}
      onOpen={choosePdf}
      onOpenFolder={() => undefined}
      onTool={selectTool}
    />
  );
}
