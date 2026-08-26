import type { CSSProperties } from "react";
import { builtInSendIconMask, type ThemeSendIcon } from "../../../contracts";

export function SendIconGlyph({
  icon,
  dataUrl,
}: {
  icon: ThemeSendIcon;
  dataUrl?: string;
}) {
  if (icon === "native") {
    return (
      <span
        className="send-icon-glyph native"
        data-send-icon="native"
        aria-hidden="true"
      >
        ↑
      </span>
    );
  }
  if (icon === "custom") {
    return dataUrl ? (
      <span
        className="send-icon-glyph custom"
        data-send-icon="custom"
        aria-hidden="true"
        style={{ backgroundImage: 'url("' + dataUrl + '")' }}
      />
    ) : (
      <span
        className="send-icon-glyph native"
        data-send-icon="custom"
        aria-hidden="true"
      >
        ＋
      </span>
    );
  }
  const mask = builtInSendIconMask(icon);
  return (
    <span
      className="send-icon-glyph mask"
      data-send-icon={icon}
      aria-hidden="true"
      style={
        {
          WebkitMaskImage: mask ? 'url("' + mask + '")' : undefined,
          maskImage: mask ? 'url("' + mask + '")' : undefined,
        } as CSSProperties
      }
    />
  );
}
