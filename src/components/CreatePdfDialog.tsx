import { useState } from "react";
import { SevenIcon } from "./SevenIcon";

export type BlankPageSize = "a4" | "letter" | "legal";

interface CreatePdfDialogProps {
  onClose: () => void;
  onCreate: (pageSize: BlankPageSize, pageCount: number) => void;
}

const sizes: Array<{ id: BlankPageSize; name: string; detail: string }> = [
  { id: "a4", name: "A4", detail: "210 × 297 mm" },
  { id: "letter", name: "Carta", detail: "8,5 × 11 pol." },
  { id: "legal", name: "Ofício / Legal", detail: "8,5 × 14 pol." },
];

export function CreatePdfDialog({ onClose, onCreate }: CreatePdfDialogProps) {
  const [pageSize, setPageSize] = useState<BlankPageSize>("a4");
  const [pageCount, setPageCount] = useState(1);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="create-dialog" role="dialog" aria-modal="true" aria-labelledby="create-pdf-title">
        <header className="organizer-head">
          <div>
            <span className="eyebrow">NOVO DOCUMENTO</span>
            <h2 id="create-pdf-title">Criar PDF em branco</h2>
            <p>Documento vetorial PDF 1.7, criado localmente.</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Fechar"><SevenIcon name="close" /></button>
        </header>

        <div className="create-body">
          <div className="paper-preview" aria-hidden="true">
            <div className={`paper-sheet paper-${pageSize}`}>
              <span>{pageCount}</span>
              <small>{pageCount === 1 ? "página" : "páginas"}</small>
            </div>
          </div>

          <div className="create-options">
            <fieldset>
              <legend>Tamanho da página</legend>
              <div className="paper-size-grid">
                {sizes.map((size) => (
                  <button
                    key={size.id}
                    type="button"
                    className={pageSize === size.id ? "paper-size active" : "paper-size"}
                    onClick={() => setPageSize(size.id)}
                  >
                    <strong>{size.name}</strong>
                    <small>{size.detail}</small>
                  </button>
                ))}
              </div>
            </fieldset>

            <label>
              <span>Quantidade de páginas</span>
              <input
                type="number"
                min={1}
                max={500}
                value={pageCount}
                onChange={(event) => setPageCount(Math.max(1, Math.min(500, Number(event.target.value) || 1)))}
              />
              <small>Entre 1 e 500 páginas. Você poderá inserir ou remover páginas depois.</small>
            </label>
          </div>
        </div>

        <footer className="organizer-actions">
          <button className="secondary-light-button" onClick={onClose}>Cancelar</button>
          <button className="primary-button" onClick={() => onCreate(pageSize, pageCount)}>
            <SevenIcon name="create" /> Criar documento
          </button>
        </footer>
      </section>
    </div>
  );
}
