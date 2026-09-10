import { useEffect, useRef, useMemo } from "react";
import { View, Text, StyleSheet, useWindowDimensions } from "react-native";
import Animated, {
  cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming,
} from "react-native-reanimated";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { CameraOff } from "lucide-react-native";
import { EmptyState } from "@/components/EmptyState";
import { tokens } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeContext";

const DEBOUNCE_MS = 1500;
const BRACKET = 28;
const BRACKET_INSET = 24;

export function QrViewport({
  paused, resolving, onScan, resetKey,
}: {
  paused: boolean;
  resolving: boolean;
  onScan: (raw: string) => void;
  resetKey: number;
}) {
  const s = useStyles();
  const [permission, requestPermission] = useCameraPermissions();
  const lastScanRef = useRef(0);
  const { width } = useWindowDimensions();

  const side = Math.max(0, width - tokens.space.lg * 2);
  const lineRange = Math.max(0, side - BRACKET_INSET * 2 - 2);

  const lineY = useSharedValue(0);
  useEffect(() => {
    lineY.value = withRepeat(
      withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => {
      cancelAnimation(lineY);
      lineY.value = 0;
    };
  }, [lineY]);
  const lineStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: lineY.value * lineRange }],
  }));

  useEffect(() => {
    if (resetKey > 0) lastScanRef.current = 0;
  }, [resetKey]);

  function handleBarcode(res: BarcodeScanningResult) {
    if (paused) return;
    const now = Date.now();
    if (now - lastScanRef.current < DEBOUNCE_MS) return;
    lastScanRef.current = now;
    onScan(res.data);
  }

  if (!permission) {
    return <View style={[s.viewport, { height: side }]} />;
  }

  if (!permission.granted) {
    return (
      <View>
        <View style={[s.viewport, s.deniedBox, { height: side }]}>
          <EmptyState
            icon={CameraOff}
            title="Camera permission needed"
            message="Allow camera access to scan store QR codes."
            actionLabel="Retry"
            onAction={() => void requestPermission()}
          />
        </View>
        <StatusPill text="Point at the store QR code" />
      </View>
    );
  }

  return (
    <View>
      <View style={[s.viewport, { height: side }]}>
        <CameraView
          style={s.camera}
          active={!paused}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={handleBarcode}
        />
        <View style={[s.bracket, s.tl]} />
        <View style={[s.bracket, s.tr]} />
        <View style={[s.bracket, s.bl]} />
        <View style={[s.bracket, s.br]} />
        <Animated.View style={[s.scanLine, lineStyle]} />
      </View>
      <StatusPill text={resolving ? "Looking up store..." : "Point at the store QR code"} />
    </View>
  );
}

function StatusPill({ text }: { text: string }) {
  const s = useStyles();
  return (
    <View style={s.pillWrap}>
      <View style={s.pill}>
        <Text style={s.pillTxt}>{text}</Text>
      </View>
    </View>
  );
}

const useStyles = () => {
  const { palette } = useTheme();
  return useMemo(() => {
    const t = palette;
    return StyleSheet.create({
  viewport: {
    width: "100%",
    borderRadius: tokens.radius.lg,
    overflow: "hidden",
    backgroundColor: t.color.ink,
  },
  camera: { flex: 1 },
  deniedBox: {
    backgroundColor: t.color.surface,
    borderWidth: 1,
    borderColor: t.color.line,
    justifyContent: "center",
    paddingHorizontal: tokens.space.lg,
  },
  bracket: {
    position: "absolute",
    width: BRACKET,
    height: BRACKET,
    borderColor: t.color.brand,
  },
  tl: { top: BRACKET_INSET, left: BRACKET_INSET, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 12 },
  tr: { top: BRACKET_INSET, right: BRACKET_INSET, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 12 },
  bl: { bottom: BRACKET_INSET, left: BRACKET_INSET, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 12 },
  br: { bottom: BRACKET_INSET, right: BRACKET_INSET, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 12 },
  scanLine: {
    position: "absolute",
    left: BRACKET_INSET,
    right: BRACKET_INSET,
    top: BRACKET_INSET,
    height: 2,
    borderRadius: 1,
    backgroundColor: t.color.brand,
    opacity: 0.85,
  },
  pillWrap: { alignItems: "center", marginTop: tokens.space.md },
  pill: {
    backgroundColor: t.color.fill,
    borderWidth: 1,
    borderColor: t.color.line,
    borderRadius: tokens.radius.full,
    paddingHorizontal: tokens.space.md,
    paddingVertical: 6,
  },
  pillTxt: {
    color: t.color.ink3,
    fontFamily: tokens.font.sansMed,
    fontSize: tokens.size.xs,
  },
});
  }, [palette]);
};
