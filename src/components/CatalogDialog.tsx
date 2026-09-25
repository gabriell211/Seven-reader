import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { CatalogHit, CatalogSummary } from "../types";
import { SevenIcon } from "./SevenIcon";

interface CatalogDialogProps {
  catalogs: CatalogSummary[];
  hits: CatalogHit[];
  loading: boolean;
  onClose: () => void;
  onReload: () => void;
  onBuild: (name: string, inputs: string[]) => void;
  onSearch: (id: string, query: string, matchCase: boolean) => void;
  onDelete: (id: string) => void;
  onOpenHit: (path: string, pageIndex: number) => void;
}

export function CatalogDialog({
  catalogs,
  hits,
  loading,
  onClose,
  onReload,
  onBuild,
  onSearch,
  onDelete,
  onOpenHit,
}: CatalogDialogProps) {
  const [tab, setTab] = useState<"search" | "build">("search");
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [name, setName] = useState("Meu catálogo");
  const [inputs, setInputs] = useState<string[]>([]);

  useEffect(() => { onReload(); }, [onReload]);
  useEffect(() => {
    if (!selectedId && catalogs[0]) setSelectedId(catalogs[0].id);
  }, [catalogs, selectedId]);

  const chooseInputs = async () => {
    const selected = await open({
      title: "Selecionar PDFs para indexar",
      multiple: true,
      directory: false,
      filters: [{ name: "Documentos PDF", extensions: ["pdf"] }],
    });
    if (Array.isArray(selected)) setInputs(selected);
    else if (typeof selected === "string") setInputs([selected]);
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="workflow-dialog catalog-dialog" role="dialog" aria-modal="true">
        <header className="organizer-head">
          <div>
            <span className="eyebrow">ÍNDICES E CATÁLOGO</span>
            <h2>Pesquisa em coleções locais</h2>
            <p>Indexação persistente por página, sem upload e sem depender do nome do arquivo.</p>
          </div>
          <button className="icon-button" onClick={onClose}><SevenIcon name="close" /></button>
        </header>

        <div className="workflow-tabs">
          <button className={tab === "search" ? "active" : ""} onClick={() => setTab("search")}>Pesquisar</button>
          <button className={tab === "build" ? "active" : ""} onClick={() => setTab("build")}>Criar índice</button>
        </div>

        <div className="workflow-body">
          {tab === "search" ? (
            <>
              <label className="workflow-field">
                <span>Catálogo</span>
                <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
                  <option value="">Selecione…</option>
                  {catalogs.map((catalog) => (
                    <option key={catalog.id} value={catalog.id}>
                      {catalog.name} · {catalog.documentCount} PDF(s) · {catalog.pageCount} páginas
                    </option>
                  ))}
                </select>
              </label>

              <div className="catalog-search-row">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && selectedId && query.trim() && onSearch(selectedId, query, matchCase)}
                  placeholder="Pesquisar conteúdo indexado"
                />
                <button className="primary-button" disabled={!selectedId || !query.trim() || loading} onClick={() => onSearch(selectedId, query, matchCase)}>
                  <SevenIcon name="search" /> Pesquisar
                </button>
              </div>

              <label className="toggle-row">
                <input type="checkbox" checked={matchCase} onChange={(event) => setMatchCase(event.target.checked)} />
                <span><strong>Diferenciar maiúsculas/minúsculas</strong><small>Aplicado somente a esta pesquisa.</small></span>
              </label>

              {selectedId && (
                <div className="catalog-selected-actions">
                  <button className="danger-quiet" onClick={() => onDelete(selectedId)}>Excluir índice selecionado</button>
                </div>
              )}

              {loading && <div className="report-loading"><span className="loader-ring" /> Processando índice…</div>}
              {!loading && hits.length === 0 && <div className="empty-panel">Nenhum resultado carregado.</div>}
              {!loading && hits.length > 0 && (
                <div className="catalog-results">
                  {hits.map((hit, index) => (
                    <button key={`${hit.documentPath}-${hit.pageIndex}-${index}`} onClick={() => onOpenHit(hit.documentPath, hit.pageIndex)}>
                      <div>
                        <strong>{hit.documentName}</strong>
                        <small>Página {hit.pageIndex + 1} · {hit.occurrences} ocorrência(s)</small>
                        <p>{hit.excerpt}</p>
                      </div>
                      <SevenIcon name="chevronRight" />
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <label className="workflow-field">
                <span>Nome do índice</span>
                <input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} />
              </label>

              <button className="image-drop" onClick={() => void chooseInputs()}>
                <SevenIcon name="open" />
                <strong>{inputs.length ? `${inputs.length} PDF(s) selecionado(s)` : "Selecionar PDFs"}</strong>
                <small>O texto de cada página será extraído e armazenado somente no cache local do Seven Reader.</small>
              </button>

              {inputs.length > 0 && (
                <div className="catalog-file-preview">
                  {inputs.slice(0, 8).map((path) => <span key={path}>{path.replace(/\\/g, "/").split("/").pop()}</span>)}
                  {inputs.length > 8 && <small>+ {inputs.length - 8} arquivo(s)</small>}
                </div>
              )}

              <button className="primary-button workflow-submit" disabled={!name.trim() || !inputs.length || loading} onClick={() => onBuild(name.trim(), inputs)}>
                <SevenIcon name="search" /> Criar índice local
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
