"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";
import { setPartyImage } from "@/lib/actions/customers";

// Avatar with click-to-upload. Uploads the picked file to the public
// `party-images` bucket, then records its public URL on the customer/store via
// setPartyImage. Shows initials when there's no image yet.
export function ImageUpload({
  target,
  id,
  customerId,
  imageUrl,
  name,
  size = 72,
}: {
  target: "customer" | "store";
  id: string;
  customerId?: string;
  imageUrl: string | null;
  name: string;
  size?: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  async function onPick(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Not an image", "Pick a JPG, PNG, or WebP file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Too large", "Images must be under 5 MB.");
      return;
    }
    setBusy(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${target}/${id}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("party-images")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) {
        toast.error("Upload failed", upErr.message);
        setBusy(false);
        return;
      }
      const { data: pub } = supabase.storage.from("party-images").getPublicUrl(path);
      startTransition(async () => {
        const res = await setPartyImage(target, id, pub.publicUrl, customerId);
        setBusy(false);
        if (res.ok) {
          toast.success("Image updated", name);
          router.refresh();
        } else {
          toast.error("Could not save image", res.error);
        }
      });
    } catch (e) {
      setBusy(false);
      toast.error("Upload failed", e instanceof Error ? e.message : "Unknown error");
    }
  }

  function onRemove() {
    startTransition(async () => {
      const res = await setPartyImage(target, id, null, customerId);
      if (res.ok) {
        toast.success("Image removed", name);
        router.refresh();
      } else {
        toast.error("Could not remove", res.error);
      }
    });
  }

  const working = busy || pending;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={working}
        className="group relative overflow-hidden rounded-xl ring-1 ring-inset ring-line transition hover:ring-brand/40 disabled:opacity-60"
        style={{ width: size, height: size }}
        aria-label="Upload image"
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={name} className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-fill font-mono text-[18px] font-bold text-ink-4">
            {initials || "—"}
          </span>
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-ink/50 text-[11px] font-semibold text-white opacity-0 transition group-hover:opacity-100">
          {working ? "…" : imageUrl ? "Change" : "Upload"}
        </span>
      </button>
      {imageUrl && !working && (
        <button type="button" onClick={onRemove} className="text-[10px] text-ink-4 hover:text-red">
          Remove
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
