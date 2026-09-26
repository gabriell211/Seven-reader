import type { ConversionOptions, ConversionPreset } from "../types";

export const CONVERSION_PRESETS_KEY = "seven-reader:conversion-presets:v1";

const baseOptions: ConversionOptions = {
  postProcess: false,
  compatibility: "1.7",
  colorDpi: 150,
  grayscaleDpi: 150,
  monochromeDpi: 300,
  downsample: "bicubic",
  colorCompression: "jpeg",
  grayscaleCompression: "jpeg",
  jpegQuality: 82,
  embedFonts: true,
  subsetFonts: true,
  colorStrategy: "preserve",
  renderingIntent: "relative",
  preserveOverprint: true,
  preserveMetadata: true,
  pdfStandard: "pdf",
};

export const BUILT_IN_CONVERSION_PRESETS: ConversionPreset[] = [
  {
    id: "standard",
    name: "Padrão",
    builtIn: true,
    options: { ...baseOptions, postProcess: false },
  },
  {
    id: "compact",
    name: "Compacto",
    builtIn: true,
    options: {
      ...baseOptions,
      postProcess: true,
      colorDpi: 144,
      grayscaleDpi: 144,
      monochromeDpi: 300,
      jpegQuality: 70,
      preserveOverprint: false,
    },
  },
  {
    id: "print",
    name: "Impressão",
    builtIn: true,
    options: {
      ...baseOptions,
      postProcess: true,
      colorDpi: 300,
      grayscaleDpi: 300,
      monochromeDpi: 600,
      jpegQuality: 92,
      preserveOverprint: true,
    },
  },
];

export function defaultConversionOptions(): ConversionOptions {
  return { ...baseOptions };
}

export function normalizeConversionOptions(value: Partial<ConversionOptions> | undefined): ConversionOptions {
  const options = { ...baseOptions, ...(value ?? {}) };
  return {
    ...options,
    colorDpi: Math.max(36, Math.min(2400, Number(options.colorDpi) || baseOptions.colorDpi)),
    grayscaleDpi: Math.max(36, Math.min(2400, Number(options.grayscaleDpi) || baseOptions.grayscaleDpi)),
    monochromeDpi: Math.max(36, Math.min(2400, Number(options.monochromeDpi) || baseOptions.monochromeDpi)),
    jpegQuality: Math.max(1, Math.min(100, Number(options.jpegQuality) || baseOptions.jpegQuality)),
    rgbProfile: options.rgbProfile?.trim() || undefined,
    cmykProfile: options.cmykProfile?.trim() || undefined,
    grayProfile: options.grayProfile?.trim() || undefined,
    outputProfile: options.outputProfile?.trim() || undefined,
  };
}

export function normalizeConversionPreset(value: ConversionPreset): ConversionPreset {
  return {
    id: value.id.trim(),
    name: value.name.trim(),
    builtIn: Boolean(value.builtIn),
    options: normalizeConversionOptions(value.options),
  };
}

export function loadCustomConversionPresets(): ConversionPreset[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(CONVERSION_PRESETS_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((value): value is ConversionPreset =>
        Boolean(value && typeof value === "object" && typeof value.id === "string" && typeof value.name === "string" && value.options),
      )
      .map(normalizeConversionPreset)
      .filter((preset) => preset.id && preset.name)
      .map((preset) => ({ ...preset, builtIn: false }));
  } catch {
    return [];
  }
}

export function saveCustomConversionPresets(presets: ConversionPreset[]): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(
    CONVERSION_PRESETS_KEY,
    JSON.stringify(presets.map((preset) => ({ ...normalizeConversionPreset(preset), builtIn: false }))),
  );
}

export function newConversionPresetId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `preset-${crypto.randomUUID()}`;
  }
  return `preset-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function applyPdfStandardRules(options: ConversionOptions): ConversionOptions {
  if (options.pdfStandard === "pdf") return options;

  if (options.pdfStandard === "pdfa-1b") {
    return {
      ...options,
      postProcess: true,
      compatibility: "1.4",
      colorStrategy: options.colorStrategy === "preserve" ? "rgb" : options.colorStrategy,
      preserveMetadata: true,
      embedFonts: true,
    };
  }

  if (options.pdfStandard === "pdfa-2b" || options.pdfStandard === "pdfa-3b") {
    return {
      ...options,
      postProcess: true,
      compatibility: "1.7",
      colorStrategy: options.colorStrategy === "preserve" ? "rgb" : options.colorStrategy,
      preserveMetadata: true,
      embedFonts: true,
    };
  }

  return {
    ...options,
    postProcess: true,
    compatibility: "1.3",
    colorStrategy: options.colorStrategy === "cmyk" || options.colorStrategy === "gray" ? options.colorStrategy : "cmyk",
    preserveMetadata: true,
    preserveOverprint: true,
    embedFonts: true,
  };
}
