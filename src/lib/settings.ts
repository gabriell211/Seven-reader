export type AppearanceMode = "system" | "light" | "dark";

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
};

export function loadSettings(): SevenSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<SevenSettings>;
    return {
      ...defaultSettings,
      ...parsed,
      trustedLocations: Array.isArray(parsed.trustedLocations) ? parsed.trustedLocations : [],
      trustedHosts: Array.isArray(parsed.trustedHosts) ? parsed.trustedHosts : [],
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
