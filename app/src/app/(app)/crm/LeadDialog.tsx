"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { createLead, updateLead } from "@/lib/actions/crm";
import type { LeadRow } from "@/lib/data/crm";

interface Props {
  mode: "create" | "edit";
  lead?: LeadRow;
  onClose: () => void;
}

export function LeadDialog({ mode, lead, onClose }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState(lead?.name ?? "");
  const [company, setCompany] = useState(lead?.company ?? "");
  const [phone, setPhone] = useState(lead?.phone ?? "");
  const [email, setEmail] = useState(lead?.email ?? "");
  const [source, setSource] = useState(lead?.source ?? "");
  const [notes, setNotes] = useState(lead?.notes ?? "");
  const [followUpDate, setFollowUpDate] = useState(lead?.followUpDate ?? "");

  const canSubmit = !!name.trim() && !pending;

  function submit() {
    startTransition(async () => {
      if (mode === "create") {
        const res = await createLead({ name: name.trim(), company: company.trim() || undefined, phone: phone.trim() || undefined, email: email.trim() || undefined, source: source.trim() || undefined, notes: notes.trim() || undefined, followUpDate: followUpDate || undefined });
        if (res.ok) {
          toast.success("Lead created", `${name.trim()} added.`);
          router.refresh();
          onClose();
        } else {
          toast.error("Could not create lead", res.error);
        }
      } else if (lead) {
        const res = await updateLead(lead.id, { name: name.trim() || undefined, company: company.trim() || undefined, phone: phone.trim() || undefined, email: email.trim() || undefined, source: source.trim() || undefined, notes: notes.trim() || undefined, followUpDate: followUpDate || null });
        if (res.ok) {
          toast.success("Lead updated", `${name.trim()} saved.`);
          router.refresh();
          onClose();
        } else {
          toast.error("Could not update lead", res.error);
        }
      }
    });
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={mode === "create" ? "New Lead" : "Edit Lead"}
      size="sm"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={submit} loading={pending} disabled={!canSubmit}>
            {mode === "create" ? "Create" : "Save"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required htmlFor="lead-name">
            <Input id="lead-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Company" htmlFor="lead-company">
            <Input id="lead-company" value={company} onChange={(e) => setCompany(e.target.value)} />
          </Field>
          <Field label="Phone" htmlFor="lead-phone">
            <Input id="lead-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="Email" htmlFor="lead-email">
            <Input id="lead-email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Source" htmlFor="lead-source">
            <Select id="lead-source" value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">Select source</option>
              <option value="referral">Referral</option>
              <option value="inbound">Inbound</option>
              <option value="walk-in">Walk-in</option>
              <option value="campaign">Campaign</option>
              <option value="other">Other</option>
            </Select>
          </Field>
          <Field label="Follow-up date" htmlFor="lead-followup">
            <Input id="lead-followup" type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Notes" htmlFor="lead-notes">
          <Textarea id="lead-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}
