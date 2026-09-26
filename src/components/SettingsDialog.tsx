import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { defaultSettings, type QuickToolId, type SevenSettings, type SidePanelId } from "../lib/settings";
import { SevenIcon } from "./SevenIcon";

interface SettingsDialogProps {
  settings: SevenSettings;
  onClose: () => void;
  onChange: (settings: SevenSettings) => void;
}

export function SettingsDialog({ settings, onClose, onChange }: SettingsDialogProps) {
  const [trustedHostInput, setTrustedHostInput] = useState("");
  const [trustedHostError, setTrustedHostError] = useState("");

  const patch = <K extends keyof SevenSettings>(key: K, value: SevenSettings[K]) =>
    onChange({ ...settings, [key]: value });

  const moveItem = <T,>(items: T[], index: number, direction: -1 | 1): T[] => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return items;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  };

  const quickToolLabels: Record<QuickToolId, string> = {
    select: "Seleção",
    hand: "Mão",
    comment: "Comentário",
    highlight: "Destaque",
    underline: "Sublinhado",
    strikeout: "Tachado",
    draw: "Desenho",
    text: "Editar texto",
    fill: "Preencher",
    sign: "Assinatura",
    eraser: "Remover comentário",
  };

  const sidePanelLabels: Record<SidePanelId, string> = {
    thumbs: "Miniaturas",
    search: "Busca",
    bookmarks: "Marcadores",
    comments: "Comentários",
    attachments: "Anexos",
    layers: "Camadas",
    signatures: "Assinaturas",
    fields: "Campos",
    tasks: "Tarefas",
  };

  const toggleQuickTool = (id: QuickToolId) => {
    patch(
      "quickTools",
      settings.quickTools.includes(id)
        ? settings.quickTools.filter((item) => item !== id)
        : [...settings.quickTools, id],
    );
  };

  const toggleSidePanel = (id: SidePanelId) => {
    patch(
      "sidePanels",
      settings.sidePanels.includes(id)
        ? settings.sidePanels.filter((item) => item !== id)
        : [...settings.sidePanels, id],
    );
  };

  const addTrustedLocation = async () => {
    const selected = await open({ title: "Adicionar local confiável", directory: true, multiple: false });
    if (typeof selected !== "string" || settings.trustedLocations.includes(selected)) return;
    patch("trustedLocations", [...settings.trustedLocations, selected]);
  };

  const normalizeTrustedHost = (value: string): string | null => {
    const candidate = value.trim().toLocaleLowerCase();
    if (!candidate) return null;
    try {
      const url = candidate.includes("://") ? new URL(candidate) : new URL("https://" + candidate);
      if (!url.hostname || url.username || url.password || (url.pathname !== "/" && url.pathname !== "")) return null;
      return url.hostname.toLocaleLowerCase();
    } catch {
      return null;
    }
  };

  const addTrustedHost = () => {
    const host = normalizeTrustedHost(trustedHostInput);
    if (!host) {
      setTrustedHostError("Informe somente um host válido, por exemplo: empresa.com.br");
      return;
    }
    if (settings.trustedHosts.includes(host)) {
      setTrustedHostError("Esse host já está na lista confiável.");
      return;
    }
    patch("trustedHosts", [...settings.trustedHosts, host].sort());
    setTrustedHostInput("");
    setTrustedHostError("");
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="settings-dialog" role="dialog" aria-modal="true">
        <header className="organizer-head">
          <div><span className="eyebrow">PREFERÊNCIAS</span><h2>Seven Reader</h2><p>Configurações locais deste dispositivo.</p></div>
          <button className="icon-button" onClick={onClose}><SevenIcon name="close" /></button>
        </header>

        <div className="settings-scroll">
          <section className="settings-section">
            <div><span className="eyebrow">APARÊNCIA</span><h3>Tema</h3></div>
            <div className="segmented">
              {(["system","light","dark"] as const).map((value) => <button key={value} className={settings.appearance===value?"active":""} onClick={()=>patch("appearance",value)}>{value==="system"?"Sistema":value==="light"?"Claro":"Escuro"}</button>)}
            </div>
          </section>

          <section className="settings-section">
            <div><span className="eyebrow">DOCUMENTOS</span><h3>Visualização</h3></div>
            <label className="settings-number"><span>Zoom padrão</span><input type="number" min={25} max={400} value={settings.defaultZoom} onChange={(e)=>patch("defaultZoom",Math.max(25,Math.min(400,Number(e.target.value)||100)))}/><small>%</small></label>
            <label className="toggle-row"><input type="checkbox" checked={settings.reopenLastDocument} onChange={(e)=>patch("reopenLastDocument",e.target.checked)}/><span><strong>Reabrir último documento</strong><small>O caminho fica armazenado somente neste dispositivo.</small></span></label>
          </section>

          <section className="settings-section">
            <div><span className="eyebrow">WORKSPACE</span><h3>Ferramentas rápidas</h3></div>
            <p className="settings-help">Escolha quais ferramentas aparecem na barra flutuante e altere a ordem. A posição arrastada no documento também é memorizada.</p>
            <div className="settings-order-list">
              {(Object.keys(quickToolLabels) as QuickToolId[]).map((id) => {
                const active = settings.quickTools.includes(id);
                const index = settings.quickTools.indexOf(id);
                return (
                  <div className={active ? "settings-order-row active" : "settings-order-row"} key={id}>
                    <label><input type="checkbox" checked={active} onChange={() => toggleQuickTool(id)} /><span>{quickToolLabels[id]}</span></label>
                    <div>
                      <button disabled={!active || index <= 0} onClick={() => patch("quickTools", moveItem(settings.quickTools, index, -1))}>↑</button>
                      <button disabled={!active || index < 0 || index >= settings.quickTools.length - 1} onClick={() => patch("quickTools", moveItem(settings.quickTools, index, 1))}>↓</button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="settings-inline-actions">
              <button onClick={() => patch("quickTools", [...defaultSettings.quickTools])}>Restaurar ferramentas</button>
              <button onClick={() => patch("quickToolsPosition", null)}>Restaurar posição</button>
            </div>
          </section>

          <section className="settings-section">
            <div><span className="eyebrow">WORKSPACE</span><h3>Painéis laterais</h3></div>
            <p className="settings-help">Mostre, oculte e reordene atalhos dos painéis disponíveis no documento.</p>
            <div className="settings-order-list">
              {(Object.keys(sidePanelLabels) as SidePanelId[]).map((id) => {
                const active = settings.sidePanels.includes(id);
                const index = settings.sidePanels.indexOf(id);
                return (
                  <div className={active ? "settings-order-row active" : "settings-order-row"} key={id}>
                    <label><input type="checkbox" checked={active} onChange={() => toggleSidePanel(id)} /><span>{sidePanelLabels[id]}</span></label>
                    <div>
                      <button disabled={!active || index <= 0} onClick={() => patch("sidePanels", moveItem(settings.sidePanels, index, -1))}>↑</button>
                      <button disabled={!active || index < 0 || index >= settings.sidePanels.length - 1} onClick={() => patch("sidePanels", moveItem(settings.sidePanels, index, 1))}>↓</button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="settings-inline-actions">
              <button onClick={() => patch("sidePanels", [...defaultSettings.sidePanels])}>Restaurar painéis</button>
            </div>
          </section>

          <section className="settings-section">
            <div><span className="eyebrow">ACESSIBILIDADE</span><h3>Leitura e interface</h3></div>
            <label className="toggle-row"><input type="checkbox" checked={settings.highContrast} onChange={(e)=>patch("highContrast",e.target.checked)}/><span><strong>Alto contraste</strong><small>Aumenta contraste de texto, bordas e superfícies do aplicativo.</small></span></label>
            <label className="toggle-row"><input type="checkbox" checked={settings.reducedMotion} onChange={(e)=>patch("reducedMotion",e.target.checked)}/><span><strong>Reduzir movimento</strong><small>Desativa animações e transições não essenciais.</small></span></label>
            <label className="settings-number"><span>Tamanho do texto em Reflow</span><input type="number" min={12} max={40} value={settings.reflowFontSize} onChange={(e)=>patch("reflowFontSize",Math.max(12,Math.min(40,Number(e.target.value)||18)))}/><small>px</small></label>
            <label className="workflow-field"><span>Velocidade da leitura em voz alta</span><div className="range-row"><input type="range" min={0.5} max={2} step={0.1} value={settings.readAloudRate} onChange={(e)=>patch("readAloudRate",Number(e.target.value))}/><strong>{settings.readAloudRate.toFixed(1)}×</strong></div></label>
            <label className="workflow-field"><span>Tom da voz</span><div className="range-row"><input type="range" min={0.5} max={2} step={0.1} value={settings.readAloudPitch} onChange={(e)=>patch("readAloudPitch",Number(e.target.value))}/><strong>{settings.readAloudPitch.toFixed(1)}</strong></div></label>
          </section>

          <section className="settings-section">
            <div><span className="eyebrow">SEGURANÇA</span><h3>Modo protegido</h3></div>
            <label className="toggle-row"><input type="checkbox" checked={settings.protectedView} onChange={(e)=>patch("protectedView",e.target.checked)}/><span><strong>Visualização protegida para arquivos não confiáveis</strong><small>Bloqueia operações de escrita quando conteúdo ativo é encontrado.</small></span></label>
            <label className="toggle-row"><input type="checkbox" checked={settings.blockLaunchActions} onChange={(e)=>patch("blockLaunchActions",e.target.checked)}/><span><strong>Bloquear Launch actions</strong><small>O Seven nunca executa Launch automaticamente.</small></span></label>
            <label className="toggle-row"><input type="checkbox" checked={settings.warnExternalUrls} onChange={(e)=>patch("warnExternalUrls",e.target.checked)}/><span><strong>Confirmar URLs externas</strong><small>Aplicável quando a navegação externa for iniciada pelo usuário.</small></span></label>
            <div className="trusted-locations">
              <div className="setting-row-title"><strong>Locais confiáveis</strong><button onClick={()=>void addTrustedLocation()}><SevenIcon name="create"/> Adicionar pasta</button></div>
              {settings.trustedLocations.map((path)=><div className="trusted-row" key={path}><SevenIcon name="folder"/><span>{path}</span><button onClick={()=>patch("trustedLocations",settings.trustedLocations.filter((item)=>item!==path))}><SevenIcon name="close"/></button></div>)}
              {!settings.trustedLocations.length&&<small>Nenhum local confiável configurado.</small>}
            </div>
            <div className="trusted-locations">
              <div className="setting-row-title"><strong>Hosts confiáveis</strong></div>
              <div className="trusted-host-entry">
                <input
                  value={trustedHostInput}
                  onChange={(event) => { setTrustedHostInput(event.target.value); setTrustedHostError(""); }}
                  onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addTrustedHost(); } }}
                  placeholder="empresa.com.br"
                  aria-label="Host confiável"
                />
                <button disabled={!trustedHostInput.trim()} onClick={addTrustedHost}><SevenIcon name="create"/> Adicionar</button>
              </div>
              {trustedHostError && <small className="settings-error">{trustedHostError}</small>}
              {settings.trustedHosts.map((host)=><div className="trusted-row" key={host}><SevenIcon name="shield"/><span>{host}</span><button aria-label={"Remover host " + host} onClick={()=>patch("trustedHosts",settings.trustedHosts.filter((item)=>item!==host))}><SevenIcon name="close"/></button></div>)}
              {!settings.trustedHosts.length&&<small>Nenhum host confiável configurado. URLs externas continuam pedindo confirmação.</small>}
            </div>
          </section>

          <section className="settings-section">
            <div><span className="eyebrow">OCR</span><h3>Padrões</h3></div>
            <label className="workflow-field"><span>Idiomas</span><input value={settings.ocrLanguage} onChange={(e)=>patch("ocrLanguage",e.target.value)}/></label>
            <label className="workflow-field"><span>Saída</span><select value={settings.ocrOutputType} onChange={(e)=>patch("ocrOutputType",e.target.value as SevenSettings["ocrOutputType"])}><option value="auto">Automática</option><option value="pdf">PDF</option><option value="pdfa">PDF/A</option></select></label>
          </section>

          <section className="settings-section">
            <div><span className="eyebrow">CONVERSÃO</span><h3>Imagem</h3></div>
            <label className="settings-number"><span>DPI padrão</span><input type="number" min={72} max={1200} value={settings.conversionDpi} onChange={(e)=>patch("conversionDpi",Math.max(72,Math.min(1200,Number(e.target.value)||150)))}/><small>DPI</small></label>
          </section>

          <section className="settings-section">
            <div><span className="eyebrow">ASSINATURAS</span><h3>Validação</h3></div>
            <label className="toggle-row"><input type="checkbox" checked={settings.signatureValidationOnline} onChange={(e)=>patch("signatureValidationOnline",e.target.checked)}/><span><strong>Permitir checagem online quando solicitada</strong><small>Revogação/chain validation continua opt-in por operação.</small></span></label>
          </section>
        </div>
      </section>
    </div>
  );
}
