import { useEffect, useMemo, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { DuplicateFieldRequest, FieldActionInfo, FieldActionInput, FormFieldInfo, FormFieldUpdate, FormValue, NewFormField, NewFormFieldType } from "../types";
import { SevenIcon } from "./SevenIcon";

interface FormsDialogProps {
  pageIndex: number;
  fields: FormFieldInfo[];
  actions: FieldActionInfo[];
  loading: boolean;
  onClose: () => void;
  onReload: () => void;
  onReloadActions: () => void;
  onFill: (values: FormValue[]) => void;
  onCreate: (field: NewFormField) => void;
  onUpdate: (update: FormFieldUpdate) => void;
  onDelete: (objectId: string) => void;
  onExportData: (destination: string) => void;
  onImportData: (path: string) => void;
  onReset: (useDefaults: boolean) => void;
  onDuplicate: (request: DuplicateFieldRequest) => void;
  onSetTabOrder: (order: "row" | "column" | "structure") => void;
  onSetAction: (request: FieldActionInput) => void;
  onDeleteAction: (objectId: string, trigger: string) => void;
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

export function FormsDialog({ pageIndex, fields, actions, loading, onClose, onReload, onReloadActions, onFill, onCreate, onUpdate, onDelete, onExportData, onImportData, onReset, onDuplicate, onSetTabOrder, onSetAction, onDeleteAction }: FormsDialogProps) {
  const [tab, setTab] = useState<"fill" | "create" | "edit" | "data" | "actions">("fill");
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
  const [borderEnabled, setBorderEnabled] = useState(true);
  const [borderColor, setBorderColor] = useState("#6f6f78");
  const [fillEnabled, setFillEnabled] = useState(true);
  const [fillColor, setFillColor] = useState("#ffffff");
  const [borderWidth, setBorderWidth] = useState(1);
  const [borderStyle, setBorderStyle] = useState<"S" | "D" | "B" | "I" | "U">("S");
  const [fieldFontSize, setFieldFontSize] = useState(10);
  const [textColor, setTextColor] = useState("#000000");
  const [fieldRotation, setFieldRotation] = useState<0 | 90 | 180 | 270>(0);
  const [visibility, setVisibility] = useState<"visible" | "visible-no-print" | "hidden" | "hidden-printable">("visible");
  const [duplicatePageStart, setDuplicatePageStart] = useState(pageIndex + 1);
  const [duplicatePageEnd, setDuplicatePageEnd] = useState(pageIndex + 1);
  const [duplicateRows, setDuplicateRows] = useState(1);
  const [duplicateColumns, setDuplicateColumns] = useState(1);
  const [duplicateGapX, setDuplicateGapX] = useState(8);
  const [duplicateGapY, setDuplicateGapY] = useState(8);
  const [duplicateOffsetX, setDuplicateOffsetX] = useState(12);
  const [duplicateOffsetY, setDuplicateOffsetY] = useState(0);
  const [actionFieldId, setActionFieldId] = useState("");
  const [actionTrigger, setActionTrigger] = useState<FieldActionInput["trigger"]>("mouse-up");
  const [actionType, setActionType] = useState<FieldActionInput["actionType"]>("uri");
  const [actionTarget, setActionTarget] = useState("");
  const [actionTargetPage, setActionTargetPage] = useState(1);
  const [actionHide, setActionHide] = useState(true);

  useEffect(() => { onReload(); }, [onReload]);
  useEffect(() => {
    setValues(Object.fromEntries(fields.map((field) => [field.name, field.value])));
  }, [fields]);

  const fillValues = useMemo<FormValue[]>(
    () => fields.map((field) => ({ name: field.name, value: values[field.name] ?? "" })),
    [fields, values],
  );

  const hexToRgb = (hex: string): [number, number, number] => {
    const value = hex.replace("#", "").padEnd(6, "0").slice(0, 6);
    return [
      parseInt(value.slice(0, 2), 16) / 255,
      parseInt(value.slice(2, 4), 16) / 255,
      parseInt(value.slice(4, 6), 16) / 255,
    ];
  };

  const rgbToHex = (rgb?: [number, number, number]): string => {
    if (!rgb) return "#000000";
    return `#${rgb.map((component) =>
      Math.max(0, Math.min(255, Math.round(component * 255))).toString(16).padStart(2, "0")
    ).join("")}`;
  };

  const appearancePayload = () => ({
    borderColor: borderEnabled ? hexToRgb(borderColor) : undefined,
    fillColor: fillEnabled ? hexToRgb(fillColor) : undefined,
    borderWidth,
    borderStyle,
    fontSize: fieldFontSize,
    textColor: hexToRgb(textColor),
    rotation: fieldRotation,
    visibility,
  });

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
      ...appearancePayload(),
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
    setBorderEnabled(Boolean(field.borderColor));
    setBorderColor(rgbToHex(field.borderColor ?? [0.44, 0.44, 0.47]));
    setFillEnabled(Boolean(field.fillColor));
    setFillColor(rgbToHex(field.fillColor ?? [1, 1, 1]));
    setBorderWidth(field.borderWidth);
    setBorderStyle(field.borderStyle);
    setFieldFontSize(field.fontSize);
    setTextColor(rgbToHex(field.textColor));
    setFieldRotation(field.rotation);
    setVisibility(field.visibility);
    if (field.rect) {
      const [x1, y1, x2, y2] = field.rect;
      setX(x1);
      setY(y1);
      setWidth(Math.max(1, x2 - x1));
      setHeight(Math.max(1, y2 - y1));
    }
    setTab("edit");
  };

  const submitAction = () => {
    if (!actionFieldId) return;
    onSetAction({
      fieldObjectId: actionFieldId,
      trigger: actionTrigger,
      actionType,
      target: actionTarget,
      targetPage: actionType === "goto" ? Math.max(0, actionTargetPage - 1) : undefined,
      hide: actionHide,
    });
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
      ...appearancePayload(),
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
          <button className={tab === "actions" ? "active" : ""} onClick={() => { setTab("actions"); onReloadActions(); }}>Ações</button>
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
              <section className="field-appearance-box">
                <div className="section-mini-title">Aparência</div>
                <div className="two-column-fields">
                  <label className="toggle-row"><input type="checkbox" checked={borderEnabled} onChange={(event) => setBorderEnabled(event.target.checked)} /><span><strong>Borda</strong></span></label>
                  <label className="toggle-row"><input type="checkbox" checked={fillEnabled} onChange={(event) => setFillEnabled(event.target.checked)} /><span><strong>Preenchimento</strong></span></label>
                </div>
                <div className="four-column-fields">
                  <label className="workflow-field"><span>Cor da borda</span><input type="color" disabled={!borderEnabled} value={borderColor} onChange={(event) => setBorderColor(event.target.value)} /></label>
                  <label className="workflow-field"><span>Cor de fundo</span><input type="color" disabled={!fillEnabled} value={fillColor} onChange={(event) => setFillColor(event.target.value)} /></label>
                  <label className="workflow-field"><span>Espessura</span><input type="number" min={0} max={20} step={0.25} value={borderWidth} onChange={(event) => setBorderWidth(Math.max(0, Math.min(20, Number(event.target.value) || 0)))} /></label>
                  <label className="workflow-field"><span>Estilo</span><select value={borderStyle} onChange={(event) => setBorderStyle(event.target.value as typeof borderStyle)}><option value="S">Sólida</option><option value="D">Tracejada</option><option value="B">Beveled</option><option value="I">Inset</option><option value="U">Sublinhada</option></select></label>
                </div>
                <div className="four-column-fields">
                  <label className="workflow-field"><span>Fonte</span><input type="number" min={1} max={200} value={fieldFontSize} onChange={(event) => setFieldFontSize(Math.max(1, Math.min(200, Number(event.target.value) || 10)))} /></label>
                  <label className="workflow-field"><span>Cor do texto</span><input type="color" value={textColor} onChange={(event) => setTextColor(event.target.value)} /></label>
                  <label className="workflow-field"><span>Rotação</span><select value={fieldRotation} onChange={(event) => setFieldRotation(Number(event.target.value) as 0 | 90 | 180 | 270)}><option value={0}>0°</option><option value={90}>90°</option><option value={180}>180°</option><option value={270}>270°</option></select></label>
                  <label className="workflow-field"><span>Visibilidade</span><select value={visibility} onChange={(event) => setVisibility(event.target.value as typeof visibility)}><option value="visible">Visível e imprime</option><option value="visible-no-print">Visível, não imprime</option><option value="hidden">Oculto</option><option value="hidden-printable">Oculto, imprimível</option></select></label>
                </div>
              </section>
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
                  <section className="field-appearance-box">
                    <div className="section-mini-title">Aparência</div>
                    <div className="two-column-fields">
                      <label className="toggle-row"><input type="checkbox" checked={borderEnabled} onChange={(event) => setBorderEnabled(event.target.checked)} /><span><strong>Borda</strong></span></label>
                      <label className="toggle-row"><input type="checkbox" checked={fillEnabled} onChange={(event) => setFillEnabled(event.target.checked)} /><span><strong>Preenchimento</strong></span></label>
                    </div>
                    <div className="four-column-fields">
                      <label className="workflow-field"><span>Cor da borda</span><input type="color" disabled={!borderEnabled} value={borderColor} onChange={(event) => setBorderColor(event.target.value)} /></label>
                      <label className="workflow-field"><span>Cor de fundo</span><input type="color" disabled={!fillEnabled} value={fillColor} onChange={(event) => setFillColor(event.target.value)} /></label>
                      <label className="workflow-field"><span>Espessura</span><input type="number" min={0} max={20} step={0.25} value={borderWidth} onChange={(event) => setBorderWidth(Math.max(0, Math.min(20, Number(event.target.value) || 0)))} /></label>
                      <label className="workflow-field"><span>Estilo</span><select value={borderStyle} onChange={(event) => setBorderStyle(event.target.value as typeof borderStyle)}><option value="S">Sólida</option><option value="D">Tracejada</option><option value="B">Beveled</option><option value="I">Inset</option><option value="U">Sublinhada</option></select></label>
                    </div>
                    <div className="four-column-fields">
                      <label className="workflow-field"><span>Fonte</span><input type="number" min={1} max={200} value={fieldFontSize} onChange={(event) => setFieldFontSize(Math.max(1, Math.min(200, Number(event.target.value) || 10)))} /></label>
                      <label className="workflow-field"><span>Cor do texto</span><input type="color" value={textColor} onChange={(event) => setTextColor(event.target.value)} /></label>
                      <label className="workflow-field"><span>Rotação</span><select value={fieldRotation} onChange={(event) => setFieldRotation(Number(event.target.value) as 0 | 90 | 180 | 270)}><option value={0}>0°</option><option value={90}>90°</option><option value={180}>180°</option><option value={270}>270°</option></select></label>
                      <label className="workflow-field"><span>Visibilidade</span><select value={visibility} onChange={(event) => setVisibility(event.target.value as typeof visibility)}><option value="visible">Visível e imprime</option><option value="visible-no-print">Visível, não imprime</option><option value="hidden">Oculto</option><option value="hidden-printable">Oculto, imprimível</option></select></label>
                    </div>
                  </section>
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
          ) : tab === "data" ? (
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
          ) : (
            <>
              <div className="two-column-fields">
                <label className="workflow-field">
                  <span>Campo</span>
                  <select value={actionFieldId} onChange={(event) => setActionFieldId(event.target.value)}>
                    <option value="">Selecione…</option>
                    {fields.map((field) => <option key={field.objectId} value={field.objectId}>{field.name}</option>)}
                  </select>
                </label>
                <label className="workflow-field">
                  <span>Gatilho</span>
                  <select value={actionTrigger} onChange={(event) => setActionTrigger(event.target.value as FieldActionInput["trigger"])}>
                    <option value="mouse-up">Mouse Up</option>
                    <option value="mouse-down">Mouse Down</option>
                    <option value="mouse-enter">Mouse Enter</option>
                    <option value="mouse-exit">Mouse Exit</option>
                    <option value="focus">On Focus</option>
                    <option value="blur">On Blur</option>
                  </select>
                </label>
              </div>

              <label className="workflow-field">
                <span>Ação</span>
                <select value={actionType} onChange={(event) => setActionType(event.target.value as FieldActionInput["actionType"])}>
                  <option value="uri">Abrir link web</option>
                  <option value="goto">Ir para página</option>
                  <option value="reset">Resetar formulário</option>
                  <option value="hide">Mostrar/ocultar campo</option>
                  <option value="submit">Enviar formulário</option>
                  <option value="javascript">JavaScript (armazenar, execução bloqueada)</option>
                  <option value="launch">Abrir arquivo / Launch (armazenar, execução bloqueada)</option>
                </select>
              </label>

              {actionType === "goto" ? (
                <label className="workflow-field"><span>Página de destino</span><input type="number" min={1} value={actionTargetPage} onChange={(event) => setActionTargetPage(Math.max(1, Number(event.target.value) || 1))} /></label>
              ) : actionType === "reset" ? (
                <div className="organizer-note"><SevenIcon name="history" /><span>ResetForm restaurará os campos quando um leitor compatível executar a ação.</span></div>
              ) : (
                <label className="workflow-field">
                  <span>{actionType === "javascript" ? "Código JavaScript" : actionType === "hide" ? "Nome do campo alvo" : actionType === "launch" ? "Caminho/arquivo" : "Destino"}</span>
                  {actionType === "javascript"
                    ? <textarea rows={7} value={actionTarget} onChange={(event) => setActionTarget(event.target.value)} spellCheck={false} />
                    : <input value={actionTarget} onChange={(event) => setActionTarget(event.target.value)} placeholder={actionType === "uri" || actionType === "submit" ? "https://..." : ""} />}
                </label>
              )}

              {actionType === "hide" && (
                <label className="toggle-row"><input type="checkbox" checked={actionHide} onChange={(event) => setActionHide(event.target.checked)} /><span><strong>Ocultar</strong><small>Desmarque para mostrar o campo alvo.</small></span></label>
              )}

              {(actionType === "javascript" || actionType === "launch") && (
                <div className="organizer-note organizer-note--warning">
                  <SevenIcon name="lock" />
                  <span>O Seven preserva esta action dictionary para compatibilidade, mas não executa automaticamente conteúdo JavaScript ou Launch.</span>
                </div>
              )}

              <button className="primary-button workflow-submit" disabled={!actionFieldId || (actionType !== "goto" && actionType !== "reset" && !actionTarget.trim())} onClick={submitAction}>
                <SevenIcon name="automation" /> Gravar ação no campo
              </button>

              <div className="section-mini-title">Ações existentes ({actions.length})</div>
              {actions.length === 0 ? <div className="empty-panel">Nenhuma ação adicional de campo encontrada.</div> : (
                <div className="field-action-list">
                  {actions.map((action, index) => (
                    <article className={action.blocked ? "field-action-row blocked" : "field-action-row"} key={`${action.fieldObjectId}-${action.trigger}-${index}`}>
                      <span><SevenIcon name={action.blocked ? "lock" : "automation"} /></span>
                      <div>
                        <strong>{action.fieldName} · {action.trigger}</strong>
                        <small>{action.actionType}{action.target ? ` · ${action.target}` : ""}</small>
                      </div>
                      <button className="danger-quiet" onClick={() => onDeleteAction(action.fieldObjectId, action.trigger)}>Remover</button>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
