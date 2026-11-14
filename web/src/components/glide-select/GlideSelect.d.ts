// Types for the plain-JS React Bits component, so TypeScript files can use it.
import type { ReactNode } from "react";

export type GlideOption = string | { value: string; label: ReactNode; tag?: string };

export interface GlideSelectProps {
  options?: GlideOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string, option: Exclude<GlideOption, string>) => void;
  placeholder?: ReactNode;
  showTags?: boolean;
  accentColor?: string;
  surfaceColor?: string;
  highlightColor?: string;
  textColor?: string;
  size?: "sm" | "md" | "lg";
  radius?: number;
  menuWidth?: number;
  placement?: "top" | "bottom";
  align?: "left" | "right";
  popDuration?: number;
  glideDuration?: number;
  rememberPosition?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}

declare const GlideSelect: (props: GlideSelectProps) => React.JSX.Element;
export default GlideSelect;
