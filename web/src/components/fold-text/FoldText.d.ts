// Types for the plain-JS React Bits component, so TypeScript pages can use it.
import type { CSSProperties } from "react";

export interface FoldTextProps {
  text?: string;
  splitBy?: "char" | "word" | "line";
  hinge?: "top" | "bottom" | "left" | "right";
  foldStyle?: "paper" | "blinds" | "flip";
  duration?: number;
  stagger?: number;
  staggerFrom?: "start" | "end" | "center" | "edges" | "random" | number;
  foldAngle?: number;
  ease?: string;
  perspective?: number;
  creaseShading?: number;
  trigger?: "mount" | "scroll" | "hover" | "loop";
  loopDelay?: number;
  hoverRefold?: boolean;
  refoldRadius?: number;
  refoldAngle?: number;
  fontSize?: number | string;
  fontWeight?: number;
  color?: string;
  className?: string;
  style?: CSSProperties;
}

declare const FoldText: (props: FoldTextProps) => React.JSX.Element;
export default FoldText;
