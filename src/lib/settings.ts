export type AppearanceMode = "system" | "light" | "dark";
export type QuickToolId =
  | "select" | "hand" | "comment" | "highlight" | "underline" | "strikeout"
  | "draw" | "text" | "fill" | "sign" | "eraser";
export type SidePanelId =
  | "thumbs" | "search" | "bookmarks" | "comments" | "attachments" | "layers"
  | "signatures" | "fields" | "tasks";

export interface SevenSettings {
  appearance: AppearanceMode;
  protectedView: boolean;
  warnExternalUrls: boolean;
  blockLaunchActions: boolean;
  trustedLocations: string[];
  trustedHosts: string[];
  defaultZoom: number;
  reopenLastDocument: boolean;
  ocrLanguage: string;
  ocrOutputType: "auto" | "pdf" | "pdfa";
  conversionDpi: number;
  signatureValidationOnline: boolean;
  quickTools: QuickToolId[];
  quickToolsPosition: { x: number; y: number } | null;
  sidePanels: SidePanelId[];
  highContrast: boolean;
  reducedMotion: boolean;
  reflowFontSize: number;
  readAloudRate: number;
  readAloudPitch: number;
}

const KEY = "seven-reader:settings:v1";

export const defaultSettings: SevenSettings = {
  appearance: "system",
  protectedView: true,
  warnExternalUrls: true,
  blockLaunchActions: true,
  trustedLocations: [],
  trustedHosts: [],
  defaultZoom: 100,
  reopenLastDocument: false,
  ocrLanguage: "por+eng",
  ocrOutputType: "auto",
  conversionDpi: 150,
  signatureValidationOnline: false,
  quickTools: ["select", "hand", "comment", "highlight", "underline", "strikeout", "draw", "text", "fill", "sign", "eraser"],
  quickToolsPosition: null,
  sidePanels: ["thumbs", "search", "bookmarks", "comments", "attachments", "layers", "signatures", "fields", "tasks"],
  highContrast: false,
  reducedMotion: false,
  reflowFontSize: 18,
  readAloudRate: 1,
  readAloudPitch: 1,
};

export function loadSettings(): SevenSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<SevenSettings>;
    return {
      ...defaultSettings,
      ...parsed,
      trustedLocations: Array.isArray(parsed.trustedLocations) ? parsed.trustedLocations : [],
      trustedHosts: Array.isArray(parsed.trustedHosts) ? parsed.trustedHosts : [],
      quickTools: Array.isArray(parsed.quickTools) ? parsed.quickTools as QuickToolId[] : defaultSettings.quickTools,
      quickToolsPosition:
        parsed.quickToolsPosition && typeof parsed.quickToolsPosition === "object"
          ? parsed.quickToolsPosition
          : null,
      sidePanels: Array.isArray(parsed.sidePanels) ? parsed.sidePanels as SidePanelId[] : defaultSettings.sidePanels,
    };
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(settings: SevenSettings): void {
  localStorage.setItem(KEY, JSON.stringify(settings));
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "").toLocaleLowerCase();
}

export function isTrustedPath(path: string, trustedLocations: string[]): boolean {
  const target = normalizePath(path);
  return trustedLocations.some((entry) => {
    const root = normalizePath(entry);
    return target === root || target.startsWith(root + "/");
  });
}

export function applyAppearance(mode: AppearanceMode): void {
  document.documentElement.dataset.theme = mode;
}

export function applyAccessibilityPreferences(settings: SevenSettings): void {
  document.documentElement.dataset.contrast = settings.highContrast ? "high" : "normal";
  document.documentElement.dataset.motion = settings.reducedMotion ? "reduced" : "normal";
  document.documentElement.style.setProperty("--reflow-font-size", `${Math.max(12, Math.min(40, settings.reflowFontSize))}px`);
}
