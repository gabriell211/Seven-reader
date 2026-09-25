import { useMemo, useState } from "react";
import { SevenIcon } from "./SevenIcon";

export type PageOperation = "reorder" | "extract" | "rotate" | "split";

interface PageOrganizerDialogProps {
  fileName: string;
  pageCount?: number;
  onClose: () => void;
  onRun: (
    operation: PageOperation,
    pageExpression: string,
    angle: 90 | 180 | 270,
    pagesPerFile: number,
  ) => void;
}

const operations: Array<{ id: PageOperation; title: string; description: string }> = [
  { id: "reorder", title: "Reordenar", description: "Defina a ordem final, inclusive páginas repetidas ou invertidas." },
  { id: "extract", title: "Extrair", description: "Crie um novo PDF apenas com as páginas selecionadas." },
  { id: "rotate", title: "Girar", description: "Aplique rotação estrutural sem rasterizar o conteúdo." },
  { id: "split", title: "Dividir", description: "Separe o documento em arquivos menores por quantidade de páginas." },
];

export function PageOrganizerDialog({ fileName, pageCount, onClose, onRun }: PageOrganizerDialogProps) {
  const [operation, setOperation] = useState<PageOperation>("reorder");
  const [expression, setExpression] = useState("1-z");
  const [angle, setAngle] = useState<90 | 180 | 270>(90);
  const [pagesPerFile, setPagesPerFile] = useState(1);

  const helper = useMemo(() => {
    if (operation === "reorder") return "Ex.: 1,3,2,4-z · use z-1 para inverter tudo.";
    if (operation === "extract") return "Ex.: 1-5,8,12-z · a ordem digitada será preservada.";
    if (operation === "rotate") return "Ex.: 1-3 ou 1-z · escolha o ângulo abaixo.";
    return "O qpdf gera arquivos numerados automaticamente a partir do nome escolhido.";
  }, [operation]);

  const valid = expression.trim().length > 0 && expression.length <= 512;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="page-organizer" role="dialog" aria-modal="true" aria-labelledby="organizer-title">
        <header className="organizer-head">
          <div>
            <span className="eyebrow">ORGANIZAR PÁGINAS</span>
            <h2 id="organizer-title">{fileName}</h2>
            <p>{pageCount ? `${pageCount} páginas · ` : ""}operações estruturais, sem rasterização.</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Fechar"><SevenIcon name="close" /></button>
        </header>

        <div className="operation-tabs" role="tablist" aria-label="Operação">
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
          {operation !== "split" ? (
            <label>
              <span>{operation === "reorder" ? "Ordem das páginas" : "Páginas"}</span>
              <input
                autoFocus
                value={expression}
                onChange={(event) => setExpression(event.target.value)}
                placeholder="1-z"
                spellCheck={false}
              />
              <small>{helper}</small>
            </label>
          ) : (
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
                ? "Modo rápido: alguns recursos de nível do documento, como certos marcadores e article tags, podem não ser preservados pelo qpdf. O original permanece intacto."
                : "O arquivo original não é alterado. O resultado é salvo como um novo PDF e processado localmente."}
            </span>
          </div>
        </div>

        <footer className="organizer-actions">
          <button className="secondary-light-button" onClick={onClose}>Cancelar</button>
          <button
            className="primary-button"
            disabled={!valid}
            onClick={() => onRun(operation, expression.trim(), angle, pagesPerFile)}
          >
            <SevenIcon name={operation === "rotate" ? "history" : operation === "extract" ? "pages" : "tools"} />
            Continuar
          </button>
        </footer>
      </section>
    </div>
  );
}
