"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { Field, Input, Select } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { createMapping, updateMapping, deleteMapping } from "@/lib/actions/production-devices";
import type { DeviceConfigRow, ItemOption } from "@/lib/data/production-devices";

const TYPE_LABEL: Record<string, string> = {
  raw_material: "Raw",
  wip: "WIP",
  finished_good: "FG",
  consumable: "Consumable",
  service: "Service",
};

const TYPE_TONE: Record<string, "brand" | "amb" | "grn" | "slate" | "neutral"> = {
  raw_material: "amb",
  wip: "neutral",
  finished_good: "grn",
  consumable: "slate",
  service: "slate",
};

function DeviceConfigTable({
  configs,
  items,
  onEdit,
  onDelete,
}: {
  configs: DeviceConfigRow[];
  items: ItemOption[];
  onEdit: (id: string, itemId: string) => void;
  onDelete: (id: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editItemId, setEditItemId] = useState("");
  const router = useRouter();

  if (configs.length === 0) {
    return (
      <EmptyState
        title="No device mappings yet"
        description="Add mappings to link each device slot to an item."
      />
    );
  }

  return (
    <Table>
      <THead>
        <TR>
          <TH>Device ID</TH>
          <TH numeric>Index</TH>
          <TH>Item</TH>
          <TH>Type</TH>
          <TH>Actions</TH>
        </TR>
      </THead>
      <TBody>
        {configs.map((cfg) => (
          <TR key={cfg.id}>
            <TD className="font-mono text-[12px] font-semibold text-brand">{cfg.deviceId}</TD>
            <TD numeric className="font-mono text-[12px]">{cfg.deviceIndex}</TD>
            {editingId === cfg.id ? (
              <>
                <TD>
                  <Select
                    value={editItemId}
                    onChange={(e) => setEditItemId(e.target.value)}
                    className="w-full max-w-[300px]"
                  >
                    {items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.sku} — {item.name}
                      </option>
                    ))}
                  </Select>
                </TD>
                <TD>
                  {items.find((i) => i.id === editItemId) && (
                    <Badge
                      tone={TYPE_TONE[items.find((i) => i.id === editItemId)!.type] ?? "slate"}
                      size="sm"
                    >
                      {TYPE_LABEL[items.find((i) => i.id === editItemId)!.type] ?? "—"}
                    </Badge>
                  )}
                </TD>
                <TD>
                  <div className="flex gap-1">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        onEdit(cfg.id, editItemId);
                        setEditingId(null);
                      }}
                    >
                      Save
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                      Cancel
                    </Button>
                  </div>
                </TD>
              </>
            ) : (
              <>
                <TD>
                  <span className="font-medium text-ink">{cfg.itemSku}</span>
                  <span className="ml-1.5 text-ink-3">{cfg.itemName}</span>
                </TD>
                <TD>
                  <Badge tone={TYPE_TONE[cfg.itemType] ?? "slate"} size="sm">
                    {TYPE_LABEL[cfg.itemType] ?? cfg.itemType}
                  </Badge>
                </TD>
                <TD>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingId(cfg.id);
                        setEditItemId(cfg.itemId);
                      }}
                    >
                      Edit
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => onDelete(cfg.id)}>
                      Remove
                    </Button>
                  </div>
                </TD>
              </>
            )}
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

function AddMappingForm({
  items,
  onAdd,
}: {
  items: ItemOption[];
  onAdd: (deviceId: string, deviceIndex: number, itemId: string) => void;
}) {
  const [deviceId, setDeviceId] = useState("");
  const [deviceIndex, setDeviceIndex] = useState("");
  const [itemId, setItemId] = useState(items[0]?.id ?? "");

  const canAdd = deviceId.trim().length > 0 && deviceIndex.trim().length > 0 && itemId;

  return (
    <div className="flex flex-wrap items-end gap-3 border-t border-line px-3 py-3">
      <Field label="Device ID" htmlFor="new-device-id">
        <Input
          id="new-device-id"
          mono
          value={deviceId}
          onChange={(e) => setDeviceId(e.target.value)}
          placeholder="e.g. AABBCCDDEEFF"
          className="w-[160px]"
        />
      </Field>
      <Field label="Index" htmlFor="new-index">
        <Input
          id="new-index"
          mono
          type="number"
          min={1}
          value={deviceIndex}
          onChange={(e) => setDeviceIndex(e.target.value)}
          placeholder="1"
          className="w-[80px] text-right"
        />
      </Field>
      <Field label="Item" htmlFor="new-item">
        <Select
          id="new-item"
          value={itemId}
          onChange={(e) => setItemId(e.target.value)}
          className="w-[300px]"
        >
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.sku} — {item.name} ({TYPE_LABEL[item.type] ?? item.type})
            </option>
          ))}
        </Select>
      </Field>
      <Button
        variant="primary"
        size="sm"
        disabled={!canAdd}
        onClick={() => {
          onAdd(deviceId.trim(), parseInt(deviceIndex, 10), itemId);
          setDeviceId("");
          setDeviceIndex("");
        }}
      >
        Add mapping
      </Button>
    </div>
  );
}

export function DeviceConfigManager({
  configs,
  items,
}: {
  configs: DeviceConfigRow[];
  items: ItemOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  function handleAdd(deviceId: string, deviceIndex: number, itemId: string) {
    startTransition(async () => {
      const res = await createMapping(deviceId, deviceIndex, itemId);
      if (res.ok) {
        toast.success("Mapping created", `${deviceId} index ${deviceIndex}`);
        router.refresh();
      } else {
        toast.error("Could not create mapping", res.error);
      }
    });
  }

  function handleEdit(id: string, itemId: string) {
    startTransition(async () => {
      const res = await updateMapping(id, itemId);
      if (res.ok) {
        toast.success("Mapping updated");
        router.refresh();
      } else {
        toast.error("Could not update mapping", res.error);
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const res = await deleteMapping(id);
      if (res.ok) {
        toast.success("Mapping removed");
        router.refresh();
      } else {
        toast.error("Could not remove mapping", res.error);
      }
    });
  }

  return (
    <div>
      <DeviceConfigTable
        configs={configs}
        items={items}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />
      <AddMappingForm items={items} onAdd={handleAdd} />
    </div>
  );
}
