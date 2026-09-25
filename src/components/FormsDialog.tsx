import { useEffect, useMemo, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { DuplicateFieldRequest, FormFieldInfo, FormFieldUpdate, FormValue, NewFormField, NewFormFieldType } from "../types";
import { SevenIcon } from "./SevenIcon";

interface FormsDialogProps {
  pageIndex: number;
  fields: FormFieldInfo[];
  loading: boolean;
  onClose: () => void;
  onReload: () => void;
  onFill: (values: FormValue[]) => void;
  onCreate: (field: NewFormField) => void;
  onUpdate: (update: FormFieldUpdate) => void;
  onDelete: (objectId: string) => void;
  onExportData: (destination: string) => void;
  onImportData: (path: string) => void;
  onReset: (useDefaults: boolean) => void;
  onDuplicate: (request: DuplicateFieldRequest) => void;
  onSetTabOrder: (order: "row" | "column" | "structure") => void;
}

const fieldTypes: Array<{ id: NewFormFieldType; label: string }> = [
  { id: "text", label: "Texto" },
  { id: "checkbox", label: "Checkbox" },
  { id: "radio", label: "Rádio" },
  { id: "dropdown", label: "Dropdown" },
  { id: "list", label: "Lista" },
  { id: "button", label: "Botão" },
  { id: "signature", label: "Assinatura" },
];

export function FormsDialog({ pageIndex, fields, loading, onClose, onReload, onFill, onCreate, onUpdate, onDelete, onExportData, onImportData, onReset, onDuplicate, onSetTabOrder }: FormsDialogProps) {
  const [tab, setTab] = useState<"fill" | "create" | "edit" | "data">("fill");
  const [values, setValues] = useState<Record<string, string>>({});
  const [name, setName] = useState("campo_1");
  const [fieldType, setFieldType] = useState<NewFormFieldType>("text");
  const [x, setX] = useState(48);
  const [y, setY] = useState(48);
  const [width, setWidth] = useState(180);
  const [height, setHeight] = useState(28);
  const [required, setRequired] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [multiline, setMultiline] = useState(false);
  const [maxLength, setMaxLength] = useState<number | "">("");
  const [tooltip, setTooltip] = useState("");
  const [defaultValue, setDefaultValue] = useState("");
  const [optionsText, setOptionsText] = useState("");
  const [editingId, setEditingId] = useState("");
  const [duplicatePageStart, setDuplicatePageStart] = useState(pageIndex + 1);
  const [duplicatePageEnd, setDuplicatePageEnd] = useState(pageIndex + 1);
  const [duplicateRows, setDuplicateRows] = useState(1);
  const [duplicateColumns, setDuplicateColumns] = useState(1);
  const [duplicateGapX, setDuplicateGapX] = useState(8);
  const [duplicateGapY, setDuplicateGapY] = useState(8);
  const [duplicateOffsetX, setDuplicateOffsetX] = useState(12);
  const [duplicateOffsetY, setDuplicateOffsetY] = useState(0);

  useEffect(() => { onReload(); }, [onReload]);
  useEffect(() => {
    setValues(Object.fromEntries(fields.map((field) => [field.name, field.value])));
  }, [fields]);

  const fillValues = useMemo<FormValue[]>(
    () => fields.map((field) => ({ name: field.name, value: values[field.name] ?? "" })),
    [fields, values],
  );

  const submitFill = () => {
    onFill(fillValues);
  };

  const submitCreate = () => {
    onCreate({
      name,
      fieldType,
      pageIndex,
      x,
      y,
      width,
      height,
      required,
      readOnly,
      multiline,
      maxLength: maxLength === "" ? undefined : maxLength,
      tooltip,
      defaultValue,
      options: optionsText.split("\n").map((value) => value.trim()).filter(Boolean),
    });
  };

  const exportData = async (format: "fdf" | "xfdf") => {
    const destination = await save({
      title: `Exportar dados de formulário ${format.toUpperCase()}`,
      defaultPath: `dados-formulario.${format}`,
      filters: [{ name: format.toUpperCase(), extensions: [format] }],
    });
    if (destination) onExportData(destination);
  };

  const importData = async () => {
    const selected = await open({
      title: "Importar dados de formulário",
      multiple: false,
      directory: false,
      filters: [
        { name: "Dados de formulário", extensions: ["fdf", "xfdf"] },
      ],
    });
    if (typeof selected === "string") onImportData(selected);
  };

  const loadFieldForEdit = (field: FormFieldInfo) => {
    setEditingId(field.objectId);
    setName(field.name);
    setTooltip(field.tooltip);
    setDefaultValue(field.defaultValue);
    setRequired(field.required);
    setReadOnly(field.readOnly);
    setMultiline(field.multiline);
    setMaxLength(field.maxLength ?? "");
    setOptionsText(field.options.join("\n"));
    if (field.rect) {
      const [x1, y1, x2, y2] = field.rect;
      setX(x1);
      setY(y1);
      setWidth(Math.max(1, x2 - x1));
      setHeight(Math.max(1, y2 - y1));
    }
    setTab("edit");
  };

  const submitDuplicate = () => {
    if (!editingId) return;
    onDuplicate({
      objectId: editingId,
      pageStart: Math.max(0, duplicatePageStart - 1),
      pageEnd: Math.max(0, duplicatePageEnd - 1),
      rows: duplicateRows,
      columns: duplicateColumns,
      gapX: duplicateGapX,
      gapY: duplicateGapY,
      offsetX: duplicateOffsetX,
      offsetY: duplicateOffsetY,
    });
  };

  const submitUpdate = () => {
    if (!editingId) return;
    onUpdate({
      objectId: editingId,
      name,
      tooltip,
      defaultValue,
      required,
      readOnly,
      multiline,
      maxLength: maxLength === "" ? undefined : maxLength,
      x,
      y,
      width,
      height,
      options: optionsText.split("\n").map((value) => value.trim()).filter(Boolean),
    });
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="workflow-dialog forms-dialog" role="dialog" aria-modal="true">
        <header className="organizer-head"><div><span className="eyebrow">ACROFORM</span><h2>Formulários PDF</h2><p>Preencha e prepare campos na sessão atual; use Salvar quando quiser gravar no arquivo original.</p></div><button className="icon-button" onClick={onClose}><SevenIcon name="close" /></button></header>
        <div className="workflow-tabs">
          <button className={tab === "fill" ? "active" : ""} onClick={() => setTab("fill")}>Preencher ({fields.length})</button>
          <button className={tab === "create" ? "active" : ""} onClick={() => setTab("create")}>Criar campo</button>
          <button className={tab === "edit" ? "active" : ""} onClick={() => setTab("edit")}>Editar campos</button>
          <button className={tab === "data" ? "active" : ""} onClick={() => setTab("data")}>Dados</button>
        </div>
        <div className="workflow-body">
          {tab === "fill" ? (
            <>
              {loading && <div className="report-loading"><span className="loader-ring" /> Lendo campos…</div>}
              {!loading && fields.length === 0 && <div className="empty-panel">Este PDF ainda não possui campos AcroForm. Use “Criar campo”.</div>}
              {!loading && fields.length > 0 && (
                <div className="form-field-list">
                  {fields.map((field) => (
                    <label className="workflow-field form-value-row" key={field.objectId}>
                      <span>{field.name}{field.required ? " *" : ""}<small>{field.fieldType}</small></span>
                      <div className="form-value-actions">
                        <input value={values[field.name] ?? ""} readOnly={field.readOnly} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))} />
                        <button className="secondary-light-button" onClick={() => loadFieldForEdit(field)}>Editar</button>
                      </div>
                    </label>
                  ))}
                </div>
              )}
              <button className="primary-button workflow-submit" disabled={!fields.length} onClick={submitFill}><SevenIcon name="form" /> Aplicar preenchimento</button>
            </>
          ) : tab === "create" ? (
            <>
              <div className="format-grid form-type-grid">{fieldTypes.map((type) => (
                <button key={type.id} className={fieldType === type.id ? "format-card active" : "format-card"} onClick={() => setFieldType(type.id)}><SevenIcon name={type.id === "signature" ? "sign" : "form"} /><strong>{type.label}</strong></button>
              ))}</div>
              <label className="workflow-field"><span>Nome único do campo</span><input value={name} onChange={(event) => setName(event.target.value)} /></label>
              <div className="two-column-fields">
                <label className="workflow-field"><span>Tooltip / descrição</span><input value={tooltip} onChange={(event) => setTooltip(event.target.value)} /></label>
                <label className="workflow-field"><span>Valor padrão</span><input value={defaultValue} onChange={(event) => setDefaultValue(event.target.value)} /></label>
              </div>
              {(fieldType === "dropdown" || fieldType === "list") && <label className="workflow-field"><span>Opções, uma por linha</span><textarea rows={4} value={optionsText} onChange={(event) => setOptionsText(event.target.value)} /></label>}
              <div className="rect-grid">
                <label className="workflow-field"><span>X</span><input type="number" value={x} onChange={(event) => setX(Number(event.target.value))} /></label>
                <label className="workflow-field"><span>Y</span><input type="number" value={y} onChange={(event) => setY(Number(event.target.value))} /></label>
                <label className="workflow-field"><span>Largura</span><input type="number" min={1} value={width} onChange={(event) => setWidth(Number(event.target.value))} /></label>
                <label className="workflow-field"><span>Altura</span><input type="number" min={1} value={height} onChange={(event) => setHeight(Number(event.target.value))} /></label>
              </div>
              <div className="three-column-fields">
                <label className="toggle-row"><input type="checkbox" checked={required} onChange={(event) => setRequired(event.target.checked)} /><span><strong>Obrigatório</strong><small>Bit Required em /Ff.</small></span></label>
                <label className="toggle-row"><input type="checkbox" checked={readOnly} onChange={(event) => setReadOnly(event.target.checked)} /><span><strong>Somente leitura</strong><small>Impede edição pelo leitor.</small></span></label>
                <label className="toggle-row"><input type="checkbox" checked={multiline} disabled={fieldType !== "text"} onChange={(event) => setMultiline(event.target.checked)} /><span><strong>Multilinha</strong><small>Somente campos de texto.</small></span></label>
              </div>
              {fieldType === "text" && <label className="workflow-field"><span>Máximo de caracteres</span><input type="number" min={1} max={1000000} value={maxLength} onChange={(event) => setMaxLength(event.target.value ? Math.max(1, Number(event.target.value)) : "")} placeholder="Sem limite" /></label>}
              <button className="primary-button workflow-submit" disabled={!name.trim() || width <= 0 || height <= 0} onClick={submitCreate}><SevenIcon name="form" /> Criar campo na página {pageIndex + 1}</button>
            </>
          ) : tab === "edit" ? (
            <>
              {loading && <div className="report-loading"><span className="loader-ring" /> Lendo campos…</div>}
              {!loading && fields.length === 0 && <div className="empty-panel">Nenhum campo para editar.</div>}
              {!loading && !editingId && fields.length > 0 && (
                <div className="form-edit-list">
                  {fields.map((field) => (
                    <button key={field.objectId} onClick={() => loadFieldForEdit(field)}>
                      <div><strong>{field.name}</strong><small>{field.fieldType}{field.pageIndex !== undefined ? ` · página ${field.pageIndex + 1}` : ""}</small></div>
                      <SevenIcon name="chevronRight" />
                    </button>
                  ))}
                </div>
              )}
              {editingId && (
                <>
                  <div className="form-edit-heading">
                    <div><strong>Editando {name}</strong><small>{editingId}</small></div>
                    <button className="secondary-light-button" onClick={() => setEditingId("")}>Escolher outro</button>
                  </div>
                  <div className="two-column-fields">
                    <label className="workflow-field"><span>Nome</span><input value={name} onChange={(event) => setName(event.target.value)} /></label>
                    <label className="workflow-field"><span>Tooltip</span><input value={tooltip} onChange={(event) => setTooltip(event.target.value)} /></label>
                  </div>
                  <label className="workflow-field"><span>Valor padrão</span><input value={defaultValue} onChange={(event) => setDefaultValue(event.target.value)} /></label>
                  <div className="rect-grid">
                    <label className="workflow-field"><span>X</span><input type="number" value={x} onChange={(event) => setX(Number(event.target.value))} /></label>
                    <label className="workflow-field"><span>Y</span><input type="number" value={y} onChange={(event) => setY(Number(event.target.value))} /></label>
                    <label className="workflow-field"><span>Largura</span><input type="number" min={1} value={width} onChange={(event) => setWidth(Number(event.target.value))} /></label>
                    <label className="workflow-field"><span>Altura</span><input type="number" min={1} value={height} onChange={(event) => setHeight(Number(event.target.value))} /></label>
                  </div>
                  <div className="three-column-fields">
                    <label className="toggle-row"><input type="checkbox" checked={required} onChange={(event) => setRequired(event.target.checked)} /><span><strong>Obrigatório</strong></span></label>
                    <label className="toggle-row"><input type="checkbox" checked={readOnly} onChange={(event) => setReadOnly(event.target.checked)} /><span><strong>Somente leitura</strong></span></label>
                    <label className="toggle-row"><input type="checkbox" checked={multiline} onChange={(event) => setMultiline(event.target.checked)} /><span><strong>Multilinha</strong></span></label>
                  </div>
                  <label className="workflow-field"><span>Máximo de caracteres</span><input type="number" min={1} max={1000000} value={maxLength} onChange={(event) => setMaxLength(event.target.value ? Math.max(1, Number(event.target.value)) : "")} placeholder="Sem limite" /></label>
                  <label className="workflow-field"><span>Opções (choice), uma por linha</span><textarea rows={4} value={optionsText} onChange={(event) => setOptionsText(event.target.value)} /></label>
                  <section className="form-duplicate-box">
                    <div className="section-mini-title">Duplicar campo</div>
                    <div className="two-column-fields">
                      <label className="workflow-field"><span>Da página</span><input type="number" min={1} value={duplicatePageStart} onChange={(event) => setDuplicatePageStart(Math.max(1, Number(event.target.value) || 1))} /></label>
                      <label className="workflow-field"><span>Até a página</span><input type="number" min={1} value={duplicatePageEnd} onChange={(event) => setDuplicatePageEnd(Math.max(1, Number(event.target.value) || 1))} /></label>
                    </div>
                    <div className="two-column-fields">
                      <label className="workflow-field"><span>Linhas</span><input type="number" min={1} max={100} value={duplicateRows} onChange={(event) => setDuplicateRows(Math.max(1, Math.min(100, Number(event.target.value) || 1)))} /></label>
                      <label className="workflow-field"><span>Colunas</span><input type="number" min={1} max={100} value={duplicateColumns} onChange={(event) => setDuplicateColumns(Math.max(1, Math.min(100, Number(event.target.value) || 1)))} /></label>
                    </div>
                    <div className="four-column-fields">
                      <label className="workflow-field"><span>Gap X</span><input type="number" value={duplicateGapX} onChange={(event) => setDuplicateGapX(Number(event.target.value))} /></label>
                      <label className="workflow-field"><span>Gap Y</span><input type="number" value={duplicateGapY} onChange={(event) => setDuplicateGapY(Number(event.target.value))} /></label>
                      <label className="workflow-field"><span>Offset X</span><input type="number" value={duplicateOffsetX} onChange={(event) => setDuplicateOffsetX(Number(event.target.value))} /></label>
                      <label className="workflow-field"><span>Offset Y</span><input type="number" value={duplicateOffsetY} onChange={(event) => setDuplicateOffsetY(Number(event.target.value))} /></label>
                    </div>
                    <button className="secondary-light-button choose-wide" onClick={submitDuplicate}><SevenIcon name="create" /> Criar cópias</button>
                  </section>

                  <section className="form-tab-order-box">
                    <div><strong>Ordem de tabulação da página {pageIndex + 1}</strong><small>Grava a chave /Tabs da página.</small></div>
                    <div className="segmented">
                      <button onClick={() => onSetTabOrder("row")}>Por linha</button>
                      <button onClick={() => onSetTabOrder("column")}>Por coluna</button>
                      <button onClick={() => onSetTabOrder("structure")}>Estrutura</button>
                    </div>
                  </section>

                  <div className="form-edit-actions">
                    <button className="danger-quiet" onClick={() => { onDelete(editingId); setEditingId(""); }}>Remover campo</button>
                    <button className="primary-button" disabled={!name.trim() || width <= 0 || height <= 0} onClick={submitUpdate}><SevenIcon name="save" /> Aplicar propriedades</button>
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <div className="form-data-grid">
                <button onClick={() => void importData()}>
                  <span><SevenIcon name="open" /></span>
                  <div><strong>Importar FDF/XFDF</strong><small>Aplica valores aos campos encontrados e cria uma revisão desfazível.</small></div>
                </button>
                <button onClick={() => void exportData("xfdf")} disabled={!fields.length}>
                  <span><SevenIcon name="save" /></span>
                  <div><strong>Exportar XFDF</strong><small>Formato XML interoperável para dados de formulário.</small></div>
                </button>
                <button onClick={() => void exportData("fdf")} disabled={!fields.length}>
                  <span><SevenIcon name="save" /></span>
                  <div><strong>Exportar FDF</strong><small>Formato clássico de troca de dados AcroForm.</small></div>
                </button>
                <button onClick={() => onReset(true)} disabled={!fields.length}>
                  <span><SevenIcon name="history" /></span>
                  <div><strong>Restaurar valores padrão</strong><small>Usa /DV quando o campo possui valor padrão.</small></div>
                </button>
                <button className="danger-card" onClick={() => onReset(false)} disabled={!fields.length}>
                  <span><SevenIcon name="close" /></span>
                  <div><strong>Limpar formulário</strong><small>Remove os valores atuais sem excluir os campos.</small></div>
                </button>
              </div>
              <div className="organizer-note">
                <SevenIcon name="shield" />
                <span>Importação de dados não executa JavaScript, SubmitForm ou outras ações embutidas. Somente os valores dos campos são alterados.</span>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
