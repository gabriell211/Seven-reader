import { useEffect, useMemo, useState } from "react";
import type { FormFieldInfo, FormFieldUpdate, FormValue, NewFormField, NewFormFieldType } from "../types";
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

export function FormsDialog({ pageIndex, fields, loading, onClose, onReload, onFill, onCreate, onUpdate, onDelete }: FormsDialogProps) {
  const [tab, setTab] = useState<"fill" | "create" | "edit">("fill");
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
          ) : (
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
          ) : (
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
                  <div className="form-edit-actions">
                    <button className="danger-quiet" onClick={() => { onDelete(editingId); setEditingId(""); }}>Remover campo</button>
                    <button className="primary-button" disabled={!name.trim() || width <= 0 || height <= 0} onClick={submitUpdate}><SevenIcon name="save" /> Aplicar propriedades</button>
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
