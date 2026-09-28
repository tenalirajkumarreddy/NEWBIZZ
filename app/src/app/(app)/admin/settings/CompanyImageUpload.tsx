"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";
import { setCompanyImage } from "@/lib/actions/settings";

// CompanyImageUpload — click-to-upload for the invoice-print branding images
// (signature, payment QR). Uploads the picked file to the public `party-images`
// bucket under company/, then records its public URL on company_settings via
// setCompanyImage. Follows the ImageUpload avatar pattern.
export function CompanyImageUpload({
  target,
  imageUrl,
  label,
  hint,
}: {
  target: "signature" | "qr";
  imageUrl: string | null;
  label: string;
  hint?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

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
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `company/${target}-${Date.now()}.${ext}`;
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
        const res = await setCompanyImage(target, pub.publicUrl);
        setBusy(false);
        if (res.ok) {
          toast.success("Image updated", label);
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
      const res = await setCompanyImage(target, null);
      if (res.ok) {
        toast.success("Image removed", label);
        router.refresh();
      } else {
        toast.error("Could not remove", res.error);
      }
    });
  }

  const working = busy || pending;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={working}
          className="group relative grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-fill transition hover:border-brand/40 disabled:opacity-60"
          aria-label={`Upload ${label.toLowerCase()}`}
        >
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt={label} className="h-full w-full bg-white object-contain p-1.5" />
          ) : (
            <span className="font-mono text-[16px] font-bold text-ink-4">＋</span>
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-ink/50 text-[11px] font-semibold text-white opacity-0 transition group-hover:opacity-100">
            {working ? "…" : imageUrl ? "Change" : "Upload"}
          </span>
        </button>
        <div className="min-w-0">
          <div className="text-[12px] font-semibold text-ink">{label}</div>
          {hint && <p className="mt-0.5 text-[11px] leading-4 text-ink-4">{hint}</p>}
          {imageUrl && !working && (
            <button
              type="button"
              onClick={onRemove}
              className="mt-1 text-[11px] text-ink-4 hover:text-red"
            >
              Remove
            </button>
          )}
        </div>
      </div>
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
