import { useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { SevenIcon } from "./SevenIcon";

export type PageOperation =
  | "reorder"
  | "extract"
  | "rotate"
  | "split"
  | "delete"
  | "insert"
  | "replace";

export interface PageOperationRequest {
  operation: PageOperation;
  pageExpression: string;
  angle: 90 | 180 | 270;
  pagesPerFile: number;
  source?: string;
  sourceRange?: string;
  insertAfter?: number;
  targetStart?: number;
  sourceStart?: number;
  count?: number;
}

interface PageOrganizerDialogProps {
  fileName: string;
  pageCount?: number;
  onClose: () => void;
  onRun: (request: PageOperationRequest) => void;
}

const operations: Array<{ id: PageOperation; title: string; description: string }> = [
  { id: "reorder", title: "Reordenar", description: "Defina a sequência final, inclusive páginas repetidas ou invertidas." },
  { id: "extract", title: "Extrair", description: "Crie outro PDF apenas com as páginas selecionadas." },
  { id: "rotate", title: "Girar", description: "Aplique rotação estrutural sem rasterizar o conteúdo." },
  { id: "delete", title: "Excluir", description: "Remova páginas selecionadas em uma nova cópia do documento." },
  { id: "insert", title: "Inserir", description: "Insira páginas de outro PDF antes, no meio ou ao final." },
  { id: "replace", title: "Substituir", description: "Troque um intervalo por páginas de outro documento PDF." },
  { id: "split", title: "Dividir", description: "Separe o documento em arquivos menores por quantidade de páginas." },
];

export function PageOrganizerDialog({ fileName, pageCount, onClose, onRun }: PageOrganizerDialogProps) {
  const [operation, setOperation] = useState<PageOperation>("reorder");
  const [expression, setExpression] = useState("1-z");
  const [angle, setAngle] = useState<90 | 180 | 270>(90);
  const [pagesPerFile, setPagesPerFile] = useState(1);
  const [source, setSource] = useState("");
  const [sourceRange, setSourceRange] = useState("1-z");
  const [insertAfter, setInsertAfter] = useState(pageCount ?? 0);
  const [targetStart, setTargetStart] = useState(1);
  const [sourceStart, setSourceStart] = useState(1);
  const [count, setCount] = useState(1);

  const chooseSource = async () => {
    const selected = await open({
      title: operation === "replace" ? "Selecionar PDF com páginas de substituição" : "Selecionar PDF para inserir páginas",
      multiple: false,
      directory: false,
      filters: [{ name: "Documento PDF", extensions: ["pdf"] }],
    });
    if (typeof selected === "string") setSource(selected);
  };

  const helper = useMemo(() => {
    if (operation === "reorder") return "Ex.: 1,3,2,4-z · use z-1 para inverter tudo.";
    if (operation === "extract") return "Ex.: 1-5,8,12-z · a ordem digitada será preservada.";
    if (operation === "rotate") return "Ex.: 1-3 ou 1-z · escolha o ângulo abaixo.";
    if (operation === "delete") return "Ex.: 2,4-6 · essas páginas serão removidas da nova cópia.";
    if (operation === "insert") return "Escolha outro PDF, as páginas dele e a posição de inserção.";
    if (operation === "replace") return "Informe a primeira página de destino, a primeira página da origem e a quantidade.";
    return "Os arquivos resultantes são numerados automaticamente a partir do nome escolhido.";
  }, [operation]);

  const pageExpressionValid = expression.trim().length > 0 && expression.length <= 512;
  const sourceRangeValid = sourceRange.trim().length > 0 && sourceRange.length <= 512;
  const valid =
    operation === "split" ? pagesPerFile >= 1 :
      operation === "insert" ? Boolean(source) && sourceRangeValid && insertAfter >= 0 :
        operation === "replace" ? Boolean(source) && targetStart >= 1 && sourceStart >= 1 && count >= 1 :
          pageExpressionValid;

  const submit = () => {
    onRun({
      operation,
      pageExpression: expression.trim(),
      angle,
      pagesPerFile,
      source: source || undefined,
      sourceRange: sourceRange.trim() || undefined,
      insertAfter,
      targetStart,
      sourceStart,
      count,
    });
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="page-organizer page-organizer--wide" role="dialog" aria-modal="true" aria-labelledby="organizer-title">
        <header className="organizer-head">
          <div>
            <span className="eyebrow">ORGANIZAR PÁGINAS</span>
            <h2 id="organizer-title">{fileName}</h2>
            <p>{pageCount ? `${pageCount} páginas · ` : ""}operações estruturais, locais e sem rasterização.</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Fechar"><SevenIcon name="close" /></button>
        </header>

        <div className="operation-tabs operation-tabs--pages" role="tablist" aria-label="Operação">
          {operations.map((item) => (
            <button
              key={item.id}
              className={operation === item.id ? "operation-tab active" : "operation-tab"}
              onClick={() => setOperation(item.id)}
              role="tab"
              aria-selected={operation === item.id}
            >
              <strong>{item.title}</strong>
              <small>{item.description}</small>
            </button>
          ))}
        </div>

        <div className="organizer-form">
          {["reorder", "extract", "rotate", "delete"].includes(operation) && (
            <label>
              <span>{operation === "reorder" ? "Ordem final das páginas" : operation === "delete" ? "Páginas a excluir" : "Páginas"}</span>
              <input
                autoFocus
                value={expression}
                onChange={(event) => setExpression(event.target.value)}
                placeholder={operation === "delete" ? "2,4-6" : "1-z"}
                spellCheck={false}
              />
              <small>{helper}</small>
            </label>
          )}

          {operation === "split" && (
            <label>
              <span>Páginas por arquivo</span>
              <input
                autoFocus
                type="number"
                min={1}
                max={500}
                value={pagesPerFile}
                onChange={(event) => setPagesPerFile(Math.max(1, Math.min(500, Number(event.target.value) || 1)))}
              />
              <small>{helper}</small>
            </label>
          )}

          {(operation === "insert" || operation === "replace") && (
            <>
              <button className="image-drop image-drop--compact" onClick={() => void chooseSource()}>
                <SevenIcon name="open" />
                <strong>{source ? source.replace(/\\/g, "/").split("/").pop() : "Selecionar PDF de origem"}</strong>
                <small>{source || "O arquivo é lido localmente; nenhum documento é enviado para servidores."}</small>
              </button>

              {operation === "insert" ? (
                <div className="two-column-fields">
                  <label className="workflow-field">
                    <span>Páginas da origem</span>
                    <input value={sourceRange} onChange={(event) => setSourceRange(event.target.value)} placeholder="1-z" />
                    <small>Ex.: 1-3,5 ou 1-z.</small>
                  </label>
                  <label className="workflow-field">
                    <span>Inserir depois da página</span>
                    <input
                      type="number"
                      min={0}
                      max={pageCount ?? 999999}
                      value={insertAfter}
                      onChange={(event) => setInsertAfter(Math.max(0, Number(event.target.value) || 0))}
                    />
                    <small>Use 0 para inserir no início. Use {pageCount ?? "a última página"} para inserir ao final.</small>
                  </label>
                </div>
              ) : (
                <div className="three-column-fields">
                  <label className="workflow-field">
                    <span>Destino começa em</span>
                    <input type="number" min={1} value={targetStart} onChange={(event) => setTargetStart(Math.max(1, Number(event.target.value) || 1))} />
                  </label>
                  <label className="workflow-field">
                    <span>Origem começa em</span>
                    <input type="number" min={1} value={sourceStart} onChange={(event) => setSourceStart(Math.max(1, Number(event.target.value) || 1))} />
                  </label>
                  <label className="workflow-field">
                    <span>Quantidade</span>
                    <input type="number" min={1} max={5000} value={count} onChange={(event) => setCount(Math.max(1, Math.min(5000, Number(event.target.value) || 1)))} />
                  </label>
                </div>
              )}
              <small className="workflow-inline-help">{helper}</small>
            </>
          )}

          {operation === "rotate" && (
            <fieldset className="angle-picker">
              <legend>Rotação</legend>
              {[90, 180, 270].map((value) => (
                <button
                  key={value}
                  type="button"
                  className={angle === value ? "angle-button active" : "angle-button"}
                  onClick={() => setAngle(value as 90 | 180 | 270)}
                >
                  <SevenIcon name="history" /> {value}°
                </button>
              ))}
            </fieldset>
          )}

          <div className={operation === "split" ? "organizer-note organizer-note--warning" : "organizer-note"}>
            <SevenIcon name={operation === "split" ? "comment" : "shield"} />
            <span>
              {operation === "split"
                ? "A divisão rápida pode não preservar todos os dados globais em cada arquivo separado, como certos outlines e article threads. O original permanece intacto."
                : operation === "replace"
                  ? "A estrutura global do PDF principal é mantida. As páginas substituídas passam a usar os objetos da origem; o original permanece intacto."
                  : "O arquivo original não é alterado. O resultado é salvo como um novo PDF e processado localmente."}
            </span>
          </div>
        </div>

        <footer className="organizer-actions">
          <button className="secondary-light-button" onClick={onClose}>Cancelar</button>
          <button className="primary-button" disabled={!valid} onClick={submit}>
            <SevenIcon name={operation === "rotate" ? "history" : operation === "extract" || operation === "delete" ? "pages" : "tools"} />
            Continuar
          </button>
        </footer>
      </section>
    </div>
  );
}
