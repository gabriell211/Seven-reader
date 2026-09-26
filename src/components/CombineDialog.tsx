import { useCallback, useEffect, useMemo, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { DocumentSummary } from "../types";
import { SevenIcon } from "./SevenIcon";

interface CombineDialogProps {
  openDocuments: DocumentSummary[];
  officeAvailable: boolean;
  onClose: () => void;
  onCombine: (inputs: string[], output: string) => Promise<void>;
}

function fileName(path: string): string {
  return path.replace(/\\/g, "/").split("/").pop() || path;
}

function extension(path: string): string {
  return fileName(path).split(".").pop()?.toLowerCase() || "";
}

function sourceKind(path: string): "pdf" | "office" | "image" | "other" {
  const ext = extension(path);
  if (ext === "pdf") return "pdf";
  if (["doc","docx","xls","xlsx","ppt","pptx","odt","ods","odp","rtf","txt","html","htm"].includes(ext)) return "office";
  if (["png","jpg","jpeg","tif","tiff","bmp","webp"].includes(ext)) return "image";
  return "other";
}

export function CombineDialog({
  openDocuments,
  officeAvailable,
  onClose,
  onCombine,
}: CombineDialogProps) {
  const [inputs, setInputs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const acceptedExtensions = useMemo(() => [
    "pdf",
    "png","jpg","jpeg","tif","tiff","bmp","webp",
    ...(officeAvailable ? ["doc","docx","xls","xlsx","ppt","pptx","odt","ods","odp","rtf","txt","html","htm"] : []),
  ], [officeAvailable]);

  const append = useCallback((paths: string[]) => {
    setInputs((current) => {
      const next = [...current];
      const seen = new Set(current.map((path) => path.toLowerCase()));
      for (const path of paths) {
        if (next.length >= 100) break;
        if (!acceptedExtensions.includes(extension(path))) continue;
        const key = path.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        next.push(path);
      }
      return next;
    });
  }, [acceptedExtensions]);

  useEffect(() => {
    let dispose: (() => void) | undefined;
    void getCurrentWebviewWindow().onDragDropEvent((event) => {
      if (event.payload.type === "drop") append(event.payload.paths);
    }).then((unlisten) => { dispose = unlisten; });
    return () => dispose?.();
  }, [append]);

  const chooseFiles = async () => {
    const selected = await open({
      title: "Adicionar arquivos para combinar",
      multiple: true,
      directory: false,
      filters: [{
        name: officeAvailable ? "PDF, documentos e imagens" : "PDF e imagens",
        extensions: acceptedExtensions,
      }],
    });
    if (Array.isArray(selected)) append(selected);
    else if (typeof selected === "string") append([selected]);
  };

  const addOpenDocuments = () => append(openDocuments.map((document) => document.path));

  const move = (index: number, direction: -1 | 1) => {
    setInputs((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const moveEdge = (index: number, edge: "first" | "last") => {
    setInputs((current) => {
      if (index < 0 || index >= current.length) return current;
      const next = [...current];
      const [item] = next.splice(index, 1);
      if (edge === "first") next.unshift(item);
      else next.push(item);
      return next;
    });
  };

  const submit = async () => {
    if (inputs.length < 2 || busy) return;
    const output = await save({
      title: "Salvar PDF combinado",
      defaultPath: "Seven-Reader-Combinado.pdf",
      filters: [{ name: "Documento PDF", extensions: ["pdf"] }],
    });
    if (!output) return;
    setBusy(true);
    try {
      await onCombine(inputs, output);
    } finally {
      setBusy(false);
    }
  };

  const officeCount = inputs.filter((path) => sourceKind(path) === "office").length;
  const imageCount = inputs.filter((path) => sourceKind(path) === "image").length;
  const pdfCount = inputs.filter((path) => sourceKind(path) === "pdf").length;

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="workflow-dialog combine-dialog" role="dialog" aria-modal="true" aria-label="Combinar arquivos">
        <header className="organizer-head">
          <div>
            <span className="eyebrow">COMBINAR ARQUIVOS</span>
            <h2>Monte um PDF na ordem certa</h2>
            <p>PDFs entram diretamente. Imagens são convertidas localmente; documentos compatíveis usam LibreOffice quando disponível.</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Fechar"><SevenIcon name="close" /></button>
        </header>

        <div className="workflow-body">
          <div className="combine-summary-grid">
            <span><b>{inputs.length}</b> Arquivos</span>
            <span><b>{pdfCount}</b> PDFs</span>
            <span><b>{officeCount}</b> Documentos</span>
            <span><b>{imageCount}</b> Imagens</span>
          </div>

          <div className="combine-toolbar">
            <button className="primary-button" onClick={() => void chooseFiles()}><SevenIcon name="open" /> Adicionar arquivos</button>
            <button className="secondary-light-button" disabled={!openDocuments.length} onClick={addOpenDocuments}><SevenIcon name="pages" /> Adicionar PDFs abertos</button>
            <button className="secondary-light-button" disabled={!inputs.length} onClick={() => setInputs([])}>Limpar lista</button>
          </div>

          {!officeAvailable && (
            <div className="organizer-note">
              <SevenIcon name="shield" />
              <span>LibreOffice não foi detectado; formatos Office/OpenDocument/RTF/TXT/HTML ficam ocultos. PDF e imagens continuam disponíveis.</span>
            </div>
          )}

          <div className="combine-list">
            {inputs.map((path, index) => {
              const kind = sourceKind(path);
              return (
                <article className="combine-row" key={path}>
                  <span className="combine-order">{index + 1}</span>
                  <span className="file-tile">{extension(path).toUpperCase().slice(0, 5) || "FILE"}</span>
                  <div className="combine-file-meta">
                    <strong>{fileName(path)}</strong>
                    <small>{kind === "pdf" ? "PDF direto" : kind === "image" ? "Imagem → PDF local" : "Documento → PDF via LibreOffice"}</small>
                    <span title={path}>{path}</span>
                  </div>
                  <div className="combine-row-actions">
                    <button disabled={index === 0} title="Primeiro" onClick={() => moveEdge(index, "first")}>⇤</button>
                    <button disabled={index === 0} title="Subir" onClick={() => move(index, -1)}>↑</button>
                    <button disabled={index === inputs.length - 1} title="Descer" onClick={() => move(index, 1)}>↓</button>
                    <button disabled={index === inputs.length - 1} title="Último" onClick={() => moveEdge(index, "last")}>⇥</button>
                    <button className="danger-quiet" title="Remover" onClick={() => setInputs((current) => current.filter((_, itemIndex) => itemIndex !== index))}><SevenIcon name="close" /></button>
                  </div>
                </article>
              );
            })}
            {!inputs.length && (
              <button className="combine-empty" onClick={() => void chooseFiles()}>
                <SevenIcon name="merge" />
                <strong>Adicione pelo menos dois arquivos</strong>
                <span>Arraste arquivos para esta janela ou clique aqui. A ordem da lista será a ordem final.</span>
              </button>
            )}
          </div>

          <div className="organizer-note organizer-note--warning">
            <SevenIcon name="shield" />
            <span>Os arquivos originais nunca são modificados. Conversões intermediárias ficam no cache isolado e são removidas quando a tarefa termina.</span>
          </div>
        </div>

        <footer className="organizer-actions">
          <span className="dialog-footnote">{inputs.length < 2 ? "Selecione pelo menos dois arquivos." : `${inputs.length} arquivo(s) prontos para combinar.`}</span>
          <button className="secondary-light-button" onClick={onClose}>Cancelar</button>
          <button className="primary-button" disabled={inputs.length < 2 || busy} onClick={() => void submit()}>
            <SevenIcon name="merge" /> {busy ? "Preparando…" : "Combinar e salvar"}
          </button>
        </footer>
      </section>
    </div>
  );
}
