import { useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import type { SanitizeOptions } from "../types";
import { SevenIcon } from "./SevenIcon";

interface SecurityDialogProps {
  mode: "protect" | "sanitize";
  currentPdf: string;
  onClose: () => void;
  onEncrypt: (output: string, userPassword: string, ownerPassword: string) => void;
  onDecrypt: (output: string, password: string) => void;
  onSanitize: (output: string, options: SanitizeOptions) => void;
}

export function SecurityDialog({ mode, currentPdf, onClose, onEncrypt, onDecrypt, onSanitize }: SecurityDialogProps) {
  const [protectMode, setProtectMode] = useState<"encrypt" | "decrypt">("encrypt");
  const [userPassword, setUserPassword] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
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
      onEncrypt(output, userPassword, ownerPassword || userPassword);
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
              <div className="organizer-note"><SevenIcon name="shield" /><span>A senha é passada diretamente ao processo local qpdf e não é armazenada pelo Seven Reader.</span></div>
              <button className="primary-button workflow-submit" disabled={!userPassword} onClick={() => void submitProtection()}><SevenIcon name="lock" /> Aplicar</button>
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
