"use client";

import { useState, useEffect } from "react";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { saveEmployeeProfile, saveWorkerProfile, fetchEmployeeProfile, fetchWorkers } from "@/lib/actions/payroll";

export function EditProfileDrawer({
  userId,
  userName,
  onClose,
}: {
  userId: string;
  userName: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isWorker, setIsWorker] = useState(false);
  const [photoUrl, setPhotoUrl] = useState("");
  const [aadharNumber, setAadharNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  useEffect(() => {
    fetchEmployeeProfile(userId).then((p) => {
      if (p) {
        setPhotoUrl(p.photoUrl ?? "");
        setAadharNumber(p.aadharNumber ?? "");
        setPhone(p.phone ?? "");
        setAddress(p.address ?? "");
        setIsWorker(false);
        setLoading(false);
      } else {
        fetchWorkers().then((workers) => {
            const w = workers.find((x) => x.id === userId);
            if (w) {
              setPhotoUrl(w.photoUrl ?? "");
              setAadharNumber(w.aadharNumber ?? "");
              setPhone(w.phone ?? "");
              setAddress(w.address ?? "");
              setIsWorker(true);
            }
            setLoading(false);
          });
      }
    });
  }, [userId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const result = isWorker
      ? await saveWorkerProfile(userId, photoUrl || null, aadharNumber || null, phone || null, address || null)
      : await saveEmployeeProfile(userId, photoUrl || null, aadharNumber || null, phone || null, address || null);
    if (!result.ok) {
      toast.error("Failed to save profile", result.error);
    } else {
      toast.success("Profile saved");
      onClose();
    }
    setSaving(false);
  }

  return (
    <Drawer open onClose={onClose} title={`Edit Profile`} description={userName}>
      {loading ? (
        <p className="py-8 text-center text-[13px] text-ink-4">Loading...</p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-4">
          <Field label="Photo URL">
            <Input value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} placeholder="https://..." />
          </Field>
          <Field label="Aadhar Number">
            <Input value={aadharNumber} onChange={(e) => setAadharNumber(e.target.value)} placeholder="XXXXXXXXXXXX" />
          </Field>
          <Field label="Phone">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91..." />
          </Field>
          <Field label="Address">
            <Textarea value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Full address" rows={3} />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="subtle" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={saving}>
              Save Profile
            </Button>
          </div>
        </form>
      )}
    </Drawer>
  );
}
