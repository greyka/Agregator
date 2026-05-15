import { CSSProperties } from "react";

/**
 * Renders a Tabler outline icon stored in /public/rooms/.
 * Loaded via <img> + CSS mask so we can tint it with currentColor.
 */
export function RoomIcon({
  name, size = 22, color, className, style,
}: {
  name: string;
  size?: number;
  color?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const url = `/rooms/${name}.svg`;
  return (
    <span
      className={className}
      style={{
        display: "inline-block",
        width: size, height: size,
        backgroundColor: color || "currentColor",
        WebkitMaskImage: `url("${url}")`,
        maskImage: `url("${url}")`,
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskPosition: "center",
        maskPosition: "center",
        ...style,
      }}
    />
  );
}
