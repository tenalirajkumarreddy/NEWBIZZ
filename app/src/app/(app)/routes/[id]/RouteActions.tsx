"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { deleteRoute, createSession, type ActionResult } from "@/lib/actions/routes";

export function RouteActions({
  routeId,
  users,
}: {
  routeId: string;
  users: { id: string; full_name: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [deletePending, setDeletePending] = useState(false);
  const [deleteState, setDeleteState] = useState<ActionResult | null>(null);
  const [sessionPending, setSessionPending] = useState(false);
  const [sessionState, setSessionState] = useState<ActionResult | null>(null);

  async function handleSession(formData: FormData) {
    setSessionPending(true);
    setSessionState(null);
    const res = await createSession({
      routeId,
      agentId: formData.get("agentId") as string,
    });
    if (res.ok) {
      toast.success("Session started");
      router.refresh();
    } else {
      toast.error(res.error);
      setSessionState(res);
    }
    setSessionPending(false);
  }

  async function handleDelete() {
    setDeletePending(true);
    setDeleteState(null);
    const res = await deleteRoute(routeId);
    if (res.ok) router.push("/routes");
    else {
      toast.error(res.error);
      setDeleteState(res);
    }
    setDeletePending(false);
  }

  return (
    <div className="flex items-center gap-2">
      <form action={handleSession} className="flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          <label className="sr-only">Agent</label>
          <select name="agentId" className="input-primary text-[13px]" required>
            <option value="">Select agent…</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.full_name}</option>
            ))}
          </select>
        </div>
        <Button type="submit" size="sm" disabled={sessionPending}>
          {sessionPending ? "Starting…" : "Start"}
        </Button>
      </form>
      {sessionState && !sessionState.ok && (
        <p className="text-[13px] text-red-600">{sessionState.error}</p>
      )}
      <Button type="button" variant="danger" size="sm" disabled={deletePending} onClick={handleDelete}>
        {deletePending ? "Deleting…" : "Delete"}
      </Button>
      {deleteState && !deleteState.ok && (
        <p className="text-[13px] text-red-600">{deleteState.error}</p>
      )}
    </div>
  );
}
