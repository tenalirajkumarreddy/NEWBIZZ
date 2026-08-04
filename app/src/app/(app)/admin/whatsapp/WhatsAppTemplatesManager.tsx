"use client";

import { useState, useTransition } from "react";
import { Field, Input, Badge, Panel, Table, THead, TBody, TR, TH, TD } from "@/components/ui";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { deleteWhatsappTemplate, saveWhatsappTemplate } from "@/lib/actions/whatsapp";
import { useRouter } from "next/navigation";
import type { Database } from "@/lib/supabase/database.types";

type TemplateRow = Database["public"]["Tables"]["whatsapp_message_templates"]["Row"];

export function WhatsAppTemplatesManager({ templates }: { templates: TemplateRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("Utility");
  const [status, setStatus] = useState("APPROVED");

  function handleAdd() {
    if (!name.trim() || !body.trim()) {
      toast.error("Name and body are required");
      return;
    }
    startTransition(async () => {
      const res = await saveWhatsappTemplate({ name: name.trim(), bodyText: body.trim(), category, status });
      if (res.ok) {
        toast.success("Template saved");
        setName("");
        setBody("");
        router.refresh();
      } else {
        toast.error("Could not save template", res.error);
      }
    });
  }

  function handleDelete(id: string, templateName: string) {
    startTransition(async () => {
      const res = await deleteWhatsappTemplate(id);
      if (res.ok) {
        toast.success("Template deleted", templateName);
        router.refresh();
      } else {
        toast.error("Could not delete template", res.error);
      }
    });
  }

  return (
    <Panel
      title="Message templates"
      subtitle="Local catalogue of approved templates agents can send from the inbox. Approval still happens in Meta."
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Template name" hint="Must match the name in Meta.">
            <Input value={name} onChange={(e) => setName(e.target.value)} mono placeholder="e.g. order_update" />
          </Field>
          <Field label="Category" hint="Marketing / Utility / Authentication.">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-9 w-full rounded-lg border border-line bg-white px-3 text-[13px] text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
            >
              <option>Utility</option>
              <option>Marketing</option>
              <option>Authentication</option>
            </select>
          </Field>
        </div>
        <Field label="Body text" hint="Use {{1}}, {{2}} for variables — the inbox fills these at send time.">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            placeholder="Hi {{1}}, your invoice {{2}} is ready."
            className="min-h-[52px] w-full rounded-lg border border-line bg-white px-3 py-2 text-[13px] text-ink placeholder:text-ink-4 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
        </Field>
        <div className="flex items-center gap-2">
          <Button variant="primary" onClick={handleAdd} loading={pending}>
            Save template
          </Button>
          <label className="flex items-center gap-2 text-[13px] font-medium text-ink">
            <input
              type="checkbox"
              checked={status === "APPROVED"}
              onChange={(e) => setStatus(e.target.checked ? "APPROVED" : "PENDING")}
              className="h-4 w-4 rounded border-line accent-brand"
            />
            Approved (visible to agents)
          </label>
        </div>

        {templates.length === 0 ? (
          <p className="text-[12px] text-ink-4">No templates yet — add one above.</p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Body</TH>
                <TH>Status</TH>
                <TH className="w-20" />
              </TR>
            </THead>
            <TBody>
              {templates.map((t) => (
                <TR key={t.id}>
                  <TD className="font-mono text-[12px] font-medium text-ink">{t.name}</TD>
                  <TD className="max-w-[300px] truncate text-ink-2">{t.body_text}</TD>
                  <TD>
                    <Badge tone={t.status === "APPROVED" ? "grn" : "amb"} size="sm">
                      {t.status}
                    </Badge>
                  </TD>
                  <TD>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(t.id, t.name)}>
                      Delete
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>
    </Panel>
  );
}
