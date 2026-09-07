import { useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import * as Location from "expo-location";
import { Check, ChevronLeft, Crosshair, Search, UserPlus, Users } from "lucide-react-native";
import { Sheet } from "@/components/Sheet";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonRows } from "@/components/SkeletonRows";
import { useRoutes } from "@/data/routes";
import { supabase } from "@/lib/supabase";
import { rpc, friendlyError, RpcError } from "@/lib/rpc";
import type { Database } from "@/lib/db-types";
import { tokens } from "@/theme/tokens";

type CustomerKind = Database["public"]["Enums"]["customer_kind"];
type AuditAction = Database["public"]["Enums"]["audit_action"];

// Enum values mirrored from db-types (Database.public.Enums.customer_kind).
const STORE_KINDS: CustomerKind[] = ["retail", "wholesale", "distributor", "institution"];
const AUDIT_INSERT: AuditAction = "insert";

interface CustomerHit {
  id: string;
  name: string;
  phone: string;
  code: string;
  outstanding?: number;
}

// search_customers rpc rows carry phone: string (nullable col typed non-null in rpc return).
type SearchCustomerRow = CustomerHit & { phone: string | null };

function KindChip({
  label, on, onPress,
}: {
  label: string; on: boolean; onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={`${label} store kind`}
      accessibilityState={{ selected: on }}
      style={({ pressed }) => [s.chip, on && s.chipOn, pressed && { opacity: 0.85 }]}
    >
      <Text style={[s.chipTxt, on && s.chipTxtOn]}>{label}</Text>
    </Pressable>
  );
}

function RoutePick({
  name, on, onPress,
}: {
  name: string; on: boolean; onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={`Route ${name}`}
      accessibilityState={{ selected: on }}
      style={({ pressed }) => [s.routeRow, on && s.routeRowOn, pressed && { opacity: 0.85 }]}
    >
      <Text style={[s.routeName, on && s.routeNameOn]} numberOfLines={1}>{name}</Text>
      {on ? <Check size={15} color={tokens.color.brand} /> : null}
    </Pressable>
  );
}

export function AddStoreWizard({
  visible, onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const routesQ = useRoutes();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [busy, setBusy] = useState(false);

  // step 1 — customer
  const [custMode, setCustMode] = useState<"new" | "existing">("new");
  const [custName, setCustName] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [custQuery, setCustQuery] = useState("");
  const [custHits, setCustHits] = useState<CustomerHit[] | null>(null);
  const [custSearch, setCustSearch] = useState(false);
  const [pickedCustomer, setPickedCustomer] = useState<CustomerHit | null>(null);

  // step 2 — store
  const [storeName, setStoreName] = useState("");
  const [kind, setKind] = useState<CustomerKind>("retail");
  const [routeId, setRouteId] = useState<string | null>(null);
  const [addressLine, setAddressLine] = useState("");
  const [area, setArea] = useState("");
  const [city, setCity] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (!visible) {
      setStep(1);
      setBusy(false);
      setCustMode("new");
      setCustName("");
      setCustPhone("");
      setCustQuery("");
      setCustHits(null);
      setPickedCustomer(null);
      setStoreName("");
      setKind("retail");
      setRouteId(null);
      setAddressLine("");
      setArea("");
      setCity("");
      setLat(null);
      setLng(null);
    }
  }, [visible]);

  const phoneValid = /^\d{10}$/.test(custPhone.trim());
  const pickedId: string = pickedCustomer != null ? pickedCustomer.id : "";
  const step1Valid =
    custMode === "new"
      ? custName.trim().length > 0 && phoneValid
      : pickedCustomer != null;
  const step2Valid = storeName.trim().length > 0;

  const reviewRows = useMemo(() => {
    const customerLabel =
      custMode === "new"
        ? `${custName.trim()} · ${custPhone.trim()}`
        : pickedCustomer
          ? `${pickedCustomer.name} · ${pickedCustomer.phone || "no phone"}`
          : "";
    return [
      { label: "Customer", value: customerLabel },
      { label: "Store", value: storeName.trim() },
      { label: "Kind", value: kind },
      { label: "Route", value: (routesQ.data ?? []).find((r) => r.id === routeId)?.name ?? "—" },
      { label: "Address", value: [addressLine.trim(), area.trim(), city.trim()].filter(Boolean).join(", ") || "—" },
      { label: "GPS", value: lat != null && lng != null ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : "Not captured" },
    ];
  }, [custMode, custName, custPhone, pickedCustomer, storeName, kind, routeId, routesQ.data, addressLine, area, city, lat, lng]);

  async function searchCustomers() {
    if (custSearch) return;
    setCustSearch(true);
    try {
      const rows = await rpc<SearchCustomerRow[]>("search_customers", {
        p_query: custQuery.trim(),
        p_limit: 25,
      });
      setCustHits(
        (rows ?? []).map((r) => ({ ...r, phone: r.phone ?? "" })),
      );
    } catch (e) {
      Toast.show({ type: "error", text1: "Could not search customers", text2: friendlyError(e) });
    } finally {
      setCustSearch(false);
    }
  }

  async function grabCoords() {
    if (locating) return;
    setLocating(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        Toast.show({ type: "info", text1: "Location unavailable", text2: "Store will be saved without GPS" });
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLat(pos.coords.latitude);
      setLng(pos.coords.longitude);
    } catch {
      Toast.show({ type: "info", text1: "Location unavailable", text2: "Store will be saved without GPS" });
    } finally {
      setLocating(false);
    }
  }

  async function submit() {
    if (busy) return;
    setBusy(true);
    try {
      let customerId: string;
      if (custMode === "new") {
        const { data: custCode } = await supabase.rpc("next_entity_code", { p_entity_type: "customer" });
        if (!custCode) throw new RpcError("Could not generate customer code");
        const { data: cust, error: custErr } = await supabase
          .from("customers")
          .insert({
            code: custCode as string,
            name: custName.trim(),
            phone: custPhone.trim(),
            status: "active",
          })
          .select("id")
          .single();
        if (custErr) throw custErr;
        customerId = cust.id;
      } else {
        customerId = pickedCustomer!.id;
      }

      const { data: storeCode } = await supabase.rpc("next_entity_code", { p_entity_type: "store" });
      if (!storeCode) throw new RpcError("Could not generate store code");

      const { data: storeRow, error: storeErr } = await supabase
        .from("customer_stores")
        .insert({
          customer_id: customerId,
          code: storeCode as string,
          name: storeName.trim(),
          kind,
          route_id: routeId,
          address_line: addressLine.trim() || null,
          area: area.trim() || null,
          city: city.trim() || null,
          lat,
          lng,
          status: "active",
        })
        .select("id")
        .single();
      if (storeErr) throw storeErr;
      const newStoreId: string = storeRow.id;

      try {
        await rpc("write_audit", {
          p_action: AUDIT_INSERT,
          p_entity: "customer_stores",
          p_entity_id: newStoreId,
          p_summary: "Store created from mobile",
        });
      } catch (auditErr) {
        Toast.show({
          type: "info",
          text1: "Store created",
          text2: `Audit log could not be written: ${friendlyError(auditErr)}`,
        });
      }

      await qc.invalidateQueries({ queryKey: ["stores"] });
      await qc.invalidateQueries({ queryKey: ["routes"] });
      Toast.show({ type: "success", text1: "Store created", text2: storeName.trim() });
      onClose();
    } catch (e) {
      Toast.show({ type: "error", text1: "Could not create store", text2: friendlyError(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={
        step === 1
          ? "Add store — customer"
          : step === 2
            ? "Add store — details"
            : "Add store — review"
      }
    >
      {step === 1 ? (
        <View style={s.stepBody}>
          <View style={s.modeRow}>
            <Pressable
              onPress={() => setCustMode("new")}
              accessibilityLabel="New customer"
              accessibilityState={{ selected: custMode === "new" }}
              style={({ pressed }) => [s.modeBtn, custMode === "new" && s.modeBtnOn, pressed && { opacity: 0.85 }]}
            >
              <UserPlus size={14} color={custMode === "new" ? tokens.color.surface : tokens.color.ink3} />
              <Text style={[s.modeTxt, custMode === "new" && s.modeTxtOn]}>New customer</Text>
            </Pressable>
            <Pressable
              onPress={() => setCustMode("existing")}
              accessibilityLabel="Existing customer"
              accessibilityState={{ selected: custMode === "existing" }}
              style={({ pressed }) => [s.modeBtn, custMode === "existing" && s.modeBtnOn, pressed && { opacity: 0.85 }]}
            >
              <Users size={14} color={custMode === "existing" ? tokens.color.surface : tokens.color.ink3} />
              <Text style={[s.modeTxt, custMode === "existing" && s.modeTxtOn]}>Existing</Text>
            </Pressable>
          </View>

          {custMode === "new" ? (
            <View style={s.gap}>
              <View style={s.fieldWrap}>
                <Text style={s.label}>Customer name</Text>
                <TextInput
                  style={s.input}
                  value={custName}
                  onChangeText={setCustName}
                  placeholder="e.g. Sri Traders"
                  placeholderTextColor={tokens.color.ink4}
                  accessible
                  accessibilityLabel="Customer name"
                />
              </View>
              <View style={s.fieldWrap}>
                <Text style={s.label}>Phone (10 digits)</Text>
                <TextInput
                  style={[s.input, s.mono]}
                  value={custPhone}
                  onChangeText={(t) => setCustPhone(t.replace(/\D/g, "").slice(0, 10))}
                  placeholder="10-digit mobile number"
                  placeholderTextColor={tokens.color.ink4}
                  keyboardType="phone-pad"
                  accessible
                  accessibilityLabel="Customer phone"
                />
                {custPhone.length > 0 && !phoneValid ? (
                  <Text style={s.warn}>Enter exactly 10 digits</Text>
                ) : null}
              </View>
            </View>
          ) : (
            <View style={s.gap}>
              <View style={s.searchRow}>
                <TextInput
                  style={s.searchInput}
                  value={custQuery}
                  onChangeText={setCustQuery}
                  placeholder="Search customers by name or phone"
                  placeholderTextColor={tokens.color.ink4}
                  onSubmitEditing={() => void searchCustomers()}
                  returnKeyType="search"
                  accessible
                  accessibilityLabel="Search customers"
                />
                <Pressable
                  onPress={() => void searchCustomers()}
                  disabled={custSearch}
                  accessibilityLabel="Run customer search"
                  style={({ pressed }) => [s.searchBtn, pressed && { opacity: 0.85 }, custSearch && { opacity: 0.5 }]}
                >
                  {custSearch ? (
                    <ActivityIndicator size="small" color={tokens.color.brand} />
                  ) : (
                    <Search size={15} color={tokens.color.brand} />
                  )}
                </Pressable>
              </View>
              {pickedCustomer ? (
                <View style={s.picked}>
                  <View style={s.pickedRow}>
                    <View style={s.pickedMain}>
                      <Text style={s.pickedName} numberOfLines={1}>{pickedCustomer.name}</Text>
                      <Text style={s.pickedSub} numberOfLines={1}>
                        {pickedCustomer.code} · {pickedCustomer.phone || "no phone"}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => setPickedCustomer(null)}
                      accessibilityLabel="Choose a different customer"
                      style={s.pickedChange}
                    >
                      <Text style={s.pickedChangeTxt}>Change</Text>
                    </Pressable>
                  </View>
                </View>
              ) : custHits === null ? (
                <Text style={s.hint}>Search and pick the customer this store belongs to.</Text>
              ) : custHits.length === 0 ? (
                <EmptyState title="No customers found" message="Try a different search term." />
              ) : (
                <View style={s.hits}>
                  {custHits.map((c) => {
                    const on = pickedId === c.id;
                    return (
                      <Pressable
                        key={c.id}
                        onPress={() => setPickedCustomer(c)}
                        accessibilityLabel={`Select customer ${c.name}`}
                        style={({ pressed }) => [s.hitRow, on && s.hitRowOn, pressed && { opacity: 0.85 }]}
                      >
                        <View style={s.hitMain}>
                          <Text style={s.hitName} numberOfLines={1}>{c.name}</Text>
                          <Text style={s.hitSub} numberOfLines={1}>
                            {c.code} · {c.phone || "no phone"}
                          </Text>
                        </View>
                        {on ? <Check size={15} color={tokens.color.brand} /> : null}
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          )}
        </View>
      ) : step === 2 ? (
        <View style={s.stepBody}>
          <View style={s.fieldWrap}>
            <Text style={s.label}>Store name</Text>
            <TextInput
              style={s.input}
              value={storeName}
              onChangeText={setStoreName}
              placeholder="e.g. Sri Traders — Main Street"
              placeholderTextColor={tokens.color.ink4}
              accessible
              accessibilityLabel="Store name"
            />
          </View>

          <View style={s.fieldWrap}>
            <Text style={s.label}>Store kind</Text>
            <View style={s.chipWrap}>
              {STORE_KINDS.map((k) => (
                <KindChip key={k} label={k} on={kind === k} onPress={() => setKind(k)} />
              ))}
            </View>
          </View>

          <View style={s.fieldWrap}>
            <Text style={s.label}>Route</Text>
            {routesQ.isLoading ? (
              <SkeletonRows rows={2} />
            ) : (routesQ.data?.length ?? 0) === 0 ? (
              <Text style={s.hint}>No active routes — store can be assigned later.</Text>
            ) : (
              <View style={s.routes}>
          <Pressable
            onPress={() => setRouteId(null)}
            accessibilityLabel="No route"
            accessibilityState={{ selected: routeId === null }}
            style={({ pressed }) => [s.routeRow, routeId === null && s.routeRowOn, pressed && { opacity: 0.85 }]}
          >
            <Text style={[s.routeName, routeId === null && s.routeNameOn]} numberOfLines={1}>
              No route
            </Text>
            {routeId === null ? <Check size={15} color={tokens.color.brand} /> : null}
          </Pressable>
          {routesQ.data!.map((r) => (
            <RoutePick
              key={r.id}
              name={`${r.name} (${r.storeCount})`}
              on={routeId === r.id}
              onPress={() => setRouteId(r.id)}
            />
          ))}
              </View>
            )}
          </View>

          <View style={s.fieldWrap}>
            <Text style={s.label}>Address line</Text>
            <TextInput
              style={s.input}
              value={addressLine}
              onChangeText={setAddressLine}
              placeholder="Shop no, street"
              placeholderTextColor={tokens.color.ink4}
              accessible
              accessibilityLabel="Address line"
            />
          </View>
          <View style={s.twoCol}>
            <View style={s.twoColField}>
              <Text style={s.label}>Area</Text>
              <TextInput
                style={s.input}
                value={area}
                onChangeText={setArea}
                placeholder="Area"
                placeholderTextColor={tokens.color.ink4}
                accessible
                accessibilityLabel="Area"
              />
            </View>
            <View style={s.twoColField}>
              <Text style={s.label}>City</Text>
              <TextInput
                style={s.input}
                value={city}
                onChangeText={setCity}
                placeholder="City"
                placeholderTextColor={tokens.color.ink4}
                accessible
                accessibilityLabel="City"
              />
            </View>
          </View>

          <Pressable
            onPress={() => void grabCoords()}
            disabled={locating}
            accessibilityLabel="Capture GPS location"
            style={({ pressed }) => [
              s.gpsBtn,
              lat != null && lng != null && s.gpsBtnOn,
              pressed && { opacity: 0.85 },
              locating && { opacity: 0.6 },
            ]}
          >
            {locating ? (
              <ActivityIndicator size="small" color={tokens.color.grn} />
            ) : (
              <Crosshair size={15} color={lat != null && lng != null ? tokens.color.grn : tokens.color.ink3} />
            )}
            <Text style={[s.gpsTxt, lat != null && lng != null && s.gpsTxtOn]}>
              {locating
                ? "Locating..."
                : lat != null && lng != null
                  ? `GPS captured · ${lat.toFixed(5)}, ${lng.toFixed(5)}`
                  : "Capture GPS location"}
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={s.stepBody}>
          <View style={s.review}>
            {reviewRows.map((r) => (
              <View key={r.label} style={s.reviewRow}>
                <Text style={s.reviewLabel}>{r.label}</Text>
                <Text style={[s.reviewVal, r.label === "GPS" && s.mono]} numberOfLines={2}>
                  {r.value}
                </Text>
              </View>
            ))}
          </View>
          <Text style={s.hint}>
            {custMode === "new"
              ? "A new customer record and store will be created."
              : "The store will be linked to the selected customer."}
          </Text>
        </View>
      )}

      <View style={s.navRow}>
        {step > 1 ? (
          <Pressable
            onPress={() => setStep((p) => (p === 3 ? 2 : 1) as 1 | 2)}
            disabled={busy}
            accessibilityLabel="Go back a step"
            style={({ pressed }) => [s.navBack, pressed && { opacity: 0.85 }, busy && { opacity: 0.5 }]}
          >
            <ChevronLeft size={15} color={tokens.color.ink2} />
            <Text style={s.navBackTxt}>Back</Text>
          </Pressable>
        ) : (
          <View style={s.navSpacer} />
        )}
        <Pressable
          onPress={() => (step === 3 ? void submit() : setStep((p) => (p === 1 ? 2 : 3) as 2 | 3))}
          disabled={busy || (step === 1 && !step1Valid) || (step === 2 && !step2Valid)}
          accessibilityLabel={step === 3 ? "Create store" : "Continue"}
          style={({ pressed }) => [
            s.navNext,
            pressed && { opacity: 0.9 },
            (busy || (step === 1 && !step1Valid) || (step === 2 && !step2Valid)) && { opacity: 0.5 },
          ]}
        >
          {busy ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={s.navNextTxt}>
              {step === 1 ? "Continue" : step === 2 ? "Review" : "Create store"}
            </Text>
          )}
        </Pressable>
      </View>
    </Sheet>
  );
}

const s = StyleSheet.create({
  stepBody: { gap: tokens.space.md, marginTop: tokens.space.sm },
  gap: { gap: tokens.space.md },
  modeRow: {
    flexDirection: "row",
    backgroundColor: tokens.color.fill,
    borderRadius: tokens.radius.full,
    padding: 3,
    gap: 3,
  },
  modeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 40,
    borderRadius: tokens.radius.full,
  },
  modeBtnOn: { backgroundColor: tokens.color.brand, ...tokens.shadow.card },
  modeTxt: { color: tokens.color.ink3, fontFamily: tokens.font.sansMed, fontSize: tokens.size.xs },
  modeTxtOn: { color: tokens.color.surface, fontFamily: tokens.font.sansSemi },
  fieldWrap: { gap: 6 },
  label: {
    color: tokens.color.ink3,
    fontFamily: tokens.font.sansSemi,
    fontSize: tokens.size.eyebrow,
    letterSpacing: 0.4,
  },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: tokens.color.line,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.surface,
    paddingHorizontal: tokens.space.md,
    paddingVertical: 10,
    color: tokens.color.ink,
    fontFamily: tokens.font.sansMed,
    fontSize: tokens.size.sm,
  },
  mono: {
    fontFamily: tokens.font.mono,
    fontVariant: ["tabular-nums"],
  },
  warn: { color: tokens.color.amb, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.sm,
  },
  searchInput: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: tokens.color.line,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.surface,
    paddingHorizontal: tokens.space.md,
    color: tokens.color.ink,
    fontFamily: tokens.font.sansMed,
    fontSize: tokens.size.sm,
  },
  searchBtn: {
    width: 44,
    height: 44,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.brandWash,
    alignItems: "center",
    justifyContent: "center",
  },
  hint: {
    color: tokens.color.ink4,
    fontFamily: tokens.font.sans,
    fontSize: tokens.size.eyebrow,
    lineHeight: 16,
  },
  hits: { gap: tokens.space.xs },
  hitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.sm,
    minHeight: 52,
    paddingHorizontal: tokens.space.md,
    paddingVertical: tokens.space.sm,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.line,
    backgroundColor: tokens.color.surface,
  },
  hitRowOn: { borderColor: tokens.color.brand, backgroundColor: tokens.color.brandWash },
  hitMain: { flex: 1, minWidth: 0 },
  hitName: { color: tokens.color.ink, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm },
  hitSub: { color: tokens.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.xs, marginTop: 1 },
  picked: {
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.brand,
    backgroundColor: tokens.color.brandWash,
    padding: tokens.space.md,
  },
  pickedRow: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm },
  pickedMain: { flex: 1, minWidth: 0 },
  pickedName: { color: tokens.color.ink, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm },
  pickedSub: { color: tokens.color.ink2, fontFamily: tokens.font.sans, fontSize: tokens.size.xs, marginTop: 1 },
  pickedChange: { minHeight: 44, justifyContent: "center", paddingHorizontal: tokens.space.sm },
  pickedChangeTxt: { color: tokens.color.brand, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: tokens.space.sm },
  chip: {
    minHeight: 44,
    paddingHorizontal: tokens.space.md,
    borderRadius: tokens.radius.full,
    borderWidth: 1,
    borderColor: tokens.color.line,
    backgroundColor: tokens.color.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  chipOn: { backgroundColor: tokens.color.brand, borderColor: tokens.color.brand },
  chipTxt: { color: tokens.color.ink2, fontFamily: tokens.font.sansMed, fontSize: tokens.size.xs },
  chipTxtOn: { color: tokens.color.surface, fontFamily: tokens.font.sansSemi },
  routes: { gap: tokens.space.xs },
  routeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.sm,
    minHeight: 44,
    paddingHorizontal: tokens.space.md,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.line,
    backgroundColor: tokens.color.surface,
  },
  routeRowOn: { borderColor: tokens.color.brand, backgroundColor: tokens.color.brandWash },
  routeName: { flex: 1, color: tokens.color.ink, fontFamily: tokens.font.sansMed, fontSize: tokens.size.sm },
  routeNameOn: { color: tokens.color.brand, fontFamily: tokens.font.sansSemi },
  twoCol: { flexDirection: "row", gap: tokens.space.sm },
  twoColField: { flex: 1 },
  gpsBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: tokens.space.sm,
    minHeight: 44,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.line,
    backgroundColor: tokens.color.surface,
  },
  gpsBtnOn: { borderColor: tokens.color.grn, backgroundColor: tokens.color.grnWash },
  gpsTxt: { color: tokens.color.ink2, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
  gpsTxtOn: { color: tokens.color.grn },
  review: {
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.line,
    backgroundColor: tokens.color.surface,
    padding: tokens.space.md,
    gap: tokens.space.sm,
  },
  reviewRow: { gap: 2 },
  reviewLabel: {
    color: tokens.color.ink4,
    fontFamily: tokens.font.sansSemi,
    fontSize: tokens.size.eyebrow,
    letterSpacing: 0.4,
  },
  reviewVal: { color: tokens.color.ink, fontFamily: tokens.font.sansMed, fontSize: tokens.size.sm },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: tokens.space.lg,
  },
  navSpacer: { width: 76 },
  navBack: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 44,
    paddingHorizontal: tokens.space.sm,
  },
  navBackTxt: { color: tokens.color.ink2, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm },
  navNext: {
    minHeight: 44,
    paddingHorizontal: tokens.space.xl,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  navNextTxt: { color: tokens.color.surface, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm },
});
