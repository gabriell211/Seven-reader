import { useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { IsoValidationReport, PageBoxUpdate, PrintPreflightReport } from "../types";
import { SevenIcon } from "./SevenIcon";

interface PrintProductionDialogProps {
  report: PrintPreflightReport | null;
  loading: boolean;
  isoReport: IsoValidationReport | null;
  isoLoading: boolean;
  veraPdfAvailable: boolean;
  pageCount: number;
  onClose: () => void;
  onReload: () => void;
  onValidateIso: (flavour: string, customProfile?: string) => void;
  onSetBoxes: (update: PageBoxUpdate) => void;
}

const MM_TO_PT = 72 / 25.4;

function mm(value: number): string {
  return (value / MM_TO_PT).toFixed(1);
}

function boxText(box?: [number, number, number, number]): string {
  if (!box) return "—";
  return box.map((value) => value.toFixed(1)).join(" · ");
}


interface ProductionProfile {
  id: string;
  name: string;
  requireOutputIntent: boolean;
  allowDeviceRgb: boolean;
  allowTransparency: boolean;
  requireEmbeddedFonts: boolean;
  requireTrimBox: boolean;
  requireBleedBox: boolean;
  allowAnnotations: boolean;
}

interface ProductionCheck {
  id: string;
  scope: "document" | "font" | "page";
  label: string;
  detail: string;
  passed: boolean;
  severity: "error" | "warning";
}

const PROFILE_KEY = "seven-reader:preflight-profiles:v1";

const builtInProfiles: ProductionProfile[] = [
  {
    id: "general-print",
    name: "Impressão geral",
    requireOutputIntent: false,
    allowDeviceRgb: true,
    allowTransparency: true,
    requireEmbeddedFonts: true,
    requireTrimBox: false,
    requireBleedBox: false,
    allowAnnotations: true,
  },
  {
    id: "press-ready",
    name: "Press-ready",
    requireOutputIntent: true,
    allowDeviceRgb: false,
    allowTransparency: true,
    requireEmbeddedFonts: true,
    requireTrimBox: true,
    requireBleedBox: true,
    allowAnnotations: false,
  },
  {
    id: "legacy-flattened",
    name: "Fluxo legado sem transparência",
    requireOutputIntent: true,
    allowDeviceRgb: false,
    allowTransparency: false,
    requireEmbeddedFonts: true,
    requireTrimBox: true,
    requireBleedBox: true,
    allowAnnotations: false,
  },
];

function loadCustomProfiles(): ProductionProfile[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function boxInside(inner: [number, number, number, number], outer: [number, number, number, number]): boolean {
  return inner[0] >= outer[0] && inner[1] >= outer[1] && inner[2] <= outer[2] && inner[3] <= outer[3];
}

function evaluateProductionProfile(report: PrintPreflightReport, profile: ProductionProfile): ProductionCheck[] {
  const checks: ProductionCheck[] = [];
  const add = (id: string, scope: ProductionCheck["scope"], label: string, detail: string, passed: boolean, severity: ProductionCheck["severity"] = "error") =>
    checks.push({ id, scope, label, detail, passed, severity });

  add(
    "output-intent",
    "document",
    "OutputIntent",
    report.hasOutputIntent ? "OutputIntent declarado." : "Nenhum OutputIntent declarado no catálogo.",
    !profile.requireOutputIntent || report.hasOutputIntent,
  );
  add(
    "device-rgb",
    "document",
    "DeviceRGB",
    report.usesDeviceRgb ? "DeviceRGB detectado." : "Nenhum DeviceRGB detectado.",
    profile.allowDeviceRgb || !report.usesDeviceRgb,
    "warning",
  );
  add(
    "transparency",
    "document",
    "Transparência",
    report.hasTransparency ? "Transparência/blend mode detectado." : "Nenhuma transparência detectada.",
    profile.allowTransparency || !report.hasTransparency,
  );
  add(
    "pdf-version",
    "document",
    "Versão PDF",
    `Documento declara PDF ${report.pdfVersion}.`,
    /^1\.[3-7]$|^2\.0$/.test(report.pdfVersion),
  );

  for (const font of report.fonts) {
    add(
      `font-${font.objectId}`,
      "font",
      `Fonte ${font.name}`,
      font.embedded
        ? `${font.subtype || "Fonte"} incorporada${font.subset ? " como subset" : ""}.`
        : `${font.subtype || "Fonte"} sem programa incorporado.`,
      !profile.requireEmbeddedFonts || font.embedded,
    );
  }

  for (const page of report.pages) {
    const pageNumber = page.pageIndex + 1;
    add(
      `page-${page.pageIndex}-media`,
      "page",
      `Página ${pageNumber} · MediaBox`,
      `${mm(page.widthPt)} × ${mm(page.heightPt)} mm.`,
      page.widthPt > 0 && page.heightPt > 0,
    );
    add(
      `page-${page.pageIndex}-rotation`,
      "page",
      `Página ${pageNumber} · rotação`,
      `Rotate = ${page.rotation}°.`,
      ((page.rotation % 360) + 360) % 90 === 0,
      "warning",
    );

    if (profile.requireTrimBox || page.trimBox) {
      add(
        `page-${page.pageIndex}-trim`,
        "page",
        `Página ${pageNumber} · TrimBox`,
        page.trimBox ? "TrimBox presente e verificado contra MediaBox." : "TrimBox ausente.",
        Boolean(page.trimBox && boxInside(page.trimBox, page.mediaBox)),
      );
    }
    if (profile.requireBleedBox || page.bleedBox) {
      add(
        `page-${page.pageIndex}-bleed`,
        "page",
        `Página ${pageNumber} · BleedBox`,
        page.bleedBox ? "BleedBox presente e verificado contra MediaBox." : "BleedBox ausente.",
        Boolean(page.bleedBox && boxInside(page.bleedBox, page.mediaBox)),
      );
      if (page.bleedBox && page.trimBox) {
        add(
          `page-${page.pageIndex}-bleed-trim`,
          "page",
          `Página ${pageNumber} · sangria`,
          "BleedBox deve envolver o TrimBox.",
          boxInside(page.trimBox, page.bleedBox),
        );
      }
    }
    add(
      `page-${page.pageIndex}-annotations`,
      "page",
      `Página ${pageNumber} · anotações`,
      `${page.annotations} anotação(ões).`,
      profile.allowAnnotations || page.annotations === 0,
      "warning",
    );
  }

  return checks;
}

export function PrintProductionDialog({
  report,
  loading,
  isoReport,
  isoLoading,
  veraPdfAvailable,
  pageCount,
  onClose,
  onReload,
  onValidateIso,
  onSetBoxes,
}: PrintProductionDialogProps) {
  const [tab, setTab] = useState<"preflight" | "iso" | "fonts" | "pages">("preflight");
  const [isoFlavour, setIsoFlavour] = useState("2b");
  const [customProfile, setCustomProfile] = useState("");
  const [pageStart, setPageStart] = useState(1);
  const [pageEnd, setPageEnd] = useState(pageCount);
  const [trimMm, setTrimMm] = useState(3);
  const [bleedMm, setBleedMm] = useState(0);
  const [cropToTrim, setCropToTrim] = useState(false);
  const [customProfiles, setCustomProfiles] = useState<ProductionProfile[]>(loadCustomProfiles);
  const [profileId, setProfileId] = useState("general-print");
  const [showOnlyFailures, setShowOnlyFailures] = useState(true);
  const [customProfileName, setCustomProfileName] = useState("");

  useEffect(() => { onReload(); }, []);

  const profiles = useMemo(() => [...builtInProfiles, ...customProfiles], [customProfiles]);
  const activeProfile = profiles.find((profile) => profile.id === profileId) ?? builtInProfiles[0];
  const productionChecks = useMemo(
    () => report ? evaluateProductionProfile(report, activeProfile) : [],
    [report, activeProfile],
  );
  const visibleProductionChecks = showOnlyFailures
    ? productionChecks.filter((check) => !check.passed)
    : productionChecks;
  const failedProductionChecks = productionChecks.filter((check) => !check.passed);

  const unembedded = useMemo(
    () => report?.fonts.filter((font) => !font.embedded).length ?? 0,
    [report],
  );

  const chooseCustomProfile = async () => {
    const selected = await open({
      title: "Selecionar perfil de validação veraPDF",
      multiple: false,
      directory: false,
      filters: [{ name: "Perfil veraPDF", extensions: ["xml"] }],
    });
    if (typeof selected === "string") {
      setCustomProfile(selected);
      onValidateIso("0", selected);
    }
  };

  const saveCustomProfile = () => {
    const name = customProfileName.trim();
    if (!name) return;
    const profile: ProductionProfile = {
      ...activeProfile,
      id: `custom-${Date.now()}`,
      name,
    };
    setCustomProfiles((current) => {
      const next = [...current, profile];
      localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
      return next;
    });
    setProfileId(profile.id);
    setCustomProfileName("");
  };

  const removeCustomProfile = () => {
    if (!activeProfile.id.startsWith("custom-")) return;
    setCustomProfiles((current) => {
      const next = current.filter((profile) => profile.id !== activeProfile.id);
      localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
      return next;
    });
    setProfileId("general-print");
  };

  const applyBoxes = () => {
    onSetBoxes({
      pageStart,
      pageEnd,
      trimInsetPt: trimMm * MM_TO_PT,
      bleedInsetPt: bleedMm * MM_TO_PT,
      cropToTrim,
    });
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="workflow-dialog print-production-dialog" role="dialog" aria-modal="true">
        <header className="organizer-head">
          <div>
            <span className="eyebrow">PRODUÇÃO DE IMPRESSÃO</span>
            <h2>Preflight e boxes</h2>
            <p>Inspeção estrutural local de cores, fontes, transparência, overprint, OutputIntent e caixas de página.</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Fechar"><SevenIcon name="close" /></button>
        </header>

        <div className="workflow-tabs">
          <button className={tab === "preflight" ? "active" : ""} onClick={() => setTab("preflight")}>Preflight</button>
          <button className={tab === "iso" ? "active" : ""} onClick={() => setTab("iso")}>PDF/A · PDF/UA</button>
          <button className={tab === "fonts" ? "active" : ""} onClick={() => setTab("fonts")}>Fontes</button>
          <button className={tab === "pages" ? "active" : ""} onClick={() => setTab("pages")}>Boxes</button>
        </div>

        <div className="workflow-body">
          <div className="production-toolbar">
            <button className="secondary-light-button" onClick={onReload}><SevenIcon name="history" /> Reanalisar</button>
            {report && <span>PDF {report.pdfVersion} · {report.pageCount} páginas</span>}
          </div>

          {loading && <div className="report-loading"><span className="loader-ring" /> Executando preflight estrutural…</div>}

          {!loading && report && tab === "preflight" && (
            <>
              <section className="production-profile-panel">
                <div className="production-profile-top">
                  <label className="workflow-field">
                    <span>Perfil de produção</span>
                    <select value={profileId} onChange={(event) => setProfileId(event.target.value)}>
                      {profiles.map((profile) => <option value={profile.id} key={profile.id}>{profile.name}</option>)}
                    </select>
                  </label>
                  <div className={failedProductionChecks.length ? "profile-score failed" : "profile-score passed"}>
                    <strong>{productionChecks.length - failedProductionChecks.length}/{productionChecks.length}</strong>
                    <small>checks aprovados</small>
                  </div>
                </div>
                <div className="profile-rule-grid">
                  <label><input type="checkbox" checked={activeProfile.requireOutputIntent} onChange={(event) => {
                    const next = { ...activeProfile, requireOutputIntent: event.target.checked, id: `custom-${Date.now()}`, name: "Perfil personalizado" };
                    setCustomProfiles((current) => [...current.filter((item) => item.id !== activeProfile.id || !activeProfile.id.startsWith("custom-")), next]);
                    setProfileId(next.id);
                  }} /> Exigir OutputIntent</label>
                  <label><input type="checkbox" checked={!activeProfile.allowDeviceRgb} onChange={(event) => {
                    const next = { ...activeProfile, allowDeviceRgb: !event.target.checked, id: `custom-${Date.now()}`, name: "Perfil personalizado" };
                    setCustomProfiles((current) => [...current.filter((item) => item.id !== activeProfile.id || !activeProfile.id.startsWith("custom-")), next]);
                    setProfileId(next.id);
                  }} /> Bloquear DeviceRGB</label>
                  <label><input type="checkbox" checked={!activeProfile.allowTransparency} onChange={(event) => {
                    const next = { ...activeProfile, allowTransparency: !event.target.checked, id: `custom-${Date.now()}`, name: "Perfil personalizado" };
                    setCustomProfiles((current) => [...current.filter((item) => item.id !== activeProfile.id || !activeProfile.id.startsWith("custom-")), next]);
                    setProfileId(next.id);
                  }} /> Bloquear transparência</label>
                  <label><input type="checkbox" checked={activeProfile.requireEmbeddedFonts} onChange={(event) => {
                    const next = { ...activeProfile, requireEmbeddedFonts: event.target.checked, id: `custom-${Date.now()}`, name: "Perfil personalizado" };
                    setCustomProfiles((current) => [...current.filter((item) => item.id !== activeProfile.id || !activeProfile.id.startsWith("custom-")), next]);
                    setProfileId(next.id);
                  }} /> Exigir fontes embutidas</label>
                  <label><input type="checkbox" checked={activeProfile.requireTrimBox} onChange={(event) => {
                    const next = { ...activeProfile, requireTrimBox: event.target.checked, id: `custom-${Date.now()}`, name: "Perfil personalizado" };
                    setCustomProfiles((current) => [...current.filter((item) => item.id !== activeProfile.id || !activeProfile.id.startsWith("custom-")), next]);
                    setProfileId(next.id);
                  }} /> Exigir TrimBox</label>
                  <label><input type="checkbox" checked={activeProfile.requireBleedBox} onChange={(event) => {
                    const next = { ...activeProfile, requireBleedBox: event.target.checked, id: `custom-${Date.now()}`, name: "Perfil personalizado" };
                    setCustomProfiles((current) => [...current.filter((item) => item.id !== activeProfile.id || !activeProfile.id.startsWith("custom-")), next]);
                    setProfileId(next.id);
                  }} /> Exigir BleedBox</label>
                </div>
                <div className="profile-save-row">
                  <label><input type="checkbox" checked={showOnlyFailures} onChange={(event) => setShowOnlyFailures(event.target.checked)} /> Mostrar somente falhas</label>
                  <input value={customProfileName} onChange={(event) => setCustomProfileName(event.target.value)} placeholder="Nome do perfil" />
                  <button className="secondary-light-button" disabled={!customProfileName.trim()} onClick={saveCustomProfile}>Salvar perfil</button>
                  {activeProfile.id.startsWith("custom-") && <button className="danger-quiet" onClick={removeCustomProfile}>Excluir perfil</button>}
                </div>
                <div className="production-check-list">
                  {visibleProductionChecks.length === 0 && (
                    <div className="preflight-ok"><SevenIcon name="shield" /><span>Nenhuma falha para este perfil.</span></div>
                  )}
                  {visibleProductionChecks.map((check) => (
                    <article className={check.passed ? "passed" : check.severity === "error" ? "failed" : "warning"} key={check.id}>
                      <SevenIcon name={check.passed ? "shield" : "comment"} />
                      <div><strong>{check.label}</strong><small>{check.scope} · {check.detail}</small></div>
                    </article>
                  ))}
                </div>
              </section>

              <div className="production-summary-grid">
                <div><span>OutputIntent</span><strong>{report.hasOutputIntent ? "Sim" : "Não"}</strong></div>
                <div><span>RGB</span><strong>{report.usesDeviceRgb ? "DeviceRGB" : "—"}</strong></div>
                <div><span>CMYK</span><strong>{report.usesDeviceCmyk ? "DeviceCMYK" : "—"}</strong></div>
                <div><span>ICC</span><strong>{report.usesIcc ? "Detectado" : "—"}</strong></div>
                <div><span>Transparência</span><strong>{report.hasTransparency ? "Sim" : "Não"}</strong></div>
                <div><span>Overprint</span><strong>{report.hasOverprint ? "Sim" : "Não"}</strong></div>
                <div><span>Spot colors</span><strong>{report.spotColors.length}</strong></div>
                <div><span>Fontes não embutidas</span><strong>{unembedded}</strong></div>
              </div>

              {report.spotColors.length > 0 && (
                <div className="spot-color-list">
                  <strong>Cores especiais</strong>
                  <div>{report.spotColors.map((name) => <span key={name}>{name}</span>)}</div>
                </div>
              )}

              <div className="preflight-warnings">
                {report.warnings.length === 0
                  ? <div className="preflight-ok"><SevenIcon name="shield" /><span>Nenhum alerta estrutural básico detectado.</span></div>
                  : report.warnings.map((warning, index) => (
                    <div key={index}><SevenIcon name="comment" /><span>{warning}</span></div>
                  ))}
              </div>
            </>
          )}

          {tab === "iso" && (
            <div className="iso-preflight">
              <div className={veraPdfAvailable ? "capability-inline ok" : "capability-inline"}>
                <SevenIcon name="shield" />
                <div>
                  <strong>{veraPdfAvailable ? "veraPDF disponível" : "veraPDF não detectado"}</strong>
                  <small>{veraPdfAvailable
                    ? "Validação completa contra perfis PDF/A e PDF/UA built-in."
                    : "A validação ISO completa fica indisponível; o preflight estrutural interno continua ativo."}</small>
                </div>
              </div>

              <div className="iso-profile-row">
                <label className="workflow-field">
                  <span>Perfil de validação</span>
                  <select value={isoFlavour} disabled={!veraPdfAvailable} onChange={(event) => setIsoFlavour(event.target.value)}>
                    <option value="0">Auto-detectar declaração</option>
                    <optgroup label="PDF/A">
                      <option value="1a">PDF/A-1a</option>
                      <option value="1b">PDF/A-1b</option>
                      <option value="2a">PDF/A-2a</option>
                      <option value="2b">PDF/A-2b</option>
                      <option value="2u">PDF/A-2u</option>
                      <option value="3a">PDF/A-3a</option>
                      <option value="3b">PDF/A-3b</option>
                      <option value="3u">PDF/A-3u</option>
                      <option value="4">PDF/A-4</option>
                      <option value="4e">PDF/A-4e</option>
                      <option value="4f">PDF/A-4f</option>
                    </optgroup>
                    <optgroup label="Acessibilidade">
                      <option value="ua1">PDF/UA-1</option>
                      <option value="ua2">PDF/UA-2</option>
                      <option value="wt1a">WTPDF 1.0 Accessibility</option>
                      <option value="wt1r">WTPDF 1.0 Reuse</option>
                    </optgroup>
                  </select>
                </label>
                <button className="primary-button" disabled={!veraPdfAvailable || isoLoading} onClick={() => onValidateIso(isoFlavour)}>
                  <SevenIcon name="shield" /> Validar
                </button>
                <button className="secondary-light-button" disabled={!veraPdfAvailable || isoLoading} onClick={() => void chooseCustomProfile()}>
                  Perfil XML…
                </button>
              </div>

              {customProfile && <div className="selected-path"><strong>Perfil customizado</strong><span>{customProfile}</span></div>}
              {isoLoading && <div className="report-loading"><span className="loader-ring" /> Executando validação ISO…</div>}

              {!isoLoading && isoReport && (
                <>
                  <div className={isoReport.compliant ? "iso-validation-summary compliant" : "iso-validation-summary failed"}>
                    <SevenIcon name={isoReport.compliant ? "shield" : "comment"} />
                    <div>
                      <strong>{isoReport.profileName || "Perfil veraPDF"}</strong>
                      <span>{isoReport.statement || (isoReport.compliant ? "Conforme." : "Não conforme.")}</span>
                    </div>
                    <b>{isoReport.compliant ? "CONFORME" : "FALHOU"}</b>
                  </div>
                  <div className="production-summary-grid">
                    <div><span>Regras aprovadas</span><strong>{isoReport.passedRules}</strong></div>
                    <div><span>Regras falhas</span><strong>{isoReport.failedRules}</strong></div>
                    <div><span>Checks aprovados</span><strong>{isoReport.passedChecks}</strong></div>
                    <div><span>Checks falhos</span><strong>{isoReport.failedChecks}</strong></div>
                  </div>
                  <div className="iso-failure-list">
                    {isoReport.failures.length === 0 && !isoReport.compliant && (
                      <div className="empty-panel">O relatório marcou não conformidade, mas não retornou detalhes de regra no limite configurado.</div>
                    )}
                    {isoReport.failures.map((failure, index) => (
                      <article key={`${failure.specification}-${failure.clause}-${failure.testNumber}-${index}`}>
                        <div><strong>{failure.specification || "ISO"} · cláusula {failure.clause || "—"}</strong><small>Teste {failure.testNumber || "—"} · {failure.failedChecks} check(s) falho(s)</small></div>
                        <p>{failure.description}</p>
                        {failure.object && <code>{failure.object}</code>}
                      </article>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {!loading && report && tab === "fonts" && (
            <div className="preflight-table-wrap">
              <table className="preflight-table">
                <thead><tr><th>Fonte</th><th>Tipo</th><th>Embutida</th><th>Subset</th><th>Objeto</th></tr></thead>
                <tbody>
                  {report.fonts.map((font) => (
                    <tr key={font.objectId}>
                      <td>{font.name}</td>
                      <td>{font.subtype || "—"}</td>
                      <td>{font.embedded ? "Sim" : "Não"}</td>
                      <td>{font.subset ? "Sim" : "Não"}</td>
                      <td>{font.objectId}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!report.fonts.length && <div className="empty-panel">Nenhum objeto /Font listado.</div>}
            </div>
          )}

          {!loading && report && tab === "pages" && (
            <>
              <div className="page-box-editor">
                <div className="two-column-fields">
                  <label className="workflow-field"><span>Da página</span><input type="number" min={1} max={pageCount} value={pageStart} onChange={(e) => setPageStart(Math.max(1, Math.min(pageCount, Number(e.target.value) || 1)))} /></label>
                  <label className="workflow-field"><span>Até</span><input type="number" min={pageStart} max={pageCount} value={pageEnd} onChange={(e) => setPageEnd(Math.max(pageStart, Math.min(pageCount, Number(e.target.value) || pageStart)))} /></label>
                </div>
                <div className="two-column-fields">
                  <label className="workflow-field"><span>TrimBox inset</span><div className="measurement-input"><input type="number" min={0} step={0.1} value={trimMm} onChange={(e) => setTrimMm(Math.max(0, Number(e.target.value) || 0))} /><small>mm</small></div></label>
                  <label className="workflow-field"><span>BleedBox inset</span><div className="measurement-input"><input type="number" min={0} max={trimMm} step={0.1} value={bleedMm} onChange={(e) => setBleedMm(Math.max(0, Math.min(trimMm, Number(e.target.value) || 0)))} /><small>mm</small></div></label>
                </div>
                <label className="toggle-row"><input type="checkbox" checked={cropToTrim} onChange={(e) => setCropToTrim(e.target.checked)} /><span><strong>CropBox = TrimBox</strong><small>Útil para revisar a área final; não altera MediaBox.</small></span></label>
                <div className="organizer-note"><SevenIcon name="pages" /><span>O inset é medido para dentro do MediaBox. Ex.: MediaBox inclui 3 mm de sangria → TrimBox inset 3 mm e BleedBox inset 0 mm.</span></div>
                <button className="primary-button workflow-submit" disabled={pageStart > pageEnd || bleedMm > trimMm} onClick={applyBoxes}><SevenIcon name="edit" /> Aplicar boxes à sessão</button>
              </div>

              <div className="preflight-table-wrap">
                <table className="preflight-table page-box-table">
                  <thead><tr><th>Pág.</th><th>Tamanho</th><th>MediaBox</th><th>TrimBox</th><th>BleedBox</th><th>CropBox</th></tr></thead>
                  <tbody>{report.pages.map((item) => (
                    <tr key={item.pageIndex}>
                      <td>{item.pageIndex + 1}</td>
                      <td>{mm(item.widthPt)} × {mm(item.heightPt)} mm</td>
                      <td>{boxText(item.mediaBox)}</td>
                      <td>{boxText(item.trimBox)}</td>
                      <td>{boxText(item.bleedBox)}</td>
                      <td>{boxText(item.cropBox)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
