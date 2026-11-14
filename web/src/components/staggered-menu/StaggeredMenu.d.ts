export interface StaggeredMenuItem { label: string; ariaLabel?: string; link: string }
/** a link starting with "/" is one of the site's pages: it opens in the tab and closes the menu */
export interface StaggeredMenuSocialItem { label: string; link: string }

export interface StaggeredMenuProps {
  position?: "left" | "right";
  colors?: string[];
  items?: StaggeredMenuItem[];
  socialItems?: StaggeredMenuSocialItem[];
  /** heading over the small links row; default "Socials" */
  socialsTitle?: string;
  displaySocials?: boolean;
  displayItemNumbering?: boolean;
  className?: string;
  logoUrl?: string;
  menuButtonColor?: string;
  openMenuButtonColor?: string;
  accentColor?: string;
  changeMenuColorOnOpen?: boolean;
  isFixed?: boolean;
  closeOnClickAway?: boolean;
  onMenuOpen?: () => void;
  onMenuClose?: () => void;
}

export declare const StaggeredMenu: (props: StaggeredMenuProps) => React.JSX.Element;
declare const _default: typeof StaggeredMenu;
export default _default;
