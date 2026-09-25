import { useEffect, useMemo, useState } from "react";
import type { FormFieldInfo, FormValue, NewFormField, NewFormFieldType } from "../types";
import { SevenIcon } from "./SevenIcon";

interface FormsDialogProps {
  pageIndex: number;
  fields: FormFieldInfo[];
  loading: boolean;
  onClose: () => void;
  onReload: () => void;
  onFill: (values: FormValue[]) => void;
  onCreate: (field: NewFormField) => void;
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

export function FormsDialog({ pageIndex, fields, loading, onClose, onReload, onFill, onCreate }: FormsDialogProps) {
  const [tab, setTab] = useState<"fill" | "create">("fill");
  const [values, setValues] = useState<Record<string, string>>({});
  const [name, setName] = useState("campo_1");
  const [fieldType, setFieldType] = useState<NewFormFieldType>("text");
  const [x, setX] = useState(48);
  const [y, setY] = useState(48);
  const [width, setWidth] = useState(180);
  const [height, setHeight] = useState(28);
  const [required, setRequired] = useState(false);
  const [optionsText, setOptionsText] = useState("");

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
                      <input value={values[field.name] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))} />
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
              {(fieldType === "dropdown" || fieldType === "list") && <label className="workflow-field"><span>Opções, uma por linha</span><textarea rows={4} value={optionsText} onChange={(event) => setOptionsText(event.target.value)} /></label>}
              <div className="rect-grid">
                <label className="workflow-field"><span>X</span><input type="number" value={x} onChange={(event) => setX(Number(event.target.value))} /></label>
                <label className="workflow-field"><span>Y</span><input type="number" value={y} onChange={(event) => setY(Number(event.target.value))} /></label>
                <label className="workflow-field"><span>Largura</span><input type="number" min={1} value={width} onChange={(event) => setWidth(Number(event.target.value))} /></label>
                <label className="workflow-field"><span>Altura</span><input type="number" min={1} value={height} onChange={(event) => setHeight(Number(event.target.value))} /></label>
              </div>
              <label className="toggle-row"><input type="checkbox" checked={required} onChange={(event) => setRequired(event.target.checked)} /><span><strong>Campo obrigatório</strong><small>Define o bit Required em /Ff.</small></span></label>
              <button className="primary-button workflow-submit" disabled={!name.trim() || width <= 0 || height <= 0} onClick={submitCreate}><SevenIcon name="form" /> Criar campo na página {pageIndex + 1}</button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
