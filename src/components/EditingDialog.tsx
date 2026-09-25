import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type {
  BackgroundOptions,
  ImagePlacement,
  ImageObjectInfo,
  LinkPlacement,
  OverlayTextOptions,
  TextPlacement,
} from "../types";
import { SevenIcon } from "./SevenIcon";
import { getImageDimensions } from "../lib/native";

type EditMode = "add-text" | "replace-text" | "image" | "link" | "overlay" | "background";

interface EditingDialogProps {
  pageIndex: number;
  pageCount: number;
  imageObjects: ImageObjectInfo[];
  imageObjectsLoading: boolean;
  onClose: () => void;
  onAddText: (placement: TextPlacement) => void;
  onReplaceText: (find: string, replacement: string, allPages: boolean) => void;
  onReloadImages: () => void;
  onReplaceImage: (resourceName: string, imagePath: string) => void;
  onRemoveImage: (resourceName: string) => void;
  onAddImage: (placement: ImagePlacement) => void;
  onAddLink: (link: LinkPlacement) => void;
  onOverlay: (options: OverlayTextOptions) => void;
  onBackground: (options: BackgroundOptions) => void;
}

export function EditingDialog({
  pageIndex,
  pageCount,
  imageObjects,
  imageObjectsLoading,
  onClose,
  onAddText,
  onReplaceText,
  onReloadImages,
  onReplaceImage,
  onRemoveImage,
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
  const [imageSection, setImageSection] = useState<"insert" | "existing">("insert");
  const [imageRotation, setImageRotation] = useState(0);
  const [imageOpacity, setImageOpacity] = useState(1);
  const [mirrorX, setMirrorX] = useState(false);
  const [mirrorY, setMirrorY] = useState(false);
  const [cropLeft, setCropLeft] = useState(0);
  const [cropTop, setCropTop] = useState(0);
  const [cropRight, setCropRight] = useState(0);
  const [cropBottom, setCropBottom] = useState(0);
  const [lockAspect, setLockAspect] = useState(true);
  const [imageAspect, setImageAspect] = useState<number | null>(null);
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

  const chooseImage = async () => {
    const selected = await open({
      title: "Selecionar imagem",
      multiple: false,
      directory: false,
      filters: [{ name: "Imagem", extensions: ["png", "jpg", "jpeg", "tif", "tiff", "bmp", "webp"] }],
    });
    if (typeof selected === "string") {
      setImagePath(selected);
      try {
        const [pixelWidth, pixelHeight] = await getImageDimensions(selected);
        if (pixelWidth > 0 && pixelHeight > 0) {
          const aspect = pixelWidth / pixelHeight;
          setImageAspect(aspect);
          setHeight(Math.max(1, width / aspect));
        }
      } catch {
        setImageAspect(null);
      }
    }
  };

  const replaceExistingImage = async (resourceName: string) => {
    const selected = await open({
      title: `Substituir imagem ${resourceName}`,
      multiple: false,
      directory: false,
      filters: [{ name: "Imagem", extensions: ["png", "jpg", "jpeg", "tif", "tiff", "bmp", "webp"] }],
    });
    if (typeof selected === "string") onReplaceImage(resourceName, selected);
  };

  const rectFields = (
    <div className="rect-grid">
      <label className="workflow-field"><span>X</span><input type="number" value={x} onChange={(e) => setX(Number(e.target.value))} /></label>
      <label className="workflow-field"><span>Y</span><input type="number" value={y} onChange={(e) => setY(Number(e.target.value))} /></label>
      <label className="workflow-field"><span>Largura</span><input type="number" min={1} value={width} onChange={(e) => {
        const next = Number(e.target.value);
        setWidth(next);
        if (lockAspect && imageAspect) setHeight(Math.max(1, next / imageAspect));
      }} /></label>
      <label className="workflow-field"><span>Altura</span><input type="number" min={1} value={height} onChange={(e) => {
        const next = Number(e.target.value);
        setHeight(next);
        if (lockAspect && imageAspect) setWidth(Math.max(1, next * imageAspect));
      }} /></label>
    </div>
  );

  const apply = () => {
    if (mode === "add-text") {
      onAddText({ pageIndex, text, x, y, fontSize, rotation, gray });
      return;
    }
    if (mode === "replace-text") {
      onReplaceText(find, replacement, allPages);
      return;
    }
    if (mode === "image") {
      onAddImage({
        pageIndex,
        imagePath,
        x,
        y,
        width,
        height,
        rotation: imageRotation,
        opacity: imageOpacity,
        mirrorX,
        mirrorY,
        cropLeft,
        cropTop,
        cropRight,
        cropBottom,
      });
      return;
    }
    if (mode === "link") {
      onAddLink({
        pageIndex, x, y, width, height,
        target: internalLink ? "" : target,
        targetPage: internalLink ? Math.max(0, targetPage - 1) : undefined,
      });
      return;
    }
    if (mode === "overlay") {
      onOverlay({
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
    const value = background.replace("#", "");
    onBackground({
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
          <div><span className="eyebrow">EDITAR PDF</span><h2>Edição estrutural</h2><p>As alterações entram na sessão atual, com Desfazer/Refazer, e só substituem o original ao clicar em Salvar.</p></div>
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
            <div className="workflow-tabs inline">
              <button className={imageSection === "insert" ? "active" : ""} onClick={() => setImageSection("insert")}>Inserir nova</button>
              <button className={imageSection === "existing" ? "active" : ""} onClick={() => { setImageSection("existing"); onReloadImages(); }}>Imagens existentes</button>
            </div>

            {imageSection === "insert" ? (
              <>
                <button className="image-drop" onClick={() => void chooseImage()}>
                  <SevenIcon name="open" />
                  <strong>{imagePath || "Selecionar imagem"}</strong>
                  <small>PNG, JPEG, TIFF, BMP ou WebP.</small>
                </button>

                {rectFields}

                <div className="three-column-fields">
                  <label className="workflow-field"><span>Rotação</span><input type="number" min={-360} max={360} value={imageRotation} onChange={(e) => setImageRotation(Number(e.target.value))} /></label>
                  <label className="workflow-field"><span>Opacidade</span><input type="number" min={0} max={1} step={0.05} value={imageOpacity} onChange={(e) => setImageOpacity(Math.max(0, Math.min(1, Number(e.target.value))))} /></label>
                  <label className="toggle-row compact-toggle"><input type="checkbox" checked={lockAspect} disabled={!imageAspect} onChange={(e) => {
                    const enabled = e.target.checked;
                    setLockAspect(enabled);
                    if (enabled && imageAspect) setHeight(Math.max(1, width / imageAspect));
                  }} /><span><strong>Manter proporção</strong><small>{imageAspect ? `Proporção ${imageAspect.toFixed(3)}:1` : "Selecione uma imagem para detectar a proporção."}</small></span></label>
                </div>

                <div className="two-column-fields">
                  <label className="toggle-row"><input type="checkbox" checked={mirrorX} onChange={(e) => setMirrorX(e.target.checked)} /><span><strong>Espelhar horizontal</strong></span></label>
                  <label className="toggle-row"><input type="checkbox" checked={mirrorY} onChange={(e) => setMirrorY(e.target.checked)} /><span><strong>Espelhar vertical</strong></span></label>
                </div>

                <fieldset className="image-crop-box">
                  <legend>Recorte proporcional</legend>
                  <div className="four-column-fields">
                    <label className="workflow-field"><span>Esq.</span><input type="number" min={0} max={0.95} step={0.01} value={cropLeft} onChange={(e) => setCropLeft(Number(e.target.value))} /></label>
                    <label className="workflow-field"><span>Topo</span><input type="number" min={0} max={0.95} step={0.01} value={cropTop} onChange={(e) => setCropTop(Number(e.target.value))} /></label>
                    <label className="workflow-field"><span>Dir.</span><input type="number" min={0} max={0.95} step={0.01} value={cropRight} onChange={(e) => setCropRight(Number(e.target.value))} /></label>
                    <label className="workflow-field"><span>Base</span><input type="number" min={0} max={0.95} step={0.01} value={cropBottom} onChange={(e) => setCropBottom(Number(e.target.value))} /></label>
                  </div>
                  <small>0 = sem recorte; 0,10 = remove 10% daquele lado.</small>
                </fieldset>
              </>
            ) : (
              <>
                {imageObjectsLoading && <div className="report-loading"><span className="loader-ring" /> Lendo XObjects de imagem…</div>}
                {!imageObjectsLoading && imageObjects.length === 0 && (
                  <div className="empty-panel">Nenhuma imagem de nível de página encontrada. Imagens dentro de Form XObjects são preservadas e não são alteradas automaticamente.</div>
                )}
                {!imageObjectsLoading && imageObjects.length > 0 && (
                  <div className="image-object-list">
                    {imageObjects.map((object) => (
                      <article className="image-object-row" key={object.resourceName}>
                        <span className="image-object-glyph"><SevenIcon name="open" /></span>
                        <div>
                          <strong>/{object.resourceName}</strong>
                          <small>{object.pixelWidth && object.pixelHeight ? `${object.pixelWidth} × ${object.pixelHeight} px` : "Dimensão não declarada"} · objeto {object.objectId}</small>
                        </div>
                        <button className="secondary-light-button" onClick={() => void replaceExistingImage(object.resourceName)}>Substituir</button>
                        <button className="danger-quiet" onClick={() => onRemoveImage(object.resourceName)}>Remover</button>
                      </article>
                    ))}
                  </div>
                )}
              </>
            )}
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

          {!(mode === "image" && imageSection === "existing") && (
            <button className="primary-button workflow-submit" disabled={!canApply} onClick={apply}><SevenIcon name="edit" /> Aplicar à sessão</button>
          )}
        </div>
      </section>
    </div>
  );
}
