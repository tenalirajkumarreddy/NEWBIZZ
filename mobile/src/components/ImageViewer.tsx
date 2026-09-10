import { useEffect, useState } from "react";
import { Modal, View, Text, Pressable, ScrollView, StyleSheet, Image, ActivityIndicator } from "react-native";
import { X } from "lucide-react-native";
import { imageSignedUrl } from "@/data/attachments";
import { tokens } from "@/theme/tokens";

interface Item {
  storage_bucket: string;
  storage_path: string;
}

/**
 * Full-screen receipt viewer: horizontal paging over signed image URLs.
 */
export function ImageViewer({
  visible, items, startIndex = 0, onClose,
}: {
  visible: boolean;
  items: Item[];
  startIndex?: number;
  onClose: () => void;
}) {
  const [urls, setUrls] = useState<(string | null)[]>([]);

  useEffect(() => {
    if (!visible) {
      setUrls([]);
      return;
    }
    let alive = true;
    setUrls(items.map(() => null));
    Promise.all(
      items.map((it) =>
        imageSignedUrl(it.storage_bucket, it.storage_path).catch(() => null),
      ),
    ).then((res) => {
      if (alive) setUrls(res);
    });
    return () => {
      alive = false;
    };
  }, [visible, items]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.wrap}>
        <View style={s.head}>
          <Text style={s.title}>Receipts</Text>
          <Pressable onPress={onClose} accessibilityLabel="Close viewer" hitSlop={10} style={s.close}>
            <X size={20} color="#ffffff" />
          </Pressable>
        </View>
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
          {items.map((it, i) => (
            <View key={`${it.storage_path}-${i}`} style={s.page}>
              {urls[i] ? (
                <Image source={{ uri: urls[i]! }} style={s.img} resizeMode="contain" />
              ) : (
                <ActivityIndicator color="#ffffff" />
              )}
            </View>
          ))}
        </ScrollView>
        {items.length > 1 ? (
          <Text style={s.count}>Swipe for more ({items.length})</Text>
        ) : null}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: "rgba(2,6,23,0.96)" },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: tokens.space.lg,
    paddingTop: 48,
    paddingBottom: tokens.space.md,
  },
  title: { color: "#ffffff", fontFamily: tokens.font.sansSemi, fontSize: tokens.size.sm },
  close: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  page: {
    width: 400,
    height: 640,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: tokens.space.md,
  },
  img: { width: "100%", height: "100%", borderRadius: tokens.radius.md },
  count: {
    color: "rgba(255,255,255,0.7)",
    fontFamily: tokens.font.sans,
    fontSize: tokens.size.eyebrow,
    textAlign: "center",
    paddingBottom: 24,
  },
});
