import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { SevenIcon } from "./SevenIcon";

export type BlankPageSize = "a4" | "letter" | "legal";

interface CreatePdfDialogProps {
  onClose: () => void;
  onCreate: (pageSize: BlankPageSize, pageCount: number) => void;
  onCreateImages: (inputs: string[], dpi: number) => void;
}

const sizes: Array<{ id: BlankPageSize; name: string; detail: string }> = [
  { id: "a4", name: "A4", detail: "210 × 297 mm" },
  { id: "letter", name: "Carta", detail: "8,5 × 11 pol." },
  { id: "legal", name: "Ofício / Legal", detail: "8,5 × 14 pol." },
];

export function CreatePdfDialog({ onClose, onCreate, onCreateImages }: CreatePdfDialogProps) {
  const [mode, setMode] = useState<"blank" | "images">("blank");
  const [pageSize, setPageSize] = useState<BlankPageSize>("a4");
  const [pageCount, setPageCount] = useState(1);
  const [images, setImages] = useState<string[]>([]);
  const [dpi, setDpi] = useState(150);

  const chooseImages = async () => {
    const selected = await open({
      title: "Selecionar imagens",
      multiple: true,
      directory: false,
      filters: [{ name: "Imagens", extensions: ["png", "jpg", "jpeg", "tif", "tiff", "bmp", "webp"] }],
    });
    if (Array.isArray(selected)) setImages(selected);
    else if (typeof selected === "string") setImages([selected]);
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="create-dialog" role="dialog" aria-modal="true" aria-labelledby="create-pdf-title">
        <header className="organizer-head">
          <div><span className="eyebrow">NOVO DOCUMENTO</span><h2 id="create-pdf-title">Criar PDF</h2><p>Criação local, sem upload e sem rasterizar documentos existentes.</p></div>
          <button className="icon-button" onClick={onClose} aria-label="Fechar"><SevenIcon name="close" /></button>
        </header>

        <div className="workflow-tabs">
          <button className={mode === "blank" ? "active" : ""} onClick={() => setMode("blank")}>Página em branco</button>
          <button className={mode === "images" ? "active" : ""} onClick={() => setMode("images")}>Imagens → PDF</button>
        </div>

        {mode === "blank" ? (
          <div className="create-body">
            <div className="paper-preview" aria-hidden="true"><div className={`paper-sheet paper-${pageSize}`}><span>{pageCount}</span><small>{pageCount === 1 ? "página" : "páginas"}</small></div></div>
            <div className="create-options">
              <fieldset><legend>Tamanho da página</legend><div className="paper-size-grid">{sizes.map((size) => (
                <button key={size.id} type="button" className={pageSize === size.id ? "paper-size active" : "paper-size"} onClick={() => setPageSize(size.id)}><strong>{size.name}</strong><small>{size.detail}</small></button>
              ))}</div></fieldset>
              <label><span>Quantidade de páginas</span><input type="number" min={1} max={500} value={pageCount} onChange={(event) => setPageCount(Math.max(1, Math.min(500, Number(event.target.value) || 1)))} /><small>Entre 1 e 500 páginas.</small></label>
            </div>
          </div>
        ) : (
          <div className="workflow-body">
            <button className="image-drop" onClick={() => void chooseImages()}><SevenIcon name="open" /><strong>{images.length ? `${images.length} imagem(ns) selecionada(s)` : "Selecionar imagens"}</strong><small>PNG, JPEG, TIFF, BMP e WebP · a ordem selecionada vira a ordem das páginas.</small></button>
            <label className="workflow-field"><span>DPI usado para calcular o tamanho físico da página</span><div className="range-row"><input type="range" min={72} max={600} step={6} value={dpi} onChange={(event) => setDpi(Number(event.target.value))} /><strong>{dpi} DPI</strong></div></label>
          </div>
        )}

        <footer className="organizer-actions">
          <button className="secondary-light-button" onClick={onClose}>Cancelar</button>
          <button className="primary-button" disabled={mode === "images" && images.length === 0} onClick={() => mode === "blank" ? onCreate(pageSize, pageCount) : onCreateImages(images, dpi)}>
            <SevenIcon name="create" /> Criar documento
          </button>
        </footer>
      </section>
    </div>
  );
}
