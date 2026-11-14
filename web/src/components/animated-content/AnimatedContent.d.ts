import type { CSSProperties, ReactNode } from "react";

export interface AnimatedContentProps {
  children?: ReactNode;
  container?: string | HTMLElement;
  distance?: number;
  direction?: "vertical" | "horizontal";
  reverse?: boolean;
  duration?: number;
  ease?: string;
  initialOpacity?: number;
  animateOpacity?: boolean;
  scale?: number;
  blur?: number;
  rotate?: number;
  tilt?: number;
  wipe?: "none" | "up" | "down" | "left" | "right" | "center";
  threshold?: number;
  delay?: number;
  stagger?: number;
  staggerFrom?: "start" | "end" | "center" | "edges" | "random";
  trigger?: "scroll" | "mount";
  once?: boolean;
  scrub?: boolean | number;
  disappearAfter?: number;
  disappearDuration?: number;
  disappearEase?: string;
  onStart?: () => void;
  onComplete?: () => void;
  onDisappearanceComplete?: () => void;
  className?: string;
  style?: CSSProperties;
  [key: string]: unknown;
}

declare const AnimatedContent: (props: AnimatedContentProps) => React.JSX.Element;
export default AnimatedContent;
