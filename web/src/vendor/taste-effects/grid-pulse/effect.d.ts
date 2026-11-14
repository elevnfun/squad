declare const effect: {
  mount(el: HTMLElement, opts: { palette?: Record<string, string>; params?: Record<string, number>; seed?: number }): { destroy(): void; pause(): void; resume(): void };
};
export default effect;
