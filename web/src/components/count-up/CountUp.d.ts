import type { CSSProperties } from "react";

export interface CountUpProps {
  to: number;
  from?: number;
  direction?: "up" | "down";
  delay?: number;
  duration?: number;
  className?: string;
  style?: CSSProperties;
  startWhen?: boolean;
  separator?: string;
  prefix?: string;
  suffix?: string;
  mode?: "count" | "roll";
  easing?: "linear" | "easeOut" | "expo" | "spring";
  decimals?: number;
  format?: "standard" | "compact";
  trigger?: "view" | "load";
  replayOnHover?: boolean;
  pad?: number;
  onStart?: () => void;
  onEnd?: () => void;
}

declare function CountUp(props: CountUpProps): React.JSX.Element;
export default CountUp;
