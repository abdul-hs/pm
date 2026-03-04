export type ThemePreferences = {
  gradientStart: string;
  gradientMid: string;
  gradientEnd: string;
};

export const defaultThemePreferences: ThemePreferences = {
  gradientStart: "#1c8fc5",
  gradientMid: "#209dd7",
  gradientEnd: "#2db6eb",
};

const hexColorPattern = /^#[0-9a-f]{6}$/i;

const normalizeThemeColor = (value: string, fallback: string): string => {
  const normalized = value.trim().toLowerCase();
  if (!hexColorPattern.test(normalized)) {
    return fallback;
  }
  return normalized;
};

const hexToRgbTriplet = (hex: string): string => {
  const normalized = normalizeThemeColor(hex, "#000000");
  const r = Number.parseInt(normalized.slice(1, 3), 16);
  const g = Number.parseInt(normalized.slice(3, 5), 16);
  const b = Number.parseInt(normalized.slice(5, 7), 16);
  return `${r}, ${g}, ${b}`;
};

export const sanitizeThemePreferences = (
  value: ThemePreferences
): ThemePreferences => {
  return {
    gradientStart: normalizeThemeColor(
      value.gradientStart,
      defaultThemePreferences.gradientStart
    ),
    gradientMid: normalizeThemeColor(
      value.gradientMid,
      defaultThemePreferences.gradientMid
    ),
    gradientEnd: normalizeThemeColor(
      value.gradientEnd,
      defaultThemePreferences.gradientEnd
    ),
  };
};

export const applyThemePreferences = (
  value: ThemePreferences,
  root: HTMLElement = document.documentElement
): void => {
  const sanitized = sanitizeThemePreferences(value);
  root.style.setProperty("--user-gradient-start", sanitized.gradientStart);
  root.style.setProperty("--user-gradient-mid", sanitized.gradientMid);
  root.style.setProperty("--user-gradient-end", sanitized.gradientEnd);
  root.style.setProperty(
    "--user-gradient-start-rgb",
    hexToRgbTriplet(sanitized.gradientStart)
  );
  root.style.setProperty(
    "--user-gradient-mid-rgb",
    hexToRgbTriplet(sanitized.gradientMid)
  );
  root.style.setProperty(
    "--user-gradient-end-rgb",
    hexToRgbTriplet(sanitized.gradientEnd)
  );
};
