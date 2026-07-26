"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface WarehouseMarker {
  lat: number;
  lng: number;
  name: string;
}

interface FleetMapProps {
  lat: number | null;
  lng: number | null;
  heading?: number | null;
  label?: string;
  warehouses?: WarehouseMarker[];
}

function arrowIcon(heading: number): L.DivIcon {
  const svg = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="transform:rotate(${heading}deg)"><path d="M12 2L4 22l8-6 8 6L12 2z" fill="#06b6d4" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
  return L.divIcon({
    className: "",
    html: svg,
    iconSize: [24, 24],
    iconAnchor: [12, 18],
    popupAnchor: [0, -20],
  });
}

function dotIcon(): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="background:#64748b;width:12px;height:12px;border-radius:50%;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3)"></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });
}

function warehouseIcon(): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;background:#f59e0b;border-radius:4px;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3);color:#fff;font-size:14px;font-weight:bold;line-height:1;">🏭</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -16],
  });
}

export default function FleetMap({ lat, lng, heading, label, warehouses }: FleetMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const warehouseMarkersRef = useRef<L.Marker[]>([]);

  useEffect(() => {
    if (!mapRef.current || instanceRef.current) return;
    const map = L.map(mapRef.current, {
      zoomControl: true,
      attributionControl: false,
    }).setView([16.3, 80.36], 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
    }).addTo(map);
    instanceRef.current = map;
    return () => {
      map.remove();
      instanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = instanceRef.current;
    if (!map) return;

    warehouseMarkersRef.current.forEach((m) => m.remove());
    warehouseMarkersRef.current = [];

    if (warehouses) {
      for (const w of warehouses) {
        const m = L.marker([w.lat, w.lng], { icon: warehouseIcon() })
          .addTo(map)
          .bindPopup(`<strong>${w.name}</strong><br/>Warehouse`);
        warehouseMarkersRef.current.push(m);
      }
    }
  }, [warehouses]);

  useEffect(() => {
    const map = instanceRef.current;
    if (!map) return;
    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }
    if (lat != null && lng != null) {
      const icon = heading != null ? arrowIcon(heading) : dotIcon();
      markerRef.current = L.marker([lat, lng], { icon })
        .addTo(map)
        .bindPopup(label ?? "");
      map.setView([lat, lng], map.getZoom() < 12 ? 12 : map.getZoom());
    }
  }, [lat, lng, heading, label]);

  return (
    <div
      ref={mapRef}
      className="size-full min-h-[300px] rounded-lg overflow-hidden"
    />
  );
}
