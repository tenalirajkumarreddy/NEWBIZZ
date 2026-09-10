import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";

export interface UserRow {
  id: string;
  full_name: string;
}

export function useActiveUsers() {
  const { user } = useSession();
  return useQuery({
    queryKey: ["users", "active"],
    enabled: !!user?.id,
    queryFn: async (): Promise<UserRow[]> => {
      const { data, error } = await supabase
        .from("users")
        .select("id, full_name")
        .eq("status", "active")
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as UserRow[];
    },
  });
}
