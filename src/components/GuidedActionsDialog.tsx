import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { SevenIcon } from "./SevenIcon";

export type GuidedActionKind = "ocr" | "optimize" | "convert";

export interface GuidedActionPreset {
  id: string;
  name: string;
  kind: GuidedActionKind;
}

interface GuidedActionsDialogProps {
  onClose: () => void;
  onRun: (kind: GuidedActionKind, inputs: string[], outputDirectory: string) => void;
}

const STORAGE_KEY = "seven-reader:guided-actions:v1";

const defaults: GuidedActionPreset[] = [
  { id: "ocr-batch", name: "OCR em vários PDFs", kind: "ocr" },
  { id: "optimize-batch", name: "Otimizar vários PDFs", kind: "optimize" },
  { id: "convert-batch", name: "Converter documentos para PDF", kind: "convert" },
];

function loadPresets(): GuidedActionPreset[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) && parsed.length ? parsed : defaults;
  } catch {
    return defaults;
  }
}

export function GuidedActionsDialog({ onClose, onRun }: GuidedActionsDialogProps) {
  const [presets, setPresets] = useState<GuidedActionPreset[]>(loadPresets);
  const [selected, setSelected] = useState(presets[0]?.id ?? "ocr-batch");
  const [inputs, setInputs] = useState<string[]>([]);
  const [outputDirectory, setOutputDirectory] = useState("");
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<GuidedActionKind>("ocr");

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  }, [presets]);

  const current = presets.find((preset) => preset.id === selected) ?? presets[0];

  const chooseInputs = async () => {
    if (!current) return;
    const isConvert = current.kind === "convert";
    const selectedFiles = await open({
      title: isConvert ? "Selecionar documentos" : "Selecionar PDFs",
      multiple: true,
      directory: false,
      filters: [{
        name: isConvert ? "Documentos" : "Documentos PDF",
        extensions: isConvert
          ? ["doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp", "rtf", "txt", "html", "htm"]
          : ["pdf"],
      }],
    });
    if (Array.isArray(selectedFiles)) setInputs(selectedFiles);
    else if (typeof selectedFiles === "string") setInputs([selectedFiles]);
  };

  const chooseOutput = async () => {
    const selectedFolder = await open({ title: "Selecionar pasta de saída", directory: true, multiple: false });
    if (typeof selectedFolder === "string") setOutputDirectory(selectedFolder);
  };

  const addPreset = () => {
    const name = newName.trim();
    if (!name) return;
    const preset: GuidedActionPreset = {
      id: `custom-${Date.now()}`,
      name,
      kind: newKind,
    };
    setPresets((currentPresets) => [...currentPresets, preset]);
    setSelected(preset.id);
    setNewName("");
  };

  const removePreset = (id: string) => {
    const next = presets.filter((preset) => preset.id !== id);
    const safe = next.length ? next : defaults;
    setPresets(safe);
    if (selected === id) setSelected(safe[0].id);
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="workflow-dialog guided-actions-dialog" role="dialog" aria-modal="true">
        <header className="organizer-head">
          <div>
            <span className="eyebrow">AÇÕES GUIADAS</span>
            <h2>Automatizar tarefas repetitivas</h2>
            <p>Presets locais executam operações reais em vários arquivos usando a fila de tarefas do Seven Reader.</p>
          </div>
          <button className="icon-button" onClick={onClose}><SevenIcon name="close" /></button>
        </header>

        <div className="workflow-body">
          <div className="guided-layout">
            <aside className="guided-presets">
              {presets.map((preset) => (
                <div className={selected === preset.id ? "guided-preset active" : "guided-preset"} key={preset.id}>
                  <button onClick={() => { setSelected(preset.id); setInputs([]); }}>
                    <SevenIcon name={preset.kind === "ocr" ? "ocr" : preset.kind === "optimize" ? "compress" : "convert"} />
                    <span><strong>{preset.name}</strong><small>{preset.kind}</small></span>
                  </button>
                  {preset.id.startsWith("custom-") && <button className="guided-delete" onClick={() => removePreset(preset.id)}><SevenIcon name="close" /></button>}
                </div>
              ))}
            </aside>

            <div className="guided-work">
              {current && (
                <>
                  <div className="guided-summary">
                    <SevenIcon name={current.kind === "ocr" ? "ocr" : current.kind === "optimize" ? "compress" : "convert"} />
                    <div><strong>{current.name}</strong><small>Processamento local · saída em nova pasta · original preservado.</small></div>
                  </div>

                  <button className="image-drop" onClick={() => void chooseInputs()}>
                    <SevenIcon name="open" />
                    <strong>{inputs.length ? `${inputs.length} arquivo(s) selecionado(s)` : "Selecionar arquivos"}</strong>
                    <small>{current.kind === "convert" ? "Office, OpenDocument, RTF, TXT e HTML." : "Somente PDFs."}</small>
                  </button>

                  <button className="secondary-light-button choose-wide" disabled={!inputs.length} onClick={() => void chooseOutput()}>
                    <SevenIcon name="folder" /> {outputDirectory || "Selecionar pasta de saída"}
                  </button>

                  <button className="primary-button workflow-submit" disabled={!inputs.length || !outputDirectory} onClick={() => onRun(current.kind, inputs, outputDirectory)}>
                    <SevenIcon name="automation" /> Executar ação
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="guided-create">
            <div><strong>Criar preset</strong><small>Presets personalizados reutilizam os motores reais já integrados.</small></div>
            <input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Nome do preset" />
            <select value={newKind} onChange={(event) => setNewKind(event.target.value as GuidedActionKind)}>
              <option value="ocr">OCR em lote</option>
              <option value="optimize">Otimização em lote</option>
              <option value="convert">Conversão em lote</option>
            </select>
            <button className="secondary-light-button" disabled={!newName.trim()} onClick={addPreset}><SevenIcon name="create" /> Adicionar</button>
          </div>
        </div>
      </section>
    </div>
  );
}
