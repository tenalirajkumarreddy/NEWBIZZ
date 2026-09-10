import { useCallback, useEffect, useState, useMemo } from "react";
import {
  View, Text, Pressable, Alert, StyleSheet, ScrollView, TextInput, Image, ActivityIndicator, Linking,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Toast from "react-native-toast-message";
import * as DocumentPicker from "expo-document-picker";
import {
  LogOut, Pencil, Check, X, Sun, Moon, Monitor,
  FileUp, FileText, ShieldCheck, Info, Trash2,
} from "lucide-react-native";
import { GradientHeader } from "@/components/GradientHeader";
import { HeaderRight } from "@/components/HeaderRight";
import { StatusBadge } from "@/components/StatusBadge";
import { useSession } from "@/lib/session";
import { roleLabel } from "@/lib/claims";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/rpc";
import { dateIST } from "@/lib/format";
import { googleLink, googleUnlink, googleIdentity } from "@/data/googleAuth";
import { tokens } from "@/theme/tokens";
import { useTheme, type ThemeMode } from "@/theme/ThemeContext";

const APP_VERSION = "NEWBIZZ v1.0.0";
const MAX_AVATAR_BYTES = 4 * 1024 * 1024;
const MAX_DOC_BYTES = 10 * 1024 * 1024;

export default function ProfileScreen() {
  const { palette: t, mode: theme, setMode: setThemePref } = useTheme();
  const { s } = useStyles();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { user, claims, signOut } = useSession();
  const [busy, setBusy] = useState(false);
  const uid = user?.id ?? "";

  // avatars live in the private documents bucket - resolve a short-lived
  // signed URL whenever the profile changes (effect placed after profile)
  const [avatarSignedUrl, setAvatarSignedUrl] = useState<string | null>(null);

  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const metaName = typeof meta.full_name === "string" ? meta.full_name : null;

  const profile = useQuery({
    queryKey: ["profile", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, full_name, phone, email, status, branch_id, avatar_url, created_at, branches:branch_id(name)")
        .eq("id", uid)
        .maybeSingle();
      if (error) throw error;
      const row = data as any;
      return {
        id: row?.id as string,
        full_name: row?.full_name as string | null,
        phone: row?.phone as string | null,
        email: row?.email as string | null,
        status: row?.status as string | null,
        avatarUrl: row?.avatar_url as string | null,
        createdAt: row?.created_at as string | null,
        branchName: (row?.branches?.name as string | undefined) ?? null,
      };
    },
  });

  const name = profile.data?.full_name ?? metaName ?? "Signed-in user";
  const phone = profile.data?.phone ?? (typeof meta.phone === "string" && meta.phone ? meta.phone : null) ?? user?.phone ?? null;
  const email = profile.data?.email ?? user?.email ?? null;

  // resolve a short-lived signed URL for the avatar whenever it changes
  useEffect(() => {
    const p = profile.data?.avatarUrl;
    if (!p) {
      setAvatarSignedUrl(null);
      return;
    }
    supabase.storage
      .from("documents")
      .createSignedUrl(p, 60 * 60)
      .then(({ data }) => setAvatarSignedUrl(((data as any)?.signedUrl as string) ?? null))
      .catch(() => setAvatarSignedUrl(null));
  }, [profile.data?.avatarUrl]);

  // ---- name edit ------------------------------------------------------
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  useEffect(() => {
    if (!editingName) setNameDraft(name);
  }, [editingName, name]);

  async function saveName() {
    if (busy) return;
    const v = nameDraft.trim();
    if (!v) {
      Toast.show({ type: "error", text1: "Name cannot be empty" });
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.from("users").update({ full_name: v, updated_at: new Date().toISOString() }).eq("id", uid);
      if (error) throw error;
      await supabase.auth.updateUser({ data: { full_name: v } }).catch(() => {});
      await qc.invalidateQueries({ queryKey: ["profile", uid] });
      Toast.show({ type: "success", text1: "Name updated" });
      setEditingName(false);
    } catch (e) {
      Toast.show({ type: "error", text1: "Could not update name", text2: friendlyError(e) });
    } finally {
      setBusy(false);
    }
  }

  // ---- avatar ---------------------------------------------------------
  async function pickAvatar() {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: "image/*",
        copyToCacheDirectory: true,
      });
      if (res.canceled || res.assets.length === 0) return;
      const asset = res.assets[0];
      if ((asset.size ?? 0) > MAX_AVATAR_BYTES) {
        Toast.show({ type: "error", text1: "Image too large", text2: "Pick an image under 4 MB" });
        return;
      }
      setBusy(true);
      const ext = (asset.name?.split(".").pop() ?? "jpg").toLowerCase();
      const path = `avatars/${uid}/${Date.now()}.${ext}`;
      const resp = await fetch(asset.uri);
      const blob = await resp.blob();
      const { error: upErr } = await supabase.storage
        .from("documents")
        .upload(path, blob, { contentType: asset.mimeType ?? "image/jpeg", upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = await supabase.storage.from("documents").createSignedUrl(path, 60 * 60);
      const { error: updErr } = await supabase
        .from("users")
        .update({ avatar_url: path, updated_at: new Date().toISOString() })
        .eq("id", uid);
      if (updErr) {
        // metadata write failed - don't leak the uploaded object
        await supabase.storage.from("documents").remove([path]).catch(() => {});
        throw updErr;
      }
      // replace: drop the previous avatar object
      const prevPath = profile.data?.avatarUrl;
      if (prevPath) await supabase.storage.from("documents").remove([prevPath]).catch(() => {});
      await qc.invalidateQueries({ queryKey: ["profile", uid] });
      setAvatarSignedUrl(((pub as any)?.signedUrl as string) ?? null);
      Toast.show({ type: "success", text1: "Photo updated" });
    } catch (e) {
      Toast.show({ type: "error", text1: "Could not upload photo", text2: friendlyError(e) });
    } finally {
      setBusy(false);
    }
  }

  // ---- documents ------------------------------------------------------
  const myDocs = useQuery({
    queryKey: ["myDocs", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("id, title, storage_bucket, storage_path, mime_type, size_bytes, created_at")
        .eq("uploaded_by", uid)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as {
        id: string;
        title: string;
        storage_bucket: string;
        storage_path: string;
        mime_type: string | null;
        size_bytes: number | null;
        created_at: string;
      }[];
    },
  });

  async function openDoc(row: { storage_bucket: string; storage_path: string }) {
    try {
      const { data, error } = await supabase.storage.from(row.storage_bucket).createSignedUrl(row.storage_path, 300);
      if (error || !(data as any)?.signedUrl) throw error ?? new Error("No signed URL");
      await Linking.openURL((data as any).signedUrl as string);
    } catch (e) {
      Toast.show({ type: "error", text1: "Could not open document", text2: friendlyError(e) });
    }
  }

  function deleteDoc(row: { id: string; title: string; storage_bucket: string; storage_path: string }) {
    Alert.alert("Delete document", `Delete "${row.title}"?`, [
      { text: "Keep", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void (async () => {
            setBusy(true);
            try {
              const { error } = await supabase.from("documents").delete().eq("id", row.id);
              if (error) throw error;
              await supabase.storage.from(row.storage_bucket).remove([row.storage_path]).catch(() => {});
              await qc.invalidateQueries({ queryKey: ["myDocs", uid] });
              Toast.show({ type: "success", text1: "Document deleted" });
            } catch (e) {
              Toast.show({ type: "error", text1: "Could not delete", text2: friendlyError(e) });
            } finally {
              setBusy(false);
            }
          })();
        },
      },
    ]);
  }

  function humanSize(bytes: number | null): string {
    if (!bytes || bytes <= 0) return "—";
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  async function uploadDoc() {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*"],
        copyToCacheDirectory: true,
      });
      if (res.canceled || res.assets.length === 0) return;
      const asset = res.assets[0];
      if ((asset.size ?? 0) > MAX_DOC_BYTES) {
        Toast.show({ type: "error", text1: "File too large", text2: "Limit is 10 MB (PDF or image)" });
        return;
      }
      setBusy(true);
      const ext = (asset.name?.split(".").pop() ?? "pdf").toLowerCase();
      const now = new Date();
      const path = `general/${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}/${uid}/${Date.now()}.${ext}`;
      const resp = await fetch(asset.uri);
      const blob = await resp.blob();
      const { error: upErr } = await supabase.storage
        .from("documents")
        .upload(path, blob, { contentType: asset.mimeType ?? "application/octet-stream", upsert: false });
      if (upErr) throw upErr;
      const { error: insErr } = await supabase.from("documents").insert({
        title: asset.name ?? "Document",
        storage_bucket: "documents",
        storage_path: path,
        mime_type: asset.mimeType ?? null,
        size_bytes: asset.size ?? null,
        entity_type: null,
        entity_id: null,
        tags: ["mobile"],
        visibility: "internal",
        uploaded_by: uid,
      });
      if (insErr) {
        await supabase.storage.from("documents").remove([path]).catch(() => {});
        throw insErr;
      }
      await qc.invalidateQueries({ queryKey: ["myDocs", uid] });
      Toast.show({ type: "success", text1: "Document uploaded" });
    } catch (e) {
      Toast.show({ type: "error", text1: "Could not upload document", text2: friendlyError(e) });
    } finally {
      setBusy(false);
    }
  }

  // ---- google link / unlink -------------------------------------------
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleState, setGoogleState] = useState<
    | { status: "loading" }
    | { status: "unlinked" }
    | { status: "linked"; email: string; identity: { provider: string; id: string; user_id: string; identity_id: string } }
  >({ status: "loading" });

  const refreshGoogle = useCallback(async () => {
    const info = await googleIdentity();
    setGoogleState(
      info.linked && info.identity
        ? { status: "linked", email: info.email ?? info.identity.id, identity: info.identity }
        : { status: "unlinked" },
    );
  }, []);

  useEffect(() => {
    if (uid) void refreshGoogle();
  }, [uid, refreshGoogle]);

  async function onLinkGoogle() {
    if (googleBusy) return;
    setGoogleBusy(true);
    try {
      const res = await googleLink();
      if (res.ok) {
        await refreshGoogle();
        Toast.show({ type: "success", text1: "Google linked", text2: "You can now sign in with Google" });
      } else if (res.error) {
        Toast.show({ type: "error", text1: "Could not link Google", text2: res.error });
      }
    } finally {
      setGoogleBusy(false);
    }
  }

  function onUnlinkGoogle() {
    if (googleState.status !== "linked") return;
    Alert.alert("Unlink Google", "Remove Google sign-in from this account?", [
      { text: "Keep", style: "cancel" },
      {
        text: "Unlink",
        style: "destructive",
        onPress: () => {
          void (async () => {
            if (googleBusy) return;
            setGoogleBusy(true);
            try {
              await googleUnlink(googleState.identity);
              await refreshGoogle();
              Toast.show({ type: "success", text1: "Google unlinked" });
            } catch (e) {
              Toast.show({ type: "error", text1: "Could not unlink Google", text2: friendlyError(e) });
            } finally {
              setGoogleBusy(false);
            }
          })();
        },
      },
    ]);
  }

  function onSignOut() {
    Alert.alert("Sign out", "Sign out of NEWBIZZ on this device?", [
      { text: "Stay", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: () => {
          void (async () => {
            if (busy) return;
            setBusy(true);
            try {
              await signOut();
              router.replace("/");
            } catch (e) {
              Toast.show({ type: "error", text1: "Could not sign out", text2: friendlyError(e) });
              setBusy(false);
            }
          })();
        },
      },
    ]);
  }

  const perms = claims.perms;
  const themeOpts: { key: ThemeMode; label: string; icon: typeof Sun }[] = [
    { key: "system", label: "System", icon: Monitor },
    { key: "light", label: "Light", icon: Sun },
    { key: "dark", label: "Dark", icon: Moon },
  ];

  return (
    <View style={s.root}>
      <GradientHeader
        title="Profile"
        subtitle={roleLabel(claims)}
        right={
          <Pressable
            onPress={() => router.back()}
            accessibilityLabel="Go back"
            style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.85 }]}
          >
            <Text style={s.backTxt}>Done</Text>
          </Pressable>
        }
      />
      <ScrollView style={s.flex} contentContainerStyle={[s.body, { paddingBottom: 48 + insets.bottom }]}>
        {busy ? (
          <View style={s.busyBar}>
            <ActivityIndicator size="small" color={t.color.brand} />
            <Text style={s.busyTxt}>Working...</Text>
          </View>
        ) : null}

        {/* ------- identity card ------- */}
        <View style={s.userCard}>
          <Pressable onPress={() => void pickAvatar()} accessibilityLabel="Change profile photo" disabled={busy}>
            {avatarSignedUrl ? (
              <Image
                source={{ uri: avatarSignedUrl }}
                style={s.avatarImg}
                onError={() => setAvatarSignedUrl(null)}
              />
            ) : (
              <View style={s.avatar}>
                <Text style={s.avatarTxt}>{initialsOf(name)}</Text>
              </View>
            )}
            <View style={s.avatarEdit}>
              <Pencil size={10} color="#ffffff" />
            </View>
          </Pressable>
          <View style={s.userMain}>
            {editingName ? (
              <View style={s.nameEditRow}>
                <TextInput
                  style={s.nameInput}
                  value={nameDraft}
                  onChangeText={setNameDraft}
                  placeholder="Full name"
                  placeholderTextColor={t.color.ink4}
                  maxLength={80}
                  autoFocus
                />
                <Pressable
                  onPress={() => void saveName()}
                  disabled={busy}
                  accessibilityLabel="Save name"
                  hitSlop={14}
                  style={s.iconHit}
                >
                  <Check size={18} color={t.color.grn} />
                </Pressable>
                <Pressable
                  onPress={() => setEditingName(false)}
                  accessibilityLabel="Cancel edit"
                  hitSlop={14}
                  style={s.iconHit}
                >
                  <X size={18} color={t.color.ink4} />
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => setEditingName(true)}
                accessibilityLabel="Edit name"
                style={({ pressed }) => [s.nameRow, pressed && { opacity: 0.8 }]}
              >
                <Text style={s.userName} numberOfLines={1}>{name}</Text>
                <Pencil size={13} color={t.color.ink4} />
              </Pressable>
            )}
            <Text style={s.userPhone}>{phone ?? "-"}</Text>
            {email ? <Text style={s.userEmail} numberOfLines={2}>{email}</Text> : null}
          </View>
        </View>

        {/* ------- details ------- */}
        <View style={s.card}>
          <Text style={s.cardTitle}>DETAILS</Text>
          <KV k="Phone" v={phone ?? "—"} />
          <KV k="Email" v={email ?? "—"} />
          <KV k="Branch" v={profile.data?.branchName ?? "—"} />
          <KV k="Status" v={profile.data?.status ?? claims.status ?? "—"} />
          <KV k="Member since" v={profile.data?.createdAt ? dateIST(profile.data.createdAt) : "—"} />
        </View>

        {/* ------- settings: theme ------- */}
        <View style={s.card}>
          <Text style={s.cardTitle}>APPEARANCE</Text>
          <View style={s.themeRow}>
            {themeOpts.map((o) => {
              const Icon = o.icon;
              const on = theme === o.key;
              return (
                <Pressable
                  key={o.key}
                  onPress={() => setThemePref(o.key)}
                  accessibilityLabel={`${o.label} theme`}
                  accessibilityState={{ selected: on }}
                  style={({ pressed }) => [s.themeBtn, on && s.themeBtnOn, pressed && { opacity: 0.85 }]}
                >
                  <Icon size={15} color={on ? "#ffffff" : t.color.ink3} />
                  <Text style={[s.themeTxt, on && s.themeTxtOn]}>{o.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={s.noteRow}>
            <Info size={12} color={t.color.ink4} />
            <Text style={s.noteTxt}>Applies instantly across the app — “System” follows your device setting.</Text>
          </View>
        </View>

        {/* ------- linked accounts (google) ------- */}
        <View style={s.card}>
          <Text style={s.cardTitle}>LINKED ACCOUNTS</Text>
          <View style={s.googleRow}>
            <View style={s.googleGlyphWrap}>
              <GoogleGlyphSmall />
            </View>
            <View style={s.googleMain}>
              <Text style={s.googleTitle} numberOfLines={1}>
                {googleState.status === "loading"
                  ? "Checking…"
                  : googleState.status === "linked"
                    ? googleState.email
                    : "Google not linked"}
              </Text>
              <Text style={s.googleSub}>
                {googleState.status === "linked"
                  ? "You can sign in with this Google account"
                  : "Link to also sign in with your Google email"}
              </Text>
            </View>
            {googleState.status === "linked" ? (
              <Pressable
                onPress={onUnlinkGoogle}
                disabled={busy || googleBusy}
                accessibilityRole="button"
                accessibilityLabel="Unlink Google account"
                style={({ pressed }) => [s.unlinkBtn, (pressed || busy || googleBusy) && { opacity: 0.7 }]}
              >
                <Text style={s.unlinkTxt}>Unlink</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => void onLinkGoogle()}
                disabled={busy || googleBusy}
                accessibilityRole="button"
                accessibilityLabel="Link Google account"
                style={({ pressed }) => [s.linkBtn, (pressed || busy || googleBusy) && { opacity: 0.8 }]}
              >
                {googleBusy ? (
                  <ActivityIndicator size="small" color={t.color.brand} />
                ) : (
                  <Text style={s.linkTxt}>Link</Text>
                )}
              </Pressable>
            )}
          </View>
        </View>

        {/* ------- my documents ------- */}
        <View style={s.card}>
          <View style={s.cardHead}>
            <Text style={s.cardTitle}>MY DOCUMENTS</Text>
            <Pressable
              onPress={() => void uploadDoc()}
              disabled={busy}
              accessibilityLabel="Upload document"
              style={({ pressed }) => [s.uploadBtn, (pressed || busy) && { opacity: 0.7 }]}
            >
              <FileUp size={13} color={t.color.brand} />
              <Text style={s.uploadTxt}>Upload</Text>
            </Pressable>
          </View>
          {myDocs.isLoading ? (
            <Text style={s.muted}>Loading…</Text>
          ) : myDocs.isError ? (
            <Text style={s.errText}>Could not load documents</Text>
          ) : (myDocs.data?.length ?? 0) === 0 ? (
            <Text style={s.muted}>PDFs or photos you upload (licence, ID, bills) appear here.</Text>
          ) : (
            <View style={s.docList}>
              {myDocs.data!.map((d) => (
                <View key={d.id} style={s.docRow}>
                  <Pressable
                    onPress={() => void openDoc(d)}
                    accessibilityLabel={`Open ${d.title}`}
                    style={({ pressed }) => [s.docMain, pressed && { opacity: 0.75 }]}
                  >
                    <View style={s.docRowInner}>
                      <FileText size={14} color={t.color.ink3} />
                      <View style={s.docText}>
                        <Text style={s.docTitle} numberOfLines={1}>{d.title}</Text>
                        <Text style={s.docMeta}>
                          {humanSize(d.size_bytes)} · {dateIST(d.created_at)}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                  <Pressable
                    onPress={() => deleteDoc(d)}
                    accessibilityLabel={`Delete ${d.title}`}
                    hitSlop={12}
                    style={({ pressed }) => [s.iconHit, pressed && { opacity: 0.6 }]}
                  >
                    <Trash2 size={15} color={t.color.red} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ------- access (roles + perms, read-only) ------- */}
        <View style={s.card}>
          <View style={s.cardHead}>
            <Text style={s.cardTitle}>ACCESS</Text>
            <View style={s.accessChip}>
              <ShieldCheck size={12} color={t.color.brand} />
              <Text style={s.accessTxt}>Managed by your manager</Text>
            </View>
          </View>
          <Text style={s.accessLabel}>ROLE</Text>
          <View style={s.chips}>
            {claims.roles.length === 0 ? (
              <Text style={s.muted}>No roles assigned</Text>
            ) : (
              claims.roles.map((role) => <StatusBadge key={role} label={role} tone="brand" dot />)
            )}
          </View>
          {perms.length > 0 ? (
            <>
              <Text style={[s.accessLabel, { marginTop: tokens.space.md }]}>PERMISSIONS ({perms.length})</Text>
              <View style={s.chips}>
                {perms.map((p) => (
                  <StatusBadge key={p} label={p} tone="neutral" />
                ))}
              </View>
            </>
          ) : null}
        </View>

        <Pressable
          onPress={onSignOut}
          disabled={busy}
          accessibilityLabel="Sign out"
          style={({ pressed }) => [s.signOut, (pressed || busy) && { opacity: 0.8 }]}
        >
          <LogOut size={16} color={t.color.red} />
          <Text style={s.signOutTxt}>Sign out</Text>
        </Pressable>

        <Text style={s.version}>{APP_VERSION}</Text>
      </ScrollView>
    </View>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  const { kv } = useStyles();
  return (
    <View style={kv.row}>
      <Text style={kv.k}>{k}</Text>
      <Text style={kv.v} numberOfLines={1}>{v}</Text>
    </View>
  );
}

const useStyles = () => {
  const { palette } = useTheme();
  return useMemo(() => {
    const t = palette;
    return {
      kv: StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 38,
    gap: tokens.space.md,
  },
  k: { color: t.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.xs },
  v: {
    color: t.color.ink,
    fontFamily: tokens.font.sansSemi,
    fontSize: tokens.size.xs,
    flexShrink: 1,
    textAlign: "right",
  },
}),
      s: StyleSheet.create({
  root: { flex: 1, backgroundColor: t.color.bg },
  flex: { flex: 1 },
  backBtn: {
    minHeight: 44,
    paddingHorizontal: tokens.space.sm,
    alignItems: "center",
    justifyContent: "center",
    margin: -tokens.space.sm,
  },
  backTxt: { color: "#ffffff", fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
  body: {
    paddingHorizontal: tokens.space.lg,
    paddingTop: tokens.space.lg,
    gap: tokens.space.md,
  },
  busyBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.sm,
    paddingVertical: tokens.space.xs,
  },
  busyTxt: { color: t.color.ink3, fontFamily: tokens.font.sans, fontSize: tokens.size.xs },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.md,
    backgroundColor: t.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: t.color.line,
    padding: tokens.space.md,
    ...t.shadow.card,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: t.color.brandWash,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImg: { width: 56, height: 56, borderRadius: 28 },
  avatarEdit: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: t.color.brand,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: t.color.surface,
  },
  avatarTxt: { color: t.color.brand, fontFamily: tokens.font.sansBold, fontSize: tokens.size.base },
  userMain: { flex: 1, minWidth: 0 },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.xs,
    minHeight: 30,
  },
  nameEditRow: { flexDirection: "row", alignItems: "center", gap: tokens.space.sm },
  nameInput: {
    flex: 1,
    minHeight: 40,
    borderWidth: 1,
    borderColor: t.color.line,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: tokens.space.sm,
    color: t.color.ink,
    fontFamily: tokens.font.sansSemi,
    fontSize: tokens.size.sm,
    backgroundColor: t.color.surface,
  },
  userName: { color: t.color.ink, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.base, flexShrink: 1 },
  userPhone: {
    color: t.color.ink3,
    fontFamily: tokens.font.mono,
    fontSize: tokens.size.xs,
    marginTop: 2,
    fontVariant: ["tabular-nums"],
  },
  userEmail: { color: t.color.ink4, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow, marginTop: 1 },
  card: {
    backgroundColor: t.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: t.color.line,
    padding: tokens.space.md,
    gap: tokens.space.xs,
    ...t.shadow.card,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: tokens.space.sm,
  },
  cardTitle: {
    color: t.color.ink4,
    fontFamily: tokens.font.sansSemi,
    fontSize: tokens.size.eyebrow,
    letterSpacing: 0.6,
    marginBottom: tokens.space.xs,
    flexShrink: 1,
  },
  themeRow: { flexDirection: "row", gap: tokens.space.sm },
  googleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.space.md,
    minHeight: 52,
  },
  googleGlyphWrap: {
    width: 36,
    height: 36,
    borderRadius: tokens.radius.md,
    backgroundColor: t.color.fill,
    alignItems: "center",
    justifyContent: "center",
  },
  googleMain: { flex: 1, minWidth: 0 },
  googleTitle: { color: t.color.ink, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
  googleSub: { color: t.color.ink4, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow, marginTop: 1 },
  linkBtn: {
    minHeight: 40,
    paddingHorizontal: tokens.space.md,
    borderRadius: tokens.radius.sm,
    backgroundColor: t.color.brandWash,
    alignItems: "center",
    justifyContent: "center",
  },
  linkTxt: { color: t.color.brand, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
  unlinkBtn: {
    minHeight: 40,
    paddingHorizontal: tokens.space.md,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: "rgba(220,38,38,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  unlinkTxt: { color: t.color.red, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
  themeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 44,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: t.color.line,
    backgroundColor: t.color.surface,
  },
  themeBtnOn: { backgroundColor: t.color.brand, borderColor: t.color.brand },
  themeTxt: { color: t.color.ink2, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
  themeTxtOn: { color: "#ffffff" },
  noteRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: tokens.space.xs },
  noteTxt: { flex: 1, color: t.color.ink4, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow, lineHeight: 15 },
  uploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minHeight: 44,
    paddingHorizontal: tokens.space.md,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: t.color.line,
    marginBottom: tokens.space.xs,
  },
  uploadTxt: { color: t.color.brand, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.xs },
  iconHit: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  docRow: { flexDirection: "row", alignItems: "center", minHeight: 48 },
  docRowInner: { flexDirection: "row", alignItems: "center", gap: tokens.space.md, flex: 1, minWidth: 0 },
  docText: { flex: 1, minWidth: 0 },
  docList: { gap: tokens.space.xs },
  docMain: { flex: 1, minWidth: 0 },
  docTitle: { color: t.color.ink, fontFamily: tokens.font.sansMed, fontSize: tokens.size.xs },
  docMeta: { color: t.color.ink4, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow, marginTop: 1 },
  accessChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: tokens.space.xs,
  },
  accessTxt: { color: t.color.ink4, fontFamily: tokens.font.sans, fontSize: tokens.size.eyebrow },
  accessLabel: {
    color: t.color.ink4,
    fontFamily: tokens.font.sansSemi,
    fontSize: tokens.size.eyebrow,
    letterSpacing: 0.6,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: tokens.space.xs, marginTop: tokens.space.xs },
  muted: { color: t.color.ink4, fontFamily: tokens.font.sans, fontSize: tokens.size.xs },
  errText: { color: t.color.red, fontFamily: tokens.font.sans, fontSize: tokens.size.xs },
  signOut: {
    minHeight: 48,
    borderRadius: tokens.radius.md,
    backgroundColor: t.color.redWash,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: tokens.space.sm,
    marginTop: tokens.space.sm,
  },
  signOutTxt: { color: t.color.red, fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm },
  version: {
    color: t.color.ink4,
    fontFamily: tokens.font.mono,
    fontSize: tokens.size.eyebrow,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
}),
    };
  }, [palette]);
};

function GoogleGlyphSmall() {
  return (
    <Svg width={18} height={18} viewBox="0 0 48 48">
      <Path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <Path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <Path
        fill="#FBBC05"
        d="M11.69 28.18c-.44-1.32-.69-2.73-.69-4.18s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <Path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.96 13.22l7.38 5.73C12.13 13.15 17.6 9.5 24 9.5z"
      />
    </Svg>
  );
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "U";
}


