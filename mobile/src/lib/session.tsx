import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { parseClaims, can as canPerm, type AppClaims } from "./claims";

interface SessionCtx {
  session: Session | null;
  user: User | null;
  claims: AppClaims;
  loading: boolean;
  can: (perm: string) => boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<SessionCtx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const claims = parseClaims(session?.user);
  const value: SessionCtx = {
    session,
    user: session?.user ?? null,
    claims,
    loading,
    can: (perm) => canPerm(claims, perm),
    signOut: async () => {
    await supabase.auth.signOut();
  },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSession outside SessionProvider");
  return ctx;
}
