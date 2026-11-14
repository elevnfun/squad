import type { CSSProperties, ReactNode } from "react";

export type AnimatedListItem = string | { id?: string | number; icon?: ReactNode; image?: string; title: ReactNode; description?: ReactNode; meta?: ReactNode };

export interface AnimatedListProps<T = AnimatedListItem> {
  items?: T[];
  onItemSelect?: (item: T, index: number) => void;
  renderItem?: (item: T, index: number, selected: boolean) => ReactNode;
  initialSelectedIndex?: number;
  selectOnHover?: boolean;
  enableArrowNavigation?: boolean;
  loop?: boolean;
  animation?: "pop" | "slide" | "fade" | "none";
  animateOnce?: boolean;
  stagger?: number;
  showGradients?: boolean;
  fadeSize?: number;
  displayScrollbar?: boolean;
  frame?: boolean;
  theme?: "dark" | "light";
  accentColor?: string;
  radius?: number;
  gap?: number;
  width?: number | string;
  maxHeight?: number | string;
  className?: string;
  itemClassName?: string;
  style?: CSSProperties & Record<string, string | number>;
}

declare function AnimatedList<T = AnimatedListItem>(props: AnimatedListProps<T>): React.JSX.Element;
export default AnimatedList;
