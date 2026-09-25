import { useMemo, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import type {
  AnnotationInput,
  PadesLevelId,
  SignRequest,
  SignatureValidationReport,
} from "../types";
import { SevenIcon } from "./SevenIcon";

interface SignatureDialogProps {
  documentPath: string;
  pageIndex: number;
  initialTab: "electronic" | "digital" | "validate";
  validation: SignatureValidationReport | null;
  loading: boolean;
  onClose: () => void;
  onElectronic: (output: string, annotation: AnnotationInput) => void;
  onDigital: (output: string, request: SignRequest) => void;
  onValidate: (trustDirectory?: string, allowOnline?: boolean) => void;
}

export function SignatureDialog({
  documentPath,
  pageIndex,
  initialTab,
  validation,
  loading,
  onClose,
  onElectronic,
  onDigital,
  onValidate,
}: SignatureDialogProps) {
  const [tab, setTab] = useState(initialTab);
  const [visualName, setVisualName] = useState("");
  const [visualLabel, setVisualLabel] = useState("Assinado eletronicamente");
  const [x, setX] = useState(48);
  const [y, setY] = useState(48);
  const [width, setWidth] = useState(220);
  const [height, setHeight] = useState(48);

  const [pkcs12Path, setPkcs12Path] = useState("");
  const [password, setPassword] = useState("");
  const [level, setLevel] = useState<PadesLevelId>("bb");
  const [fieldName, setFieldName] = useState("Signature1");
  const [reason, setReason] = useState("");
  const [location, setLocation] = useState("");
  const [contactInfo, setContactInfo] = useState("");
  const [tsaUrl, setTsaUrl] = useState("");
  const [certify, setCertify] = useState(false);
  const [visible, setVisible] = useState(true);
  const [appearanceText, setAppearanceText] = useState("Assinado digitalmente");

  const [trustDirectory, setTrustDirectory] = useState("");
  const [allowOnline, setAllowOnline] = useState(false);

  const needsTsa = level !== "bb";
  const digitalReady = useMemo(
    () => Boolean(pkcs12Path && password && fieldName.trim() && (!needsTsa || tsaUrl.trim())),
    [pkcs12Path, password, fieldName, needsTsa, tsaUrl],
  );

  const choosePkcs12 = async () => {
    const selected = await open({
      title: "Selecionar certificado PKCS#12",
      multiple: false,
      directory: false,
      filters: [{ name: "Certificado PKCS#12", extensions: ["p12", "pfx"] }],
    });
    if (typeof selected === "string") setPkcs12Path(selected);
  };

  const chooseTrust = async () => {
    const selected = await open({
      title: "Pasta de certificados confiáveis PEM",
      multiple: false,
      directory: true,
    });
    if (typeof selected === "string") setTrustDirectory(selected);
  };

  const chooseOutput = async (suffix: string) => save({
    title: "Salvar PDF assinado",
    defaultPath: documentPath.replace(/\.pdf$/i, `-${suffix}.pdf`),
    filters: [{ name: "Documento PDF", extensions: ["pdf"] }],
  });

  const applyElectronic = async () => {
    const output = await chooseOutput("assinado");
    if (!output) return;
    onElectronic(output, {
      pageIndex,
      kind: "freetext",
      text: [visualName.trim(), visualLabel.trim()].filter(Boolean).join(" · "),
      author: visualName.trim() || "Seven Reader",
      x,
      y,
      width,
      height,
    });
  };

  const applyDigital = async () => {
    const output = await chooseOutput(certify ? "certificado" : "assinado-digital");
    if (!output) return;
    onDigital(output, {
      pkcs12Path,
      password,
      level,
      fieldName: fieldName.trim(),
      pageIndex,
      reason: reason.trim() || undefined,
      location: location.trim() || undefined,
      contactInfo: contactInfo.trim() || undefined,
      tsaUrl: tsaUrl.trim() || undefined,
      certify,
      visible,
      appearanceText,
      x,
      y,
      width,
      height,
    });
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="workflow-dialog signature-dialog" role="dialog" aria-modal="true">
        <header className="organizer-head">
          <div>
            <span className="eyebrow">ASSINATURAS</span>
            <h2>Assinar e validar</h2>
            <p>Assinatura visual e assinatura digital criptográfica são tratadas separadamente.</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Fechar"><SevenIcon name="close" /></button>
        </header>

        <div className="workflow-tabs">
          <button className={tab === "electronic" ? "active" : ""} onClick={() => setTab("electronic")}>Eletrônica visual</button>
          <button className={tab === "digital" ? "active" : ""} onClick={() => setTab("digital")}>Digital PAdES</button>
          <button className={tab === "validate" ? "active" : ""} onClick={() => setTab("validate")}>Validar</button>
        </div>

        <div className="workflow-body">
          {tab === "electronic" && (
            <>
              <div className="signature-warning">
                <SevenIcon name="sign" />
                <div><strong>Assinatura eletrônica visual</strong><span>Cria uma marca visível no PDF. Não possui certificado, CMS, ByteRange nem validade criptográfica PAdES.</span></div>
              </div>
              <label className="workflow-field"><span>Nome do assinante</span><input value={visualName} onChange={(event) => setVisualName(event.target.value)} placeholder="Seu nome" /></label>
              <label className="workflow-field"><span>Texto adicional</span><input value={visualLabel} onChange={(event) => setVisualLabel(event.target.value)} /></label>
              <div className="signature-preview"><span>{visualName || "Seu nome"}</span><small>{visualLabel}</small></div>
              <div className="rect-grid">
                <label className="workflow-field"><span>X</span><input type="number" value={x} onChange={(event) => setX(Number(event.target.value))} /></label>
                <label className="workflow-field"><span>Y</span><input type="number" value={y} onChange={(event) => setY(Number(event.target.value))} /></label>
                <label className="workflow-field"><span>Largura</span><input type="number" min={1} value={width} onChange={(event) => setWidth(Number(event.target.value))} /></label>
                <label className="workflow-field"><span>Altura</span><input type="number" min={1} value={height} onChange={(event) => setHeight(Number(event.target.value))} /></label>
              </div>
              <button className="primary-button workflow-submit" disabled={!visualName.trim()} onClick={() => void applyElectronic()}><SevenIcon name="sign" /> Aplicar na página {pageIndex + 1}</button>
            </>
          )}

          {tab === "digital" && (
            <>
              <button className="certificate-picker" onClick={() => void choosePkcs12()}>
                <SevenIcon name="certificate" />
                <div><strong>{pkcs12Path ? "Certificado selecionado" : "Selecionar .P12 ou .PFX"}</strong><small>{pkcs12Path || "A chave privada permanece local."}</small></div>
              </button>
              <label className="workflow-field"><span>Senha do certificado</span><input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>

              <div className="two-column-fields">
                <label className="workflow-field"><span>Nível PAdES</span><select value={level} onChange={(event) => setLevel(event.target.value as PadesLevelId)}><option value="bb">B-B · assinatura básica</option><option value="bt">B-T · timestamp</option><option value="blt">B-LT · validação longa</option><option value="blta">B-LTA · arquivo de longo prazo</option></select></label>
                <label className="workflow-field"><span>Nome do campo</span><input value={fieldName} onChange={(event) => setFieldName(event.target.value)} /></label>
              </div>

              {needsTsa && <label className="workflow-field"><span>Servidor TSA RFC 3161</span><input value={tsaUrl} onChange={(event) => setTsaUrl(event.target.value)} placeholder="https://tsa.exemplo" /><small>Obrigatório para B-T, B-LT e B-LTA.</small></label>}
              <div className="two-column-fields">
                <label className="workflow-field"><span>Motivo</span><input value={reason} onChange={(event) => setReason(event.target.value)} /></label>
                <label className="workflow-field"><span>Local</span><input value={location} onChange={(event) => setLocation(event.target.value)} /></label>
              </div>
              <label className="workflow-field"><span>Contato</span><input value={contactInfo} onChange={(event) => setContactInfo(event.target.value)} /></label>

              <label className="toggle-row"><input type="checkbox" checked={certify} onChange={(event) => setCertify(event.target.checked)} /><span><strong>Certificar documento</strong><small>Cria assinatura de certificação/DocMDP quando aplicável.</small></span></label>
              <label className="toggle-row"><input type="checkbox" checked={visible} onChange={(event) => setVisible(event.target.checked)} /><span><strong>Aparência visível</strong><small>Além da assinatura criptográfica, desenha a aparência no PDF.</small></span></label>

              {visible && (
                <>
                  <label className="workflow-field"><span>Texto da aparência</span><input value={appearanceText} onChange={(event) => setAppearanceText(event.target.value)} /></label>
                  <div className="rect-grid">
                    <label className="workflow-field"><span>X</span><input type="number" value={x} onChange={(event) => setX(Number(event.target.value))} /></label>
                    <label className="workflow-field"><span>Y</span><input type="number" value={y} onChange={(event) => setY(Number(event.target.value))} /></label>
                    <label className="workflow-field"><span>Largura</span><input type="number" min={1} value={width} onChange={(event) => setWidth(Number(event.target.value))} /></label>
                    <label className="workflow-field"><span>Altura</span><input type="number" min={1} value={height} onChange={(event) => setHeight(Number(event.target.value))} /></label>
                  </div>
                </>
              )}
              <button className="primary-button workflow-submit" disabled={!digitalReady} onClick={() => void applyDigital()}><SevenIcon name="certificate" /> {certify ? "Certificar PDF" : "Assinar digitalmente"}</button>
            </>
          )}

          {tab === "validate" && (
            <>
              <div className="validation-options">
                <button className="secondary-light-button choose-wide" onClick={() => void chooseTrust()}><SevenIcon name="folder" /> {trustDirectory || "Pasta opcional de raízes confiáveis PEM"}</button>
                <label className="toggle-row"><input type="checkbox" checked={allowOnline} onChange={(event) => setAllowOnline(event.target.checked)} /><span><strong>Validação online de revogação</strong><small>Permite consultas de cadeia/revogação quando suportadas.</small></span></label>
                <button className="primary-button" onClick={() => onValidate(trustDirectory || undefined, allowOnline)}><SevenIcon name="shield" /> Validar assinaturas</button>
              </div>

              {loading && <div className="report-loading"><span className="loader-ring" /> Verificando ByteRange, CMS, certificados e revisões…</div>}
              {!loading && validation && (
                <>
                  <div className={validation.invalidCount === 0 && validation.validCount > 0 ? "signature-summary valid" : "signature-summary"}>
                    <strong>{validation.validCount}</strong><span>válida(s)</span><strong>{validation.invalidCount}</strong><span>inválida(s) / indeterminada(s)</span>
                    <small>{validation.summary}</small>
                  </div>
                  <div className="signature-results">
                    {validation.signatures.map((item, index) => (
                      <article className="signature-result" key={`${item.fieldName}-${index}`}>
                        <header><div><SevenIcon name="certificate" /><strong>{item.fieldName}</strong></div><span className={item.integrityOk && item.digestMatches ? "signature-badge ok" : "signature-badge bad"}>{item.status}</span></header>
                        <div className="signature-detail-grid">
                          <span><b>Signatário</b>{item.signerName || "—"}</span>
                          <span><b>PAdES</b>{item.padesLevel}</span>
                          <span><b>Integridade</b>{item.integrityOk ? "OK" : "Falhou"}</span>
                          <span><b>Digest</b>{item.digestMatches ? "Confere" : "Divergente"}</span>
                          <span><b>Cadeia confiável</b>{item.chainTrusted ? "Sim" : "Não / não configurada"}</span>
                          <span><b>Documento completo</b>{item.coversWholeDocument ? "Sim" : "Não"}</span>
                          <span><b>Alterado depois</b>{item.modificationsAfterSigning ? "Sim" : "Não"}</span>
                          <span><b>Timestamp</b>{item.timestampTime || item.cmsSigningTime || item.signingTime || "—"}</span>
                        </div>
                        <p>{item.summary}</p>
                        {item.integrityIssues.length > 0 && <div className="integrity-issues">{item.integrityIssues.map((issue) => <span key={issue}>{issue}</span>)}</div>}
                      </article>
                    ))}
                    {validation.signatures.length === 0 && <div className="empty-panel">Nenhuma assinatura digital encontrada.</div>}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
