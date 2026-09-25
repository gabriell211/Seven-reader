import { BrandMark } from "./BrandMark";
import { SevenIcon } from "./SevenIcon";
import { canRunTool, tools } from "../data/tools";
import type { Capabilities, RecentDocument, ToolId } from "../types";

interface HomeProps {
  native: boolean;
  capabilities: Capabilities | null;
  recents: RecentDocument[];
  onOpen: () => void;
  onOpenRecent: (path: string) => void;
  onClearRecent: () => void;
  onTool: (id: ToolId) => void;
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
  onOpen,
  onOpenRecent,
  onClearRecent,
  onTool,
}: HomeProps) {
  const scrollToTools = () => document.getElementById("all-tools")?.scrollIntoView({ behavior: "smooth" });

  return (
    <div className="home-shell">
      <header className="app-header">
        <BrandMark withWordmark />
        <div className="header-actions">
          <button className="icon-button" aria-label="Configurações" disabled title="Preferências serão habilitadas quando persistência estiver concluída">
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
              <button className="secondary-button" disabled title="Abertura de pasta será habilitada com indexação local">
                <SevenIcon name="folder" /> Abrir pasta
              </button>
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
              <div><span className="eyebrow">BIBLIOTECA</span><h2>Recentes</h2></div>
              <button className="text-button" onClick={onClearRecent} disabled={!recents.length}>Limpar recentes</button>
            </div>
            {recents.length === 0 ? (
              <button className="empty-recent" onClick={onOpen} disabled={!native}>
                <span className="empty-icon"><SevenIcon name="recent" /></span>
                <strong>Nenhum documento recente</strong>
                <span>Abra um PDF para começar. O histórico permanece somente neste dispositivo.</span>
              </button>
            ) : (
              <div className="recent-list">
                {recents.slice(0, 6).map((item) => (
                  <button className="recent-row" key={item.path} onClick={() => onOpenRecent(item.path)}>
                    <span className="file-tile">PDF</span>
                    <span className="recent-meta"><strong>{item.name}</strong><small>{item.path}</small></span>
                    <SevenIcon name="chevronRight" />
                  </button>
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
