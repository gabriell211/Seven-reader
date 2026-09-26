import { useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import type { PdfEncryptionOptions, SanitizeOptions } from "../types";
import { SevenIcon } from "./SevenIcon";

interface SecurityDialogProps {
  mode: "protect" | "sanitize";
  currentPdf: string;
  onClose: () => void;
  onEncrypt: (output: string, userPassword: string, ownerPassword: string, options: PdfEncryptionOptions) => void;
  onDecrypt: (output: string, password: string) => void;
  onSanitize: (output: string, options: SanitizeOptions) => void;
}

export function SecurityDialog({ mode, currentPdf, onClose, onEncrypt, onDecrypt, onSanitize }: SecurityDialogProps) {
  const [protectMode, setProtectMode] = useState<"encrypt" | "decrypt">("encrypt");
  const [userPassword, setUserPassword] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [encryptionOptions, setEncryptionOptions] = useState<PdfEncryptionOptions>({
    print: "full",
    allowExtract: true,
    allowModify: true,
    allowAnnotations: true,
    allowForms: true,
    allowAssembly: true,
  });
  const [options, setOptions] = useState<SanitizeOptions>({
    removeJavascript: true,
    removeOpenActions: true,
    removeEmbeddedFiles: false,
    removeMetadata: false,
    removeXfa: false,
    removeAnnotations: false,
    removeForms: false,
    removeMultimedia: false,
    cleanupStructure: false,
  });

  const chooseOutput = async (suffix: string) => save({
    title: "Salvar resultado",
    defaultPath: currentPdf.replace(/\.pdf$/i, `-${suffix}.pdf`),
    filters: [{ name: "Documento PDF", extensions: ["pdf"] }],
  });

  const submitProtection = async () => {
    const output = await chooseOutput(protectMode === "encrypt" ? "protegido" : "descriptografado");
    if (!output) return;
    if (protectMode === "encrypt") {
      onEncrypt(output, userPassword, ownerPassword || userPassword, encryptionOptions);
    } else {
      onDecrypt(output, userPassword);
    }
  };

  const submitSanitize = async () => {
    const output = await chooseOutput("sanitizado");
    if (output) onSanitize(output, options);
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="workflow-dialog security-dialog" role="dialog" aria-modal="true">
        <header className="organizer-head">
          <div><span className="eyebrow">{mode === "protect" ? "SEGURANÇA" : "SANITIZAÇÃO"}</span><h2>{mode === "protect" ? "Proteger documento" : "Remover conteúdo oculto"}</h2><p>O original permanece intacto; a operação gera um novo PDF.</p></div>
          <button className="icon-button" onClick={onClose}><SevenIcon name="close" /></button>
        </header>
        <div className="workflow-body">
          {mode === "protect" ? (
            <>
              <div className="workflow-tabs inline">
                <button className={protectMode === "encrypt" ? "active" : ""} onClick={() => setProtectMode("encrypt")}>Criptografar AES‑256</button>
                <button className={protectMode === "decrypt" ? "active" : ""} onClick={() => setProtectMode("decrypt")}>Remover criptografia</button>
              </div>
              <label className="workflow-field"><span>{protectMode === "encrypt" ? "Senha para abrir" : "Senha atual"}</span><input type="password" value={userPassword} onChange={(event) => setUserPassword(event.target.value)} autoComplete="new-password" /></label>
              {protectMode === "encrypt" && <label className="workflow-field"><span>Senha de proprietário</span><input type="password" value={ownerPassword} onChange={(event) => setOwnerPassword(event.target.value)} autoComplete="new-password" /><small>Se ficar vazia, será usada a mesma senha de abertura.</small></label>}
              {protectMode === "encrypt" && (
                <section className="security-permissions">
                  <div className="section-mini-title">Permissões para quem abrir com a senha de usuário</div>
                  <label className="workflow-field">
                    <span>Impressão</span>
                    <select value={encryptionOptions.print} onChange={(event) => setEncryptionOptions((current) => ({ ...current, print: event.target.value as PdfEncryptionOptions["print"] }))}>
                      <option value="full">Impressão completa</option>
                      <option value="low">Somente baixa resolução</option>
                      <option value="none">Bloquear impressão</option>
                    </select>
                  </label>
                  <div className="two-column-fields">
                    <label className="toggle-row"><input type="checkbox" checked={encryptionOptions.allowExtract} onChange={(event) => setEncryptionOptions((current) => ({ ...current, allowExtract: event.target.checked }))} /><span><strong>Copiar / extrair</strong><small>Texto e gráficos.</small></span></label>
                    <label className="toggle-row"><input type="checkbox" checked={encryptionOptions.allowModify} onChange={(event) => setEncryptionOptions((current) => ({ ...current, allowModify: event.target.checked }))} /><span><strong>Editar documento</strong><small>Outras modificações de conteúdo.</small></span></label>
                    <label className="toggle-row"><input type="checkbox" checked={encryptionOptions.allowAnnotations} onChange={(event) => setEncryptionOptions((current) => ({ ...current, allowAnnotations: event.target.checked }))} /><span><strong>Comentários</strong><small>Anotações e comentários.</small></span></label>
                    <label className="toggle-row"><input type="checkbox" checked={encryptionOptions.allowForms} onChange={(event) => setEncryptionOptions((current) => ({ ...current, allowForms: event.target.checked }))} /><span><strong>Formulários</strong><small>Preencher campos e assinar.</small></span></label>
                    <label className="toggle-row"><input type="checkbox" checked={encryptionOptions.allowAssembly} onChange={(event) => setEncryptionOptions((current) => ({ ...current, allowAssembly: event.target.checked }))} /><span><strong>Organizar páginas</strong><small>Montagem/assembly do documento.</small></span></label>
                  </div>
                  {(
                    encryptionOptions.print !== "full"
                    || !encryptionOptions.allowExtract
                    || !encryptionOptions.allowModify
                    || !encryptionOptions.allowAnnotations
                    || !encryptionOptions.allowForms
                    || !encryptionOptions.allowAssembly
                  ) && (!ownerPassword || ownerPassword === userPassword) && (
                    <div className="organizer-note organizer-note--warning">
                      <SevenIcon name="shield" />
                      <span>Defina uma senha de proprietário diferente para aplicar restrições.</span>
                    </div>
                  )}
                </section>
              )}
              <div className="organizer-note"><SevenIcon name="shield" /><span>A senha é passada diretamente ao processo local qpdf e não é armazenada pelo Seven Reader.</span></div>
              <button
                className="primary-button workflow-submit"
                disabled={!userPassword || (protectMode === "encrypt" && (encryptionOptions.print !== "full" || !encryptionOptions.allowExtract || !encryptionOptions.allowModify || !encryptionOptions.allowAnnotations || !encryptionOptions.allowForms || !encryptionOptions.allowAssembly) && (!ownerPassword || ownerPassword === userPassword))}
                onClick={() => void submitProtection()}
              ><SevenIcon name="lock" /> Aplicar</button>
            </>
          ) : (
            <>
              <div className="check-list">
                {([
                  ["removeJavascript", "JavaScript embutido", "Remove entradas /JS e árvores JavaScript."],
                  ["removeOpenActions", "Ações automáticas e Launch", "Remove OpenAction, AA e ações Launch/JavaScript."],
                  ["removeEmbeddedFiles", "Anexos incorporados", "Remove referências EmbeddedFiles do catálogo."],
                  ["removeMetadata", "Metadados e XMP", "Remove Info, Metadata e PieceInfo."],
                  ["removeXfa", "XFA", "Remove o pacote XFA de formulários híbridos."],
                  ["removeAnnotations", "Comentários e anotações", "Remove anotações não-widget das páginas."],
                  ["removeForms", "Formulários AcroForm", "Remove widgets e o dicionário AcroForm."],
                  ["removeMultimedia", "Rich Media, 3D e multimídia", "Remove RichMedia, 3D, Movie, Sound, Screen e Renditions."],
                  ["cleanupStructure", "Clean Up estrutural", "Remove thumbnails, links quebrados e marcadores inválidos antes da regravação."],
                ] as const).map(([key, title, detail]) => (
                  <label className="check-row" key={key}>
                    <input type="checkbox" checked={options[key]} onChange={(event) => setOptions((current) => ({ ...current, [key]: event.target.checked }))} />
                    <span><strong>{title}</strong><small>{detail}</small></span>
                  </label>
                ))}
              </div>
              <div className="organizer-note"><SevenIcon name="shield" /><span>Sanitização remove referências estruturais selecionadas; nunca executa JavaScript, anexos ou ações do PDF.</span></div>
              <button className="primary-button workflow-submit" onClick={() => void submitSanitize()}><SevenIcon name="lock" /> Sanitizar cópia</button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
