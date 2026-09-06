// Cross-tab navigation bus: lets screens switch the active tab in (tabs)/_layout.tsx.
type TabListener = (id: string) => void;

const listeners = new Set<TabListener>();

export function gotoTab(id: string): void {
  listeners.forEach((fn) => fn(id));
}

export function onGotoTab(fn: TabListener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
