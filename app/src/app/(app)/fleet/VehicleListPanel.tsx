"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/Badge";

interface VehicleItem {
  id: string;
  regNo: string;
  type: string | null;
  status: string;
  ownedOrHired: string;
  capacity: string | null;
}

interface Props {
  vehicles: VehicleItem[];
  intanglesPlates: Set<string>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function VehicleListPanel({ vehicles, intanglesPlates, selectedId, onSelect }: Props) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-line">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">
          Vehicles
        </h3>
        <p className="text-[11px] text-ink-3">
          {vehicles.length} total &middot; {intanglesPlates.size} tracked
        </p>
      </div>
      <div className="flex-1 overflow-y-auto">
        {vehicles.length === 0 ? (
          <div className="p-4 text-center text-[13px] text-ink-3">
            No vehicles
          </div>
        ) : (
          <div className="divide-y divide-line">
            {vehicles.map((v) => {
              const isSelected = v.id === selectedId;
              const tracked = intanglesPlates.has(v.regNo);
              return (
                <button
                  key={v.id}
                  onClick={() => onSelect(v.id)}
                  className={`w-full text-left px-3 py-2.5 transition-colors ${
                    isSelected
                      ? "bg-brand/5 border-l-2 border-brand"
                      : "hover:bg-surface-2 border-l-2 border-transparent"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <Link
                      href={`/fleet/${v.id}`}
                      className="font-mono text-[12px] font-semibold text-brand hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {v.regNo}
                    </Link>
                    {tracked ? (
                      <span className="inline-block size-1.5 rounded-full bg-grn" />
                    ) : (
                      <span className="inline-block size-1.5 rounded-full bg-ink-3" />
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-3">
                    {v.type && <span>{v.type}</span>}
                    <span className="capitalize">{v.ownedOrHired}</span>
                  </div>
                  <div className="mt-0.5">
                    <Badge
                      tone={v.status === "active" ? "grn" : v.status === "maintenance" ? "amb" : "slate"}
                      size="sm"
                    >
                      {v.status}
                    </Badge>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
