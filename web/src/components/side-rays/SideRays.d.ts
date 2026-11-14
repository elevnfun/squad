import type { CSSProperties } from "react";

export interface SideRaysProps {
  rayColor1?: string;
  rayColor2?: string;
  blend?: number;
  origin?: "top-right" | "top-left" | "bottom-right" | "bottom-left" | "right" | "left";
  speed?: number;
  intensity?: number;
  spread?: number;
  density?: number;
  sharpness?: number;
  tilt?: number;
  falloff?: number;
  glow?: number;
  saturation?: number;
  dust?: number;
  followMouse?: boolean;
  mouseInfluence?: number;
  intro?: boolean;
  lightMode?: boolean;
  opacity?: number;
  maxDevicePixelRatio?: number;
  className?: string;
  style?: CSSProperties;
}

declare function SideRays(props: SideRaysProps): React.JSX.Element;
export default SideRays;
