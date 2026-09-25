import { useMemo, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import type { RedactionArea } from "../types";
import { SevenIcon } from "./SevenIcon";

interface RedactionDialogProps {
  documentPath: string;
  pageIndex: number;
  matches: RedactionArea[];
  loading: boolean;
  onClose: () => void;
  onSearch: (query: string, matchCase: boolean, wholeWord: boolean) => void;
  onApply: (output: string, areas: RedactionArea[]) => void;
}

export function RedactionDialog({
  documentPath,
  pageIndex,
  matches,
  loading,
  onClose,
  onSearch,
  onApply,
}: RedactionDialogProps) {
  const [tab, setTab] = useState<"manual" | "search">("manual");
  const [x, setX] = useState(48);
  const [y, setY] = useState(48);
  const [width, setWidth] = useState(180);
  const [height, setHeight] = useState(36);
  const [query, setQuery] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [selected, setSelected] = useState<Record<number, boolean>>({});

  const selectedMatches = useMemo(
    () => matches.filter((_, index) => selected[index] ?? true),
    [matches, selected],
  );

  const chooseOutput = async () => save({
    title: "Salvar PDF redigido",
    defaultPath: documentPath.replace(/\.pdf$/i, "-redigido.pdf"),
    filters: [{ name: "Documento PDF", extensions: ["pdf"] }],
  });

  const applyManual = async () => {
    const output = await chooseOutput();
    if (!output) return;
    onApply(output, [{ pageIndex, x, y, width, height }]);
  };

  const applySearch = async () => {
    const output = await chooseOutput();
    if (!output || selectedMatches.length === 0) return;
    onApply(output, selectedMatches);
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="workflow-dialog redaction-dialog" role="dialog" aria-modal="true">
        <header className="organizer-head">
          <div>
            <span className="eyebrow">REDAÇÃO PERMANENTE</span>
            <h2>Remover conteúdo sensível</h2>
            <p>O conteúdo cruzado é removido da estrutura da página antes da aparência preta ser criada.</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Fechar"><SevenIcon name="close" /></button>
        </header>

        <div className="workflow-tabs">
          <button className={tab === "manual" ? "active" : ""} onClick={() => setTab("manual")}>Área manual</button>
          <button className={tab === "search" ? "active" : ""} onClick={() => setTab("search")}>Buscar e redigir</button>
        </div>

        <div className="workflow-body">
          <div className="redaction-danger">
            <SevenIcon name="redact" />
            <div>
              <strong>Operação destrutiva na cópia de saída</strong>
              <span>Se um objeto gráfico/textual cruza parcialmente a área marcada, o Seven remove o objeto inteiro. Isso evita deixar dados sensíveis recuperáveis em uma parte do mesmo objeto.</span>
            </div>
          </div>

          {tab === "manual" ? (
            <>
              <div className="rect-grid">
                <label className="workflow-field"><span>X</span><input type="number" value={x} onChange={(event) => setX(Number(event.target.value))} /></label>
                <label className="workflow-field"><span>Y</span><input type="number" value={y} onChange={(event) => setY(Number(event.target.value))} /></label>
                <label className="workflow-field"><span>Largura</span><input type="number" min={1} value={width} onChange={(event) => setWidth(Number(event.target.value))} /></label>
                <label className="workflow-field"><span>Altura</span><input type="number" min={1} value={height} onChange={(event) => setHeight(Number(event.target.value))} /></label>
              </div>
              <div className="organizer-note"><SevenIcon name="pages" /><span>As coordenadas são em pontos PDF na página {pageIndex + 1}. O modo de arraste direto no canvas será conectado ao sistema geral de seleção de objetos.</span></div>
              <button className="primary-button workflow-submit" disabled={width <= 0 || height <= 0} onClick={() => void applyManual()}><SevenIcon name="redact" /> Aplicar redação permanente</button>
            </>
          ) : (
            <>
              <label className="workflow-field"><span>Texto a localizar</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="CPF, e-mail, nome, termo…" /></label>
              <div className="two-column-fields">
                <label className="toggle-row"><input type="checkbox" checked={matchCase} onChange={(event) => setMatchCase(event.target.checked)} /><span><strong>Diferenciar maiúsculas</strong><small>Pesquisa exata quanto a caixa.</small></span></label>
                <label className="toggle-row"><input type="checkbox" checked={wholeWord} onChange={(event) => setWholeWord(event.target.checked)} /><span><strong>Palavra inteira</strong><small>Evita correspondências parciais.</small></span></label>
              </div>
              <button className="secondary-light-button choose-wide" disabled={!query.trim()} onClick={() => onSearch(query, matchCase, wholeWord)}><SevenIcon name="search" /> Localizar ocorrências</button>
              {loading && <div className="report-loading"><span className="loader-ring" /> Localizando ocorrências e calculando caixas…</div>}
              {!loading && matches.length > 0 && (
                <>
                  <div className="redaction-result-head"><strong>{matches.length} ocorrência(s)</strong><button onClick={() => setSelected({})}>Selecionar todas</button></div>
                  <div className="redaction-results">
                    {matches.map((area, index) => (
                      <label className="redaction-match" key={`${area.pageIndex}-${area.x}-${index}`}>
                        <input
                          type="checkbox"
                          checked={selected[index] ?? true}
                          onChange={(event) => setSelected((current) => ({ ...current, [index]: event.target.checked }))}
                        />
                        <span><strong>Página {area.pageIndex + 1}</strong><small>{area.sourceText || "Correspondência textual"} · x {area.x.toFixed(1)} · y {area.y.toFixed(1)} · {area.width.toFixed(1)}×{area.height.toFixed(1)}</small></span>
                      </label>
                    ))}
                  </div>
                  <button className="primary-button workflow-submit" disabled={selectedMatches.length === 0} onClick={() => void applySearch()}><SevenIcon name="redact" /> Redigir {selectedMatches.length} ocorrência(s)</button>
                </>
              )}
              {!loading && matches.length === 0 && <div className="empty-panel">Faça uma busca para listar áreas candidatas à redação.</div>}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
