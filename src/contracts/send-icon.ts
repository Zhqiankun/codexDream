export const THEME_SEND_ICON_VALUES = [
  "native",
  "paper-plane",
  "spark",
  "rocket",
  "custom",
] as const;

export type ThemeSendIcon = (typeof THEME_SEND_ICON_VALUES)[number];
export type BuiltInThemeSendIcon = Exclude<ThemeSendIcon, "native" | "custom">;

export const MAX_THEME_ICON_DATA_URL_LENGTH = 48 * 1024;

const BUILT_IN_ICON_SVGS: Record<BuiltInThemeSendIcon, string> = {
  "paper-plane":
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="black" d="M3.25 3.72a1 1 0 0 1 1.08-.17l16 7.5a1.05 1.05 0 0 1 0 1.9l-16 7.5A1 1 0 0 1 3 19.38L5.18 13H12a1 1 0 1 0 0-2H5.18L3 4.62a1 1 0 0 1 .25-.9Z"/></svg>',
  spark:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="black" d="M12 2.5c.55 0 .89.36 1.08 1.04l.45 1.63a7.5 7.5 0 0 0 5.3 5.3l1.63.45c.68.19 1.04.53 1.04 1.08s-.36.89-1.04 1.08l-1.63.45a7.5 7.5 0 0 0-5.3 5.3l-.45 1.63c-.19.68-.53 1.04-1.08 1.04s-.89-.36-1.08-1.04l-.45-1.63a7.5 7.5 0 0 0-5.3-5.3l-1.63-.45C2.86 12.89 2.5 12.55 2.5 12s.36-.89 1.04-1.08l1.63-.45a7.5 7.5 0 0 0 5.3-5.3l.45-1.63C11.11 2.86 11.45 2.5 12 2.5Z"/></svg>',
  rocket:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="black" d="M14.56 3.2c1.78-.88 3.82-1.1 5.73-.62.47.12.83.49.95.95.48 1.91.26 3.95-.62 5.73a13.6 13.6 0 0 1-3.26 4.22l-3.26 2.88-6.46-6.46 2.88-3.26a13.6 13.6 0 0 1 4.04-3.44Zm1.57 5.98a1.9 1.9 0 1 0 0-3.8 1.9 1.9 0 0 0 0 3.8ZM6.7 11.18l-1.84.46a2.4 2.4 0 0 0-1.74 1.6l-1 3.02a.8.8 0 0 0 .98 1.01l4.03-1.02 2.34-2.34-2.77-2.73Zm6.12 5.8 2.73-2.77 2.34 2.34-1.02 4.03a.8.8 0 0 1-1.01.98l-3.02-1a2.4 2.4 0 0 1-1.6-1.74l-.46-1.84h2.04ZM5.2 21.2a1 1 0 0 1-1.4-1.4l2.4-2.4a1 1 0 1 1 1.4 1.4l-2.4 2.4Zm4-.4a1 1 0 0 1-1.4-1.4l1.4-1.4a1 1 0 0 1 1.4 1.4l-1.4 1.4Z"/></svg>',
};

export function isThemeSendIcon(value: unknown): value is ThemeSendIcon {
  return (
    typeof value === "string" &&
    (THEME_SEND_ICON_VALUES as readonly string[]).includes(value)
  );
}

export function isThemeIconDataUrl(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= MAX_THEME_ICON_DATA_URL_LENGTH &&
    /^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/u.test(value)
  );
}

export function builtInSendIconMask(icon: ThemeSendIcon): string | undefined {
  if (icon === "native" || icon === "custom") return undefined;
  return "data:image/svg+xml," + encodeURIComponent(BUILT_IN_ICON_SVGS[icon]);
}
