import { useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import type {
  BackgroundOptions,
  ImagePlacement,
  LinkPlacement,
  OverlayTextOptions,
  TextPlacement,
} from "../types";
import { SevenIcon } from "./SevenIcon";

type EditMode = "add-text" | "replace-text" | "image" | "link" | "overlay" | "background";

interface EditingDialogProps {
  documentPath: string;
  pageIndex: number;
  pageCount: number;
  onClose: () => void;
  onAddText: (output: string, placement: TextPlacement) => void;
  onReplaceText: (output: string, find: string, replacement: string, allPages: boolean) => void;
  onAddImage: (output: string, placement: ImagePlacement) => void;
  onAddLink: (output: string, link: LinkPlacement) => void;
  onOverlay: (output: string, options: OverlayTextOptions) => void;
  onBackground: (output: string, options: BackgroundOptions) => void;
}

export function EditingDialog({
  documentPath,
  pageIndex,
  pageCount,
  onClose,
  onAddText,
  onReplaceText,
  onAddImage,
  onAddLink,
  onOverlay,
  onBackground,
}: EditingDialogProps) {
  const [mode, setMode] = useState<EditMode>("add-text");
  const [text, setText] = useState("");
  const [find, setFind] = useState("");
  const [replacement, setReplacement] = useState("");
  const [allPages, setAllPages] = useState(false);
  const [imagePath, setImagePath] = useState("");
  const [target, setTarget] = useState("");
  const [internalLink, setInternalLink] = useState(false);
  const [targetPage, setTargetPage] = useState(1);
  const [x, setX] = useState(48);
  const [y, setY] = useState(48);
  const [width, setWidth] = useState(180);
  const [height, setHeight] = useState(48);
  const [fontSize, setFontSize] = useState(12);
  const [rotation, setRotation] = useState(0);
  const [gray, setGray] = useState(0.15);
  const [overlayKind, setOverlayKind] = useState<OverlayTextOptions["kind"]>("watermark");
  const [prefix, setPrefix] = useState("DOC-");
  const [startNumber, setStartNumber] = useState(1);
  const [digits, setDigits] = useState(6);
  const [pageStart, setPageStart] = useState(1);
  const [pageEnd, setPageEnd] = useState(pageCount);
  const [background, setBackground] = useState("#ffffff");

  const chooseOutput = async (suffix: string) => save({
    title: "Salvar PDF editado",
    defaultPath: documentPath.replace(/\.pdf$/i, `-${suffix}.pdf`),
    filters: [{ name: "Documento PDF", extensions: ["pdf"] }],
  });

  const chooseImage = async () => {
    const selected = await open({
      title: "Selecionar imagem",
      multiple: false,
      directory: false,
      filters: [{ name: "Imagem", extensions: ["png", "jpg", "jpeg", "tif", "tiff", "bmp", "webp"] }],
    });
    if (typeof selected === "string") setImagePath(selected);
  };

  const rectFields = (
    <div className="rect-grid">
      <label className="workflow-field"><span>X</span><input type="number" value={x} onChange={(e) => setX(Number(e.target.value))} /></label>
      <label className="workflow-field"><span>Y</span><input type="number" value={y} onChange={(e) => setY(Number(e.target.value))} /></label>
      <label className="workflow-field"><span>Largura</span><input type="number" min={1} value={width} onChange={(e) => setWidth(Number(e.target.value))} /></label>
      <label className="workflow-field"><span>Altura</span><input type="number" min={1} value={height} onChange={(e) => setHeight(Number(e.target.value))} /></label>
    </div>
  );

  const apply = async () => {
    if (mode === "add-text") {
      const output = await chooseOutput("texto");
      if (output) onAddText(output, { pageIndex, text, x, y, fontSize, rotation, gray });
      return;
    }
    if (mode === "replace-text") {
      const output = await chooseOutput("texto-substituido");
      if (output) onReplaceText(output, find, replacement, allPages);
      return;
    }
    if (mode === "image") {
      const output = await chooseOutput("imagem");
      if (output) onAddImage(output, { pageIndex, imagePath, x, y, width, height });
      return;
    }
    if (mode === "link") {
      const output = await chooseOutput("link");
      if (output) onAddLink(output, {
        pageIndex, x, y, width, height,
        target: internalLink ? "" : target,
        targetPage: internalLink ? Math.max(0, targetPage - 1) : undefined,
      });
      return;
    }
    if (mode === "overlay") {
      const output = await chooseOutput(overlayKind);
      if (output) onOverlay(output, {
        kind: overlayKind,
        text,
        prefix,
        startNumber,
        digits,
        fontSize,
        pageStart: Math.max(0, pageStart - 1),
        pageEnd: Math.max(0, pageEnd - 1),
      });
      return;
    }
    const output = await chooseOutput("fundo");
    if (!output) return;
    const value = background.replace("#", "");
    onBackground(output, {
      pageStart: Math.max(0, pageStart - 1),
      pageEnd: Math.max(0, pageEnd - 1),
      red: parseInt(value.slice(0, 2), 16) / 255,
      green: parseInt(value.slice(2, 4), 16) / 255,
      blue: parseInt(value.slice(4, 6), 16) / 255,
    });
  };

  const canApply =
    mode === "add-text" ? Boolean(text.trim())
      : mode === "replace-text" ? Boolean(find)
        : mode === "image" ? Boolean(imagePath)
          : mode === "link" ? (internalLink ? targetPage >= 1 : Boolean(target.trim()))
            : true;

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="workflow-dialog editing-dialog" role="dialog" aria-modal="true">
        <header className="organizer-head">
          <div><span className="eyebrow">EDITAR PDF</span><h2>Edição estrutural</h2><p>Insere ou altera objetos/streams do PDF e salva em uma nova cópia.</p></div>
          <button className="icon-button" onClick={onClose} aria-label="Fechar"><SevenIcon name="close" /></button>
        </header>

        <div className="edit-mode-grid">
          {([
            ["add-text", "Texto", "text"],
            ["replace-text", "Substituir", "edit"],
            ["image", "Imagem", "open"],
            ["link", "Link", "attachment"],
            ["overlay", "Cabeçalho / Bates", "pages"],
            ["background", "Fundo", "layers"],
          ] as const).map(([id, label, icon]) => (
            <button key={id} className={mode === id ? "edit-mode active" : "edit-mode"} onClick={() => setMode(id)}>
              <SevenIcon name={icon} /><span>{label}</span>
            </button>
          ))}
        </div>

        <div className="workflow-body">
          {mode === "add-text" && <>
            <label className="workflow-field"><span>Texto</span><textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} /></label>
            <div className="three-column-fields">
              <label className="workflow-field"><span>Tamanho</span><input type="number" min={1} max={300} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} /></label>
              <label className="workflow-field"><span>Rotação</span><input type="number" value={rotation} onChange={(e) => setRotation(Number(e.target.value))} /></label>
              <label className="workflow-field"><span>Cinza 0–1</span><input type="number" min={0} max={1} step={0.05} value={gray} onChange={(e) => setGray(Number(e.target.value))} /></label>
            </div>
            {rectFields}
          </>}

          {mode === "replace-text" && <>
            <div className="two-column-fields">
              <label className="workflow-field"><span>Localizar</span><input value={find} onChange={(e) => setFind(e.target.value)} /></label>
              <label className="workflow-field"><span>Substituir por</span><input value={replacement} onChange={(e) => setReplacement(e.target.value)} /></label>
            </div>
            <label className="toggle-row"><input type="checkbox" checked={allPages} onChange={(e) => setAllPages(e.target.checked)} /><span><strong>Todas as páginas</strong><small>Desmarcado: altera somente a página {pageIndex + 1}.</small></span></label>
            <div className="organizer-note organizer-note--warning"><SevenIcon name="shield" /><span>A substituição direta funciona em strings Tj/TJ. PDFs com CID, glifos desenhados ou texto dentro de XObjects são recusados em vez de serem corrompidos.</span></div>
          </>}

          {mode === "image" && <>
            <button className="image-drop" onClick={() => void chooseImage()}><SevenIcon name="open" /><strong>{imagePath || "Selecionar imagem"}</strong><small>PNG, JPEG, TIFF, BMP ou WebP.</small></button>
            {rectFields}
          </>}

          {mode === "link" && <>
            <label className="toggle-row"><input type="checkbox" checked={internalLink} onChange={(e) => setInternalLink(e.target.checked)} /><span><strong>Destino interno</strong><small>Cria /Dest para outra página em vez de URI.</small></span></label>
            {internalLink
              ? <label className="workflow-field"><span>Página de destino</span><input type="number" min={1} max={pageCount} value={targetPage} onChange={(e) => setTargetPage(Number(e.target.value))} /></label>
              : <label className="workflow-field"><span>URL</span><input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="https://..." /></label>}
            {rectFields}
          </>}

          {mode === "overlay" && <>
            <label className="workflow-field"><span>Tipo</span><select value={overlayKind} onChange={(e) => setOverlayKind(e.target.value as OverlayTextOptions["kind"])}><option value="header">Cabeçalho</option><option value="footer">Rodapé</option><option value="page-number">Número de página</option><option value="watermark">Marca d’água</option><option value="bates">Numeração Bates</option></select></label>
            {overlayKind !== "page-number" && overlayKind !== "bates" && <label className="workflow-field"><span>Texto</span><input value={text} onChange={(e) => setText(e.target.value)} /></label>}
            {overlayKind === "bates" && <div className="three-column-fields"><label className="workflow-field"><span>Prefixo</span><input value={prefix} onChange={(e) => setPrefix(e.target.value)} /></label><label className="workflow-field"><span>Número inicial</span><input type="number" min={0} value={startNumber} onChange={(e) => setStartNumber(Number(e.target.value))} /></label><label className="workflow-field"><span>Dígitos</span><input type="number" min={1} max={20} value={digits} onChange={(e) => setDigits(Number(e.target.value))} /></label></div>}
            <div className="three-column-fields"><label className="workflow-field"><span>Fonte</span><input type="number" min={1} max={200} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} /></label><label className="workflow-field"><span>Da página</span><input type="number" min={1} max={pageCount} value={pageStart} onChange={(e) => setPageStart(Number(e.target.value))} /></label><label className="workflow-field"><span>Até</span><input type="number" min={1} max={pageCount} value={pageEnd} onChange={(e) => setPageEnd(Number(e.target.value))} /></label></div>
          </>}

          {mode === "background" && <>
            <label className="workflow-field"><span>Cor de fundo</span><input className="color-field" type="color" value={background} onChange={(e) => setBackground(e.target.value)} /></label>
            <div className="two-column-fields"><label className="workflow-field"><span>Da página</span><input type="number" min={1} max={pageCount} value={pageStart} onChange={(e) => setPageStart(Number(e.target.value))} /></label><label className="workflow-field"><span>Até</span><input type="number" min={1} max={pageCount} value={pageEnd} onChange={(e) => setPageEnd(Number(e.target.value))} /></label></div>
          </>}

          <button className="primary-button workflow-submit" disabled={!canApply} onClick={() => void apply()}><SevenIcon name="save" /> Aplicar em nova cópia</button>
        </div>
      </section>
    </div>
  );
}
