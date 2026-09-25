import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type {
  BackgroundOptions,
  ImagePlacement,
  ImageObjectInfo,
  LinkInfo,
  LinkPlacement,
  LinkTargetKind,
  LinkUpdate,
  ManagedElementInfo,
  NamedDestinationInfo,
  PageLabelOptions,
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
  links: LinkInfo[];
  linksLoading: boolean;
  namedDestinations: NamedDestinationInfo[];
  managedElements: ManagedElementInfo[];
  onClose: () => void;
  onAddText: (placement: TextPlacement) => void;
  onReplaceText: (find: string, replacement: string, allPages: boolean) => void;
  onReloadImages: () => void;
  onReplaceImage: (resourceName: string, imagePath: string) => void;
  onRemoveImage: (resourceName: string) => void;
  onAddImage: (placement: ImagePlacement) => void;
  onReloadLinks: () => void;
  onReloadNamedDestinations: () => void;
  onUpsertNamedDestination: (oldName: string | undefined, name: string, pageIndex: number) => void;
  onRemoveNamedDestination: (name: string) => void;
  onUpdateLink: (update: LinkUpdate) => void;
  onRemoveLink: (pageIndex: number, objectId: string) => void;
  onAddLink: (link: LinkPlacement) => void;
  onReloadManagedElements: () => void;
  onUpdateManagedOverlay: (elementId: string, options: OverlayTextOptions) => void;
  onUpdateManagedBackground: (elementId: string, options: BackgroundOptions) => void;
  onRemoveManagedElement: (elementId: string) => void;
  onSetPageLabels: (options: PageLabelOptions) => void;
  onOverlay: (options: OverlayTextOptions) => void;
  onBackground: (options: BackgroundOptions) => void;
}

export function EditingDialog({
  pageIndex,
  pageCount,
  imageObjects,
  imageObjectsLoading,
  links,
  linksLoading,
  namedDestinations,
  managedElements,
  onClose,
  onAddText,
  onReplaceText,
  onReloadImages,
  onReplaceImage,
  onRemoveImage,
  onAddImage,
  onReloadLinks,
  onReloadNamedDestinations,
  onUpsertNamedDestination,
  onRemoveNamedDestination,
  onUpdateLink,
  onRemoveLink,
  onAddLink,
  onReloadManagedElements,
  onUpdateManagedOverlay,
  onUpdateManagedBackground,
  onRemoveManagedElement,
  onSetPageLabels,
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
  const [linkSection, setLinkSection] = useState<"create" | "existing" | "destinations">("create");
  const [linkKind, setLinkKind] = useState<LinkTargetKind>("url");
  const [targetPage, setTargetPage] = useState(1);
  const [namedDestination, setNamedDestination] = useState("");
  const [linkBorderWidth, setLinkBorderWidth] = useState(0);
  const [linkBorderColor, setLinkBorderColor] = useState("#2458d6");
  const [editingLinkId, setEditingLinkId] = useState("");
  const [editingLinkPageIndex, setEditingLinkPageIndex] = useState(pageIndex);
  const [destinationName, setDestinationName] = useState("");
  const [destinationPage, setDestinationPage] = useState(pageIndex + 1);
  const [editingDestinationOldName, setEditingDestinationOldName] = useState<string | undefined>(undefined);
  const [x, setX] = useState(48);
  const [y, setY] = useState(48);
  const [width, setWidth] = useState(180);
  const [height, setHeight] = useState(48);
  const [fontSize, setFontSize] = useState(12);
  const [rotation, setRotation] = useState(0);
  const [gray, setGray] = useState(0.15);
  const [overlayKind, setOverlayKind] = useState<OverlayTextOptions["kind"]>("watermark");
  const [overlaySection, setOverlaySection] = useState<"create" | "manage" | "labels">("create");
  const [editingManagedId, setEditingManagedId] = useState("");
  const [suffix, setSuffix] = useState("");
  const [overlayParity, setOverlayParity] = useState<OverlayTextOptions["parity"]>("all");
  const [overlayPosition, setOverlayPosition] = useState<OverlayTextOptions["position"]>("center");
  const [marginX, setMarginX] = useState(36);
  const [marginY, setMarginY] = useState(20);
  const [overlayOpacity, setOverlayOpacity] = useState(0.35);
  const [overlayImagePath, setOverlayImagePath] = useState("");
  const [overlayImageScale, setOverlayImageScale] = useState(1);
  const [pageLabelStyle, setPageLabelStyle] = useState<PageLabelOptions["style"]>("decimal");
  const [pageLabelPrefix, setPageLabelPrefix] = useState("");
  const [pageLabelSuffix, setPageLabelSuffix] = useState("");
  const [pageLabelStartNumber, setPageLabelStartNumber] = useState(1);
  const [prefix, setPrefix] = useState("DOC-");
  const [startNumber, setStartNumber] = useState(1);
  const [digits, setDigits] = useState(6);
  const [pageStart, setPageStart] = useState(1);
  const [pageEnd, setPageEnd] = useState(pageCount);
  const [background, setBackground] = useState("#ffffff");
  const [backgroundOpacity, setBackgroundOpacity] = useState(1);
  const [backgroundImagePath, setBackgroundImagePath] = useState("");
  const [backgroundImageScale, setBackgroundImageScale] = useState(1);
  const [backgroundPosition, setBackgroundPosition] = useState<BackgroundOptions["position"]>("center");

  const chooseOverlayImage = async (target: "watermark" | "background") => {
    const selected = await open({
      title: target === "watermark" ? "Selecionar imagem da marca d'água" : "Selecionar imagem de fundo",
      multiple: false,
      directory: false,
      filters: [{ name: "Imagem", extensions: ["png", "jpg", "jpeg", "tif", "tiff", "bmp", "webp"] }],
    });
    if (typeof selected === "string") {
      if (target === "watermark") setOverlayImagePath(selected);
      else setBackgroundImagePath(selected);
    }
  };

  const currentOverlayOptions = (): OverlayTextOptions => ({
    kind: overlayKind,
    text,
    prefix,
    suffix,
    startNumber,
    digits,
    fontSize,
    pageStart: Math.max(0, pageStart - 1),
    pageEnd: Math.max(0, pageEnd - 1),
    parity: overlayParity,
    position: overlayPosition,
    marginX,
    marginY,
    rotation,
    opacity: overlayOpacity,
    imagePath: overlayImagePath || undefined,
    imageScale: overlayImageScale,
  });

  const currentBackgroundOptions = (): BackgroundOptions => {
    const value = background.replace("#", "");
    return {
      pageStart: Math.max(0, pageStart - 1),
      pageEnd: Math.max(0, pageEnd - 1),
      red: parseInt(value.slice(0, 2), 16) / 255,
      green: parseInt(value.slice(2, 4), 16) / 255,
      blue: parseInt(value.slice(4, 6), 16) / 255,
      opacity: backgroundOpacity,
      imagePath: backgroundImagePath || undefined,
      imageScale: backgroundImageScale,
      position: backgroundPosition,
    };
  };

  const loadManagedElement = (element: ManagedElementInfo) => {
    try {
      const parsed = JSON.parse(element.optionsJson) as Partial<OverlayTextOptions & BackgroundOptions>;
      setEditingManagedId(element.id);
      if (element.kind === "background") {
        setMode("background");
        setPageStart((parsed.pageStart ?? 0) + 1);
        setPageEnd((parsed.pageEnd ?? pageCount - 1) + 1);
        setBackgroundOpacity(parsed.opacity ?? 1);
        setBackgroundImagePath(parsed.imagePath ?? "");
        setBackgroundImageScale(parsed.imageScale ?? 1);
        setBackgroundPosition((parsed.position as BackgroundOptions["position"]) ?? "center");
        const red = Math.round((parsed.red ?? 1) * 255).toString(16).padStart(2, "0");
        const green = Math.round((parsed.green ?? 1) * 255).toString(16).padStart(2, "0");
        const blue = Math.round((parsed.blue ?? 1) * 255).toString(16).padStart(2, "0");
        setBackground(`#${red}${green}${blue}`);
      } else {
        setMode("overlay");
        setOverlaySection("create");
        setOverlayKind((parsed.kind as OverlayTextOptions["kind"]) ?? "watermark");
        setText(parsed.text ?? "");
        setPrefix(parsed.prefix ?? "");
        setSuffix(parsed.suffix ?? "");
        setStartNumber(parsed.startNumber ?? 1);
        setDigits(parsed.digits ?? 6);
        setFontSize(parsed.fontSize ?? 12);
        setPageStart((parsed.pageStart ?? 0) + 1);
        setPageEnd((parsed.pageEnd ?? pageCount - 1) + 1);
        setOverlayParity((parsed.parity as OverlayTextOptions["parity"]) ?? "all");
        setOverlayPosition((parsed.position as OverlayTextOptions["position"]) ?? "center");
        setMarginX(parsed.marginX ?? 36);
        setMarginY(parsed.marginY ?? 20);
        setRotation(parsed.rotation ?? 0);
        setOverlayOpacity(parsed.opacity ?? 0.35);
        setOverlayImagePath(parsed.imagePath ?? "");
        setOverlayImageScale(parsed.imageScale ?? 1);
      }
    } catch {
      setEditingManagedId(element.id);
    }
  };

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

  const hexToRgb = (hex: string): [number, number, number] => {
    const value = hex.replace("#", "").padEnd(6, "0").slice(0, 6);
    return [
      parseInt(value.slice(0, 2), 16) / 255,
      parseInt(value.slice(2, 4), 16) / 255,
      parseInt(value.slice(4, 6), 16) / 255,
    ];
  };

  const rgbToHex = (rgb: [number, number, number]): string =>
    `#${rgb.map((component) =>
      Math.max(0, Math.min(255, Math.round(component * 255))).toString(16).padStart(2, "0")
    ).join("")}`;

  const loadLinkForEdit = (link: LinkInfo) => {
    const [x1, y1, x2, y2] = link.rect;
    setEditingLinkId(link.objectId);
    setEditingLinkPageIndex(link.pageIndex);
    setX(x1);
    setY(y1);
    setWidth(Math.max(1, x2 - x1));
    setHeight(Math.max(1, y2 - y1));
    setLinkKind(link.targetKind === "unknown" ? "url" : link.targetKind);
    setTarget(link.target);
    setTargetPage((link.targetPage ?? 0) + 1);
    setNamedDestination(link.namedDestination ?? "");
    setLinkBorderWidth(link.borderWidth);
    setLinkBorderColor(rgbToHex(link.borderColor));
  };

  const currentLinkPayload = () => ({
    x,
    y,
    width,
    height,
    targetKind: linkKind,
    target,
    targetPage: linkKind === "page" ? Math.max(0, targetPage - 1) : undefined,
    namedDestination: linkKind === "named" ? namedDestination : undefined,
    borderWidth: linkBorderWidth,
    borderColor: hexToRgb(linkBorderColor),
  });

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
        pageIndex,
        ...currentLinkPayload(),
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
          : mode === "link"
            ? linkSection === "existing"
              ? false
              : linkKind === "page"
                ? targetPage >= 1
                : linkKind === "named"
                  ? Boolean(namedDestination.trim())
                  : Boolean(target.trim())
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
            <button key={id} className={mode === id ? "edit-mode active" : "edit-mode"} onClick={() => { setMode(id); if (id === "link") onReloadNamedDestinations(); }}>
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
            <div className="workflow-tabs inline">
              <button className={linkSection === "create" ? "active" : ""} onClick={() => { setLinkSection("create"); setEditingLinkId(""); }}>Criar link</button>
              <button className={linkSection === "existing" ? "active" : ""} onClick={() => { setLinkSection("existing"); setEditingLinkId(""); onReloadLinks(); }}>Links existentes</button>
              <button className={linkSection === "destinations" ? "active" : ""} onClick={() => { setLinkSection("destinations"); setEditingLinkId(""); onReloadNamedDestinations(); }}>Destinos</button>
            </div>

            {linkSection === "create" ? (
              <>
                <label className="workflow-field"><span>Tipo de destino</span><select value={linkKind} onChange={(e) => setLinkKind(e.target.value as LinkTargetKind)}><option value="url">URL web</option><option value="page">Página do PDF</option><option value="file">Arquivo externo</option><option value="named">Destino nomeado</option></select></label>
                {linkKind === "page"
                  ? <label className="workflow-field"><span>Página de destino</span><input type="number" min={1} max={pageCount} value={targetPage} onChange={(e) => setTargetPage(Number(e.target.value))} /></label>
                  : linkKind === "named"
                    ? <label className="workflow-field"><span>Destino nomeado</span><select value={namedDestination} onChange={(e) => setNamedDestination(e.target.value)}><option value="">Selecione…</option>{namedDestinations.map((destination)=><option key={destination.name} value={destination.name}>{destination.name}{destination.pageIndex!==undefined?` · pág. ${destination.pageIndex+1}`:""}</option>)}</select><small>Crie e gerencie destinos na aba “Destinos”.</small></label>
                    : <label className="workflow-field"><span>{linkKind === "file" ? "Arquivo/caminho" : "URL"}</span><input value={target} onChange={(e) => setTarget(e.target.value)} placeholder={linkKind === "url" ? "https://..." : "arquivo.pdf"} /></label>}
                {linkKind === "file" && <div className="organizer-note organizer-note--warning"><SevenIcon name="lock"/><span>O link será gravado como /Launch para compatibilidade, mas o Seven Reader não executa Launch automaticamente.</span></div>}
                {rectFields}
                <div className="two-column-fields">
                  <label className="workflow-field"><span>Espessura da borda</span><input type="number" min={0} max={20} step={0.25} value={linkBorderWidth} onChange={(e)=>setLinkBorderWidth(Math.max(0,Math.min(20,Number(e.target.value)||0)))}/></label>
                  <label className="workflow-field"><span>Cor da borda</span><input type="color" value={linkBorderColor} onChange={(e)=>setLinkBorderColor(e.target.value)}/></label>
                </div>
              </>
            ) : linkSection === "existing" ? (
              <>
                {linksLoading && <div className="report-loading"><span className="loader-ring"/> Lendo links das páginas…</div>}
                {!linksLoading && !editingLinkId && links.length === 0 && <div className="empty-panel">Nenhuma anotação Link encontrada.</div>}
                {!linksLoading && !editingLinkId && links.length > 0 && (
                  <div className="link-object-list">
                    {links.map((link)=>(
                      <button key={link.objectId} onClick={()=>loadLinkForEdit(link)}>
                        <span><SevenIcon name="attachment"/></span>
                        <div><strong>Página {link.pageIndex+1} · {link.targetKind}</strong><small>{link.target || link.namedDestination || (link.targetPage!==undefined?`Página ${link.targetPage+1}`:"Destino não resolvido")}</small></div>
                        <SevenIcon name="chevronRight"/>
                      </button>
                    ))}
                  </div>
                )}
                {editingLinkId && (
                  <>
                    <div className="form-edit-heading"><div><strong>Editando link</strong><small>{editingLinkId} · página {editingLinkPageIndex+1}</small></div><button className="secondary-light-button" onClick={()=>setEditingLinkId("")}>Escolher outro</button></div>
                    <label className="workflow-field"><span>Tipo de destino</span><select value={linkKind} onChange={(e) => setLinkKind(e.target.value as LinkTargetKind)}><option value="url">URL web</option><option value="page">Página do PDF</option><option value="file">Arquivo externo</option><option value="named">Destino nomeado</option></select></label>
                    {linkKind === "page"
                      ? <label className="workflow-field"><span>Página de destino</span><input type="number" min={1} max={pageCount} value={targetPage} onChange={(e) => setTargetPage(Number(e.target.value))} /></label>
                      : linkKind === "named"
                        ? <label className="workflow-field"><span>Destino nomeado</span><select value={namedDestination} onChange={(e) => setNamedDestination(e.target.value)}><option value="">Selecione…</option>{namedDestinations.map((destination)=><option key={destination.name} value={destination.name}>{destination.name}{destination.pageIndex!==undefined?` · pág. ${destination.pageIndex+1}`:""}</option>)}</select></label>
                        : <label className="workflow-field"><span>{linkKind === "file" ? "Arquivo/caminho" : "URL"}</span><input value={target} onChange={(e) => setTarget(e.target.value)} placeholder={linkKind === "url" ? "https://..." : "arquivo.pdf"} /></label>}
                    {rectFields}
                    <div className="two-column-fields">
                      <label className="workflow-field"><span>Espessura da borda</span><input type="number" min={0} max={20} step={0.25} value={linkBorderWidth} onChange={(e)=>setLinkBorderWidth(Math.max(0,Math.min(20,Number(e.target.value)||0)))}/></label>
                      <label className="workflow-field"><span>Cor da borda</span><input type="color" value={linkBorderColor} onChange={(e)=>setLinkBorderColor(e.target.value)}/></label>
                    </div>
                    <div className="form-edit-actions">
                      <button className="danger-quiet" onClick={()=>{onRemoveLink(editingLinkPageIndex,editingLinkId);setEditingLinkId("");}}>Remover link</button>
                      <button className="primary-button" onClick={()=>onUpdateLink({objectId:editingLinkId,pageIndex:editingLinkPageIndex,...currentLinkPayload()})}><SevenIcon name="save"/> Aplicar link</button>
                    </div>
                  </>
                )}
              </>
            ) : (
              <>
                <div className="two-column-fields">
                  <label className="workflow-field"><span>Nome do destino</span><input value={destinationName} onChange={(e)=>setDestinationName(e.target.value)} placeholder="ex.: introducao"/></label>
                  <label className="workflow-field"><span>Página</span><input type="number" min={1} max={pageCount} value={destinationPage} onChange={(e)=>setDestinationPage(Math.max(1,Math.min(pageCount,Number(e.target.value)||1)))}/></label>
                </div>
                <div className="form-edit-actions">
                  {editingDestinationOldName && <button className="secondary-light-button" onClick={()=>{setEditingDestinationOldName(undefined);setDestinationName("");setDestinationPage(pageIndex+1);}}>Cancelar edição</button>}
                  <button className="primary-button" disabled={!destinationName.trim()} onClick={()=>{onUpsertNamedDestination(editingDestinationOldName,destinationName,Math.max(0,destinationPage-1));setEditingDestinationOldName(undefined);}}><SevenIcon name="save"/>{editingDestinationOldName?" Atualizar destino":" Criar destino"}</button>
                </div>
                <div className="named-destination-list">
                  {namedDestinations.map((destination)=>(
                    <article key={destination.name}>
                      <span><SevenIcon name="bookmark"/></span>
                      <div><strong>{destination.name}</strong><small>{destination.pageIndex!==undefined?`Página ${destination.pageIndex+1}`:"Destino não resolvido"} · {destination.editable?"Editável":"Name Tree externa"}</small></div>
                      {destination.editable && <>
                        <button onClick={()=>{setEditingDestinationOldName(destination.name);setDestinationName(destination.name);setDestinationPage((destination.pageIndex??pageIndex)+1);}}>Editar</button>
                        <button className="danger-quiet" onClick={()=>onRemoveNamedDestination(destination.name)}>Remover</button>
                      </>}
                    </article>
                  ))}
                  {namedDestinations.length===0&&<div className="empty-panel">Nenhum destino nomeado encontrado.</div>}
                </div>
                <div className="organizer-note"><SevenIcon name="shield"/><span>Destinos encontrados em Name Trees externas são listados e podem ser usados por links, mas só destinos gerenciados no dicionário /Dests são alterados por este editor.</span></div>
              </>
            )}
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

          {!(mode === "image" && imageSection === "existing") && !(mode === "link" && linkSection !== "create") && (
            <button className="primary-button workflow-submit" disabled={!canApply} onClick={apply}><SevenIcon name="edit" /> Aplicar à sessão</button>
          )}
        </div>
      </section>
    </div>
  );
}
