import { useEffect, useMemo, useState } from "react";
import type { NormalizedRect, PrinterInfo, PrintOptions } from "../types";
import { SevenIcon } from "./SevenIcon";
import { nativeAssetUrl } from "../lib/native";

interface PrintDialogProps {
  fileName: string;
  currentPage: number;
  pageCount: number;
  selection?: NormalizedRect;
  previewPath?: string;
  printers: PrinterInfo[];
  loading: boolean;
  advancedAvailable: boolean;
  qpdfAvailable: boolean;
  onClose: () => void;
  onReload: () => void;
  onPrint: (options: PrintOptions) => void;
  onSystemPrint: () => void;
}

function parsePreviewRange(value: string, pageCount: number): number[] {
  const pages: number[] = [];
  const seen = new Set<number>();
  for (const token of value.split(",").map((item) => item.trim()).filter(Boolean)) {
    if (token.includes("-")) {
      const [left, right] = token.split("-", 2).map((part) => Number(part.trim()));
      if (!Number.isInteger(left) || !Number.isInteger(right) || left < 1 || right < 1 || left > pageCount || right > pageCount) continue;
      const step = left <= right ? 1 : -1;
      for (let page = left; step > 0 ? page <= right : page >= right; page += step) {
        if (!seen.has(page)) { seen.add(page); pages.push(page); }
      }
    } else {
      const page = Number(token);
      if (Number.isInteger(page) && page >= 1 && page <= pageCount && !seen.has(page)) {
        seen.add(page);
        pages.push(page);
      }
    }
  }
  return pages;
}

export function PrintDialog({
  fileName,
  currentPage,
  pageCount,
  selection,
  previewPath,
  printers,
  loading,
  advancedAvailable,
  qpdfAvailable,
  onClose,
  onReload,
  onPrint,
  onSystemPrint,
}: PrintDialogProps) {
  const [printer, setPrinter] = useState("");
  const [copies, setCopies] = useState(1);
  const [pageMode, setPageMode] = useState<PrintOptions["pageMode"]>("all");
  const [pageRange, setPageRange] = useState("");
  const [pageSet, setPageSet] = useState<PrintOptions["pageSet"]>("all");
  const [reverse, setReverse] = useState(false);
  const [duplex, setDuplex] = useState<PrintOptions["duplex"]>("printer");
  const [manualPass, setManualPass] = useState<PrintOptions["manualPass"]>("none");
  const [nUp, setNUp] = useState<PrintOptions["nUp"]>(1);
  const [nUpLayout, setNUpLayout] = useState<PrintOptions["nUpLayout"]>("lrtb");
  const [orientation, setOrientation] = useState<PrintOptions["orientation"]>("auto");
  const [paperSize, setPaperSize] = useState<PrintOptions["paperSize"]>("printer");
  const [scaling, setScaling] = useState<PrintOptions["scaling"]>("fit");
  const [colorMode, setColorMode] = useState<PrintOptions["colorMode"]>("auto");
  const [printAsImage, setPrintAsImage] = useState(false);
  const [rasterDpi, setRasterDpi] = useState(300);
  const [printAnnotations, setPrintAnnotations] = useState(true);
  const [printForms, setPrintForms] = useState(true);
  const [presetName, setPresetName] = useState("");
  const [presets, setPresets] = useState<Array<{ name: string; options: PrintOptions }>>(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem("seven-reader:print-presets:v1") ?? "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  useEffect(() => { onReload(); }, []);
  useEffect(() => {
    localStorage.setItem("seven-reader:print-presets:v1", JSON.stringify(presets));
  }, [presets]);

  useEffect(() => {
    if (printer || !printers.length) return;
    setPrinter(printers.find((item) => item.isDefault)?.name ?? printers[0].name);
  }, [printer, printers]);

  const pages = useMemo(() => {
    let result =
      pageMode === "all" ? Array.from({ length: pageCount }, (_, index) => index + 1) :
        pageMode === "current" || pageMode === "selection" ? [currentPage + 1] :
          parsePreviewRange(pageRange, pageCount);
    if (pageSet === "odd") result = result.filter((page) => page % 2 === 1);
    if (pageSet === "even") result = result.filter((page) => page % 2 === 0);
    if (reverse) result = [...result].reverse();
    return result;
  }, [pageMode, pageRange, pageSet, reverse, currentPage, pageCount]);

  const needsQpdf = pageMode !== "all" || pageSet !== "all" || reverse;
  const canAdvanced =
    advancedAvailable
    && printers.length > 0
    && pages.length > 0
    && (pageMode !== "selection" || Boolean(selection))
    && (!needsQpdf || pageMode === "selection" || qpdfAvailable);

  const currentOptions = (): PrintOptions => ({
    printer: printer || undefined,
    copies,
    pageMode,
    currentPage,
    pageRange,
    selectionRect: pageMode === "selection" ? selection : undefined,
    pageSet,
    reverse,
    duplex,
    manualPass,
    nUp,
    nUpLayout,
    orientation,
    paperSize,
    scaling,
    colorMode,
    printAsImage,
    rasterDpi,
    printAnnotations,
    printForms,
  });

  const applyPreset = (options: PrintOptions) => {
    setPrinter(options.printer ?? printer);
    setCopies(options.copies);
    setPageMode(options.pageMode === "selection" && !selection ? "current" : options.pageMode);
    setPageRange(options.pageRange);
    setPageSet(options.pageSet);
    setReverse(options.reverse);
    setDuplex(options.duplex);
    setManualPass(options.manualPass);
    setNUp(options.nUp);
    setNUpLayout(options.nUpLayout);
    setOrientation(options.orientation);
    setPaperSize(options.paperSize);
    setScaling(options.scaling);
    setColorMode(options.colorMode);
    setPrintAsImage(options.printAsImage);
    setRasterDpi(options.rasterDpi);
    setPrintAnnotations(options.printAnnotations);
    setPrintForms(options.printForms);
  };

  const savePreset = () => {
    const name = presetName.trim();
    if (!name) return;
    const options = currentOptions();
    setPresets((current) => [
      ...current.filter((preset) => preset.name.toLocaleLowerCase() !== name.toLocaleLowerCase()),
      { name, options: { ...options, currentPage: 0, selectionRect: undefined } },
    ]);
    setPresetName("");
  };

  const submit = () => {
    onPrint(currentOptions());
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="print-dialog" role="dialog" aria-modal="true" aria-labelledby="print-dialog-title">
        <header className="organizer-head">
          <div>
            <span className="eyebrow">IMPRESSÃO</span>
            <h2 id="print-dialog-title">Imprimir {fileName}</h2>
            <p>Configuração local com seleção explícita de impressora e páginas.</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Fechar"><SevenIcon name="close" /></button>
        </header>

        <div className="print-dialog-layout">
          <aside className="print-summary">
            <div className={previewPath ? "print-preview-sheet has-page" : "print-preview-sheet"}>
              {previewPath ? (
                <div className="print-page-preview">
                  <img src={nativeAssetUrl(previewPath)} alt={`Preview da página ${currentPage + 1}`} />
                  {pageMode === "selection" && selection && (
                    <span
                      className="print-preview-selection"
                      style={{
                        left: `${selection.x * 100}%`,
                        top: `${selection.y * 100}%`,
                        width: `${selection.width * 100}%`,
                        height: `${selection.height * 100}%`,
                      }}
                    />
                  )}
                </div>
              ) : (
                <><SevenIcon name="pages" /><strong>{pages.length || 0}</strong><span>{pages.length === 1 ? "página" : "páginas"}</span></>
              )}
            </div>
            <div className="print-summary-data">
              <div><span>Documento</span><strong>{pageCount} páginas</strong></div>
              <div><span>Cópias</span><strong>{copies}</strong></div>
              <div><span>Total enviado</span><strong>{pages.length * copies} página(s)</strong></div>
              {pages.length > 0 && pages.length <= 12 && <small>{pages.join(", ")}</small>}
              {pages.length > 12 && <small>{pages.slice(0, 10).join(", ")}…</small>}
            </div>
            {pageMode === "selection" && selection && (
              <div className="print-selection-note">
                <SevenIcon name="select" />
                <span>Área selecionada: {(selection.width * 100).toFixed(1)}% × {(selection.height * 100).toFixed(1)}% da página {currentPage + 1}.</span>
              </div>
            )}
          </aside>

          <main className="print-options">
            <section className="print-section print-presets-section">
              <div className="section-mini-title">Presets de impressão</div>
              <div className="print-preset-list">
                {presets.map((preset) => (
                  <div key={preset.name}>
                    <button onClick={() => applyPreset(preset.options)}><strong>{preset.name}</strong><small>Aplicar</small></button>
                    <button title="Atualizar com a configuração atual" onClick={() => setPresets((current) => current.map((item) => item.name === preset.name ? { ...item, options: { ...currentOptions(), currentPage: 0, selectionRect: undefined } } : item))}><SevenIcon name="save" /></button>
                    <button className="danger" title="Excluir preset" onClick={() => setPresets((current) => current.filter((item) => item.name !== preset.name))}><SevenIcon name="close" /></button>
                  </div>
                ))}
              </div>
              <div className="print-preset-create">
                <input value={presetName} onChange={(event) => setPresetName(event.target.value)} placeholder="Nome do novo preset" />
                <button className="secondary-light-button" disabled={!presetName.trim()} onClick={savePreset}><SevenIcon name="create" /> Salvar preset</button>
              </div>
            </section>
            <section className="print-section">
              <div className="section-mini-title">Impressora</div>
              <div className="two-column-fields">
                <label className="workflow-field">
                  <span>Destino</span>
                  <select value={printer} onChange={(event) => setPrinter(event.target.value)} disabled={loading || !printers.length}>
                    {!printers.length && <option value="">Nenhuma impressora detectada</option>}
                    {printers.map((item) => <option key={item.name} value={item.name}>{item.name}{item.isDefault ? " · padrão" : ""}</option>)}
                  </select>
                </label>
                <label className="workflow-field">
                  <span>Cópias</span>
                  <input type="number" min={1} max={99} value={copies} onChange={(event) => setCopies(Math.max(1, Math.min(99, Number(event.target.value) || 1)))} />
                </label>
              </div>
              <button className="secondary-light-button" onClick={onReload} disabled={loading}><SevenIcon name="history" /> {loading ? "Atualizando…" : "Atualizar impressoras"}</button>
            </section>

            <section className="print-section">
              <div className="section-mini-title">Páginas</div>
              <div className="print-page-modes">
                <label><input type="radio" name="pages" checked={pageMode === "all"} onChange={() => setPageMode("all")} /><span>Todas</span></label>
                <label><input type="radio" name="pages" checked={pageMode === "current"} onChange={() => setPageMode("current")} /><span>Atual · {currentPage + 1}</span></label>
                <label><input type="radio" name="pages" checked={pageMode === "range"} onChange={() => setPageMode("range")} /><span>Intervalo</span></label>
                <label className={!selection ? "unavailable" : ""}><input type="radio" name="pages" disabled={!selection} checked={pageMode === "selection"} onChange={() => setPageMode("selection")} /><span>Seleção</span></label>
              </div>
              {pageMode === "range" && (
                <label className="workflow-field">
                  <span>Intervalo</span>
                  <input value={pageRange} onChange={(event) => setPageRange(event.target.value)} placeholder="1-5, 8, 12-10" />
                  <small>Intervalos descendentes também são aceitos.</small>
                </label>
              )}
              <div className="three-column-fields">
                <label className="workflow-field"><span>Filtro</span><select value={pageSet} onChange={(event) => setPageSet(event.target.value as PrintOptions["pageSet"])}><option value="all">Todas</option><option value="odd">Somente ímpares</option><option value="even">Somente pares</option></select></label>
                <label className="toggle-row"><input type="checkbox" checked={reverse} onChange={(event) => setReverse(event.target.checked)} /><span><strong>Ordem reversa</strong><small>Última selecionada primeiro.</small></span></label>
                <label className="workflow-field"><span>Escala</span><select value={scaling} onChange={(event) => setScaling(event.target.value as PrintOptions["scaling"])}><option value="fit">Ajustar ao papel</option><option value="actual">Tamanho real</option></select></label>
              </div>
            </section>

            <section className="print-section">
              <div className="section-mini-title">Papel e acabamento</div>
              <div className="three-column-fields">
                <label className="workflow-field"><span>Orientação</span><select value={orientation} onChange={(event) => setOrientation(event.target.value as PrintOptions["orientation"])}><option value="auto">Automática</option><option value="portrait">Retrato</option><option value="landscape">Paisagem</option></select></label>
                <label className="workflow-field"><span>Papel</span><select value={paperSize} onChange={(event) => setPaperSize(event.target.value as PrintOptions["paperSize"])}><option value="printer">Padrão da impressora</option><option value="a4">A4</option><option value="letter">Carta / Letter</option><option value="legal">Legal</option></select></label>
                <label className="workflow-field"><span>Frente e verso</span><select value={duplex} disabled={manualPass !== "none"} onChange={(event) => setDuplex(event.target.value as PrintOptions["duplex"])}><option value="printer">Padrão da impressora</option><option value="simplex">Somente frente</option><option value="long">Duplex · borda longa</option><option value="short">Duplex · borda curta</option></select></label>
              </div>
              <div className="two-column-fields">
                <label className="workflow-field"><span>Duplex manual</span><select value={manualPass} onChange={(event) => setManualPass(event.target.value as PrintOptions["manualPass"])}><option value="none">Desativado</option><option value="front">1ª passagem · páginas ímpares</option><option value="back">2ª passagem · páginas pares reversas</option></select><small>Faça a primeira passagem, recoloque o papel conforme sua impressora e execute a segunda.</small></label>
                <label className="workflow-field"><span>Cor</span><select value={colorMode} onChange={(event) => setColorMode(event.target.value as PrintOptions["colorMode"])}><option value="auto">Automático / driver</option><option value="color">Colorido</option><option value="grayscale">Escala de cinza</option></select></label>
              </div>
            </section>

            <section className="print-section">
              <div className="section-mini-title">Páginas por folha</div>
              <div className="two-column-fields">
                <label className="workflow-field"><span>N-up</span><select value={nUp} onChange={(event) => setNUp(Number(event.target.value) as PrintOptions["nUp"])}><option value={1}>1 por folha</option><option value={2}>2 por folha</option><option value={4}>4 por folha</option><option value={6}>6 por folha</option><option value={9}>9 por folha</option><option value={16}>16 por folha</option></select></label>
                <label className="workflow-field"><span>Ordem</span><select value={nUpLayout} disabled={nUp === 1} onChange={(event) => setNUpLayout(event.target.value as PrintOptions["nUpLayout"])}><option value="lrtb">→ depois ↓</option><option value="lrbt">→ depois ↑</option><option value="rltb">← depois ↓</option><option value="rlbt">← depois ↑</option><option value="tblr">↓ depois →</option><option value="tbrl">↓ depois ←</option><option value="btlr">↑ depois →</option><option value="btrl">↑ depois ←</option></select></label>
              </div>
            </section>

            <section className="print-section">
              <div className="section-mini-title">Conteúdo</div>
              <div className="two-column-fields">
                <label className="toggle-row"><input type="checkbox" checked={printAnnotations} onChange={(event) => setPrintAnnotations(event.target.checked)} /><span><strong>Comentários e anotações</strong><small>Inclui anotações visíveis quando suportado.</small></span></label>
                <label className="toggle-row"><input type="checkbox" checked={printForms} onChange={(event) => setPrintForms(event.target.checked)} /><span><strong>Campos de formulário</strong><small>Inclui widgets/AcroForm renderizados.</small></span></label>
              </div>
              <div className="two-column-fields">
                <label className="toggle-row"><input type="checkbox" checked={printAsImage} onChange={(event) => setPrintAsImage(event.target.checked)} /><span><strong>Print as Image</strong><small>Rasteriza cada página em PDF-image antes do driver.</small></span></label>
                <label className="workflow-field"><span>Resolução da imagem</span><input type="number" min={72} max={1200} disabled={!printAsImage} value={rasterDpi} onChange={(event) => setRasterDpi(Math.max(72, Math.min(1200, Number(event.target.value) || 300)))} /><small>DPI</small></label>
              </div>
            </section>

            {!advancedAvailable && (
              <div className="organizer-note organizer-note--warning">
                <SevenIcon name="print" />
                <span>Ghostscript não foi detectado. A impressão configurável fica indisponível, mas o fluxo básico do sistema continua acessível abaixo.</span>
              </div>
            )}
            {needsQpdf && pageMode !== "selection" && !qpdfAvailable && (
              <div className="organizer-note organizer-note--warning">
                <SevenIcon name="pages" />
                <span>qpdf é necessário para materializar intervalo, página atual, filtro par/ímpar ou ordem reversa antes de imprimir.</span>
              </div>
            )}
          </main>
        </div>

        <footer className="organizer-actions print-actions">
          <button className="secondary-light-button" onClick={onSystemPrint}><SevenIcon name="print" /> Impressão básica do sistema</button>
          <div>
            <button className="secondary-light-button" onClick={onClose}>Cancelar</button>
            <button className="primary-button" disabled={!canAdvanced} onClick={submit}><SevenIcon name="print" /> Imprimir</button>
          </div>
        </footer>
      </section>
    </div>
  );
}
