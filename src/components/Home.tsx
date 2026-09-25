import { useMemo, useState } from "react";
import { BrandMark } from "./BrandMark";
import { SevenIcon } from "./SevenIcon";
import { canRunTool, tools } from "../data/tools";
import type { Capabilities, JobStatus, RecentDocument, ToolId } from "../types";

interface HomeProps {
  native: boolean;
  capabilities: Capabilities | null;
  recents: RecentDocument[];
  recentTools: ToolId[];
  taskHistory: JobStatus[];
  onOpen: () => void;
  onOpenFolder: () => void;
  lastSessionPath: string | null;
  onRecoverSession: () => void;
  onOpenRecent: (path: string) => void;
  onClearRecent: () => void;
  onTogglePinned: (path: string) => void;
  onToggleFavorite: (path: string) => void;
  onRemoveRecent: (path: string) => void;
  onRevealRecent: (path: string) => void;
  onTool: (id: ToolId) => void;
  onSettings: () => void;
}

const quick = [
  { id: "create" as const, label: "Criar PDF", icon: "create" as const },
  { id: "combine" as const, label: "Combinar", icon: "merge" as const },
  { id: "scan-ocr" as const, label: "OCR local", icon: "ocr" as const },
  { id: "convert" as const, label: "Converter", icon: "convert" as const },
  { id: "optimize" as const, label: "Compactar", icon: "compress" as const },
  { id: "fill-sign" as const, label: "Assinar", icon: "sign" as const },
];

export function Home({
  native,
  capabilities,
  recents,
  recentTools,
  taskHistory,
  onOpen,
  onOpenFolder,
  lastSessionPath,
  onRecoverSession,
  onOpenRecent,
  onClearRecent,
  onTogglePinned,
  onToggleFavorite,
  onRemoveRecent,
  onRevealRecent,
  onTool,
  onSettings,
}: HomeProps) {
  const [libraryView, setLibraryView] = useState<"recent" | "pinned" | "favorites">("recent");
  const visibleRecents = useMemo(() => {
    const source =
      libraryView === "pinned" ? recents.filter((item) => item.pinned)
        : libraryView === "favorites" ? recents.filter((item) => item.favorite)
          : recents;
    return [...source]
      .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.lastOpenedAt - a.lastOpenedAt)
      .slice(0, 8);
  }, [libraryView, recents]);
  const scrollToTools = () => document.getElementById("all-tools")?.scrollIntoView({ behavior: "smooth" });

  return (
    <div className="home-shell">
      <header className="app-header">
        <BrandMark withWordmark />
        <div className="header-actions">
          <button className="icon-button" aria-label="Configurações" onClick={onSettings}>
            <SevenIcon name="settings" />
          </button>
        </div>
      </header>

      {!native && (
        <div className="preview-banner">
          <span className="preview-dot" />
          Prévia de interface no navegador. Operações de PDF são habilitadas somente no aplicativo desktop.
        </div>
      )}

      <main className="home-main">
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow">SEVEN READER</span>
            <h1>Seu PDF, do começo ao fim.</h1>
            <p>Leitura rápida, processamento local e fluxos profissionais com capacidades verificadas em runtime.</p>
            <div className="hero-actions">
              <button className="primary-button" onClick={onOpen} disabled={!native}>
                <SevenIcon name="open" /> Abrir PDF
              </button>
              <button className="secondary-button" onClick={onOpenFolder} disabled={!native}>
                <SevenIcon name="folder" /> Abrir pasta
              </button>
              {lastSessionPath && (
                <button className="secondary-button" onClick={onRecoverSession} disabled={!native} title={lastSessionPath}>
                  <SevenIcon name="history" /> Recuperar sessão
                </button>
              )}
            </div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="document-card document-card--rear" />
            <div className="document-card document-card--mid" />
            <div className="document-card document-card--front">
              <div className="doc-brand"><BrandMark size={42} /></div>
              <div className="doc-line doc-line--wide" />
              <div className="doc-line" />
              <div className="doc-line doc-line--short" />
              <div className="doc-chart"><span /><span /><span /><span /></div>
            </div>
          </div>
        </section>

        <section className="quick-section">
          <div className="section-heading">
            <div><span className="eyebrow">COMECE RÁPIDO</span><h2>O que você quer fazer?</h2></div>
            <button className="text-button" onClick={scrollToTools}>Todas as ferramentas <SevenIcon name="chevronRight" /></button>
          </div>
          <div className="quick-grid">
            {quick.map((item) => {
              const enabled = native && canRunTool(item.id, capabilities);
              return (
                <button
                  className="quick-card"
                  key={item.id}
                  disabled={!enabled}
                  onClick={() => enabled && onTool(item.id)}
                  title={enabled ? item.label : "Ainda não disponível com implementação real neste ambiente"}
                >
                  <span className="quick-icon"><SevenIcon name={item.icon} /></span>
                  <span>{item.label}</span>
                  {!enabled && <small className="tool-state">Em implementação</small>}
                </button>
              );
            })}
          </div>
        </section>

        <section className="content-grid">
          <div className="recent-panel">
            <div className="section-heading section-heading--compact">
              <div><span className="eyebrow">BIBLIOTECA</span><h2>{libraryView === "recent" ? "Recentes" : libraryView === "pinned" ? "Fixados" : "Favoritos"}</h2></div>
              <button className="text-button" onClick={onClearRecent} disabled={!recents.length}>Limpar recentes</button>
            </div>
            <div className="library-tabs" role="tablist" aria-label="Biblioteca local">
              <button className={libraryView === "recent" ? "active" : ""} onClick={() => setLibraryView("recent")}>Recentes</button>
              <button className={libraryView === "pinned" ? "active" : ""} onClick={() => setLibraryView("pinned")}>Fixados</button>
              <button className={libraryView === "favorites" ? "active" : ""} onClick={() => setLibraryView("favorites")}>Favoritos</button>
            </div>
            {visibleRecents.length === 0 ? (
              <button className="empty-recent" onClick={onOpen} disabled={!native}>
                <span className="empty-icon"><SevenIcon name="recent" /></span>
                <strong>Nenhum documento recente</strong>
                <span>Abra um PDF para começar. O histórico permanece somente neste dispositivo.</span>
              </button>
            ) : (
              <div className="recent-list">
                {visibleRecents.map((item) => (
                    <div className="recent-row" key={item.path}>
                      <button className="recent-open" onClick={() => onOpenRecent(item.path)} title={item.path}>
                        <span className="file-tile">PDF</span>
                        <span className="recent-meta">
                          <strong>{item.name}</strong>
                          <small>{item.path}</small>
                        </span>
                      </button>
                      <div className="recent-actions" aria-label={`Ações de ${item.name}`}>
                        <button className={item.pinned ? "active" : ""} onClick={() => onTogglePinned(item.path)} aria-label={item.pinned ? "Desafixar" : "Fixar"} title={item.pinned ? "Desafixar" : "Fixar"}>
                          <SevenIcon name="pin" />
                        </button>
                        <button className={item.favorite ? "active" : ""} onClick={() => onToggleFavorite(item.path)} aria-label={item.favorite ? "Remover dos favoritos" : "Favoritar"} title={item.favorite ? "Remover dos favoritos" : "Favoritar"}>
                          <SevenIcon name="star" />
                        </button>
                        <button onClick={() => onRevealRecent(item.path)} aria-label="Abrir localização" title="Abrir localização">
                          <SevenIcon name="folder" />
                        </button>
                        <button onClick={() => onRemoveRecent(item.path)} aria-label="Remover da lista" title="Remover da lista">
                          <SevenIcon name="close" />
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          <aside className="capability-panel">
            <span className="eyebrow">AMBIENTE</span>
            <h2>Recursos locais</h2>
            <p>O Seven Reader detecta cada engine e só habilita operações realmente disponíveis.</p>
            <div className="capability-list">
              {[
                ["pdf_engine", "Engine PDF"],
                ["ocr", "OCR local"],
                ["office", "Conversão Office"],
                ["certificates", "Certificados"],
              ].map(([key, label]) => {
                const available = capabilities?.[key as keyof Capabilities]?.available ?? false;
                return (
                  <div className="capability-row" key={key}>
                    <span>{label}</span>
                    <strong className={available ? "status-ok" : "status-muted"}>
                      {native ? (available ? "Disponível" : "Indisponível") : "Desktop"}
                    </strong>
                  </div>
                );
              })}
            </div>
          </aside>
        </section>

        <section className="home-activity-grid">
          <div className="activity-panel">
            <div className="section-heading section-heading--compact">
              <div><span className="eyebrow">ATALHOS</span><h2>Ferramentas recentes</h2></div>
            </div>
            {recentTools.length === 0 ? (
              <div className="activity-empty">As ferramentas que você usar aparecerão aqui.</div>
            ) : (
              <div className="recent-tool-list">
                {recentTools.map((id) => {
                  const tool = tools.find((item) => item.id === id);
                  if (!tool) return null;
                  const enabled = native && canRunTool(tool.id, capabilities);
                  return (
                    <button key={id} disabled={!enabled} onClick={() => enabled && onTool(id)}>
                      <span><SevenIcon name={tool.icon} /></span>
                      <div><strong>{tool.label}</strong><small>{tool.group}</small></div>
                      <SevenIcon name="chevronRight" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="activity-panel">
            <div className="section-heading section-heading--compact">
              <div><span className="eyebrow">PROCESSAMENTO</span><h2>Tarefas recentes</h2></div>
            </div>
            {taskHistory.length === 0 ? (
              <div className="activity-empty">Conversões, OCR e outras tarefas em background aparecerão aqui.</div>
            ) : (
              <div className="task-history-list">
                {taskHistory.slice(0, 6).map((job) => (
                  <div className="task-history-row" key={job.id}>
                    <span className={`task-state task-state--${job.state}`} />
                    <div>
                      <strong>{job.kind.replace(/-/g, " ")}</strong>
                      <small>{job.stage}{job.error ? ` · ${job.error}` : ""}</small>
                    </div>
                    <span>{job.progress !== undefined ? `${Math.round(job.progress * 100)}%` : job.state}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="tool-preview" id="all-tools">
          <div className="section-heading">
            <div><span className="eyebrow">FLUXOS PROFISSIONAIS</span><h2>Ferramentas organizadas pelo trabalho</h2></div>
          </div>
          <div className="tool-grid">
            {tools.slice(0, 12).map((tool) => {
              const enabled = native && canRunTool(tool.id, capabilities);
              return (
                <button className="tool-card" key={tool.id} disabled={!enabled} onClick={() => enabled && onTool(tool.id)}>
                  <span className="tool-card-icon"><SevenIcon name={tool.icon} /></span>
                  <span className="tool-card-copy">
                    <strong>{tool.label}</strong>
                    <small>{enabled ? tool.description : "Visível, mas bloqueada até existir implementação real"}</small>
                  </span>
                  <SevenIcon name="chevronRight" className="tool-chevron" />
                </button>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
