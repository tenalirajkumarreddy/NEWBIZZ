import { Platform } from "react-native";

/**
 * Holds receipt images received via the Android share sheet until the user
 * picks what to do with them (create expense / handover) on the
 * share-received screen.
 */
export interface InboxImage {
  uri: string;
  name?: string;
}

type Listener = () => void;

let pending: InboxImage[] = [];
const listeners = new Set<Listener>();

export const shareInbox = {
  set(images: InboxImage[]) {
    pending = images;
    listeners.forEach((l) => l());
  },
  peek(): InboxImage[] {
    return pending;
  },
  consume(): InboxImage[] {
    const out = pending;
    pending = [];
    listeners.forEach((l) => l());
    return out;
  },
  clear() {
    pending = [];
    listeners.forEach((l) => l());
  },
  hasPending(): boolean {
    return pending.length > 0;
  },
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function isAndroid(): boolean {
  return Platform.OS === "android";
}
