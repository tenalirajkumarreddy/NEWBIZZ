// Barrel export for the shared UI primitive library (locked design system).
// Import from "@/components/ui": import { Button, Panel, StatusBadge } from "@/components/ui";

export { Button, type ButtonProps } from "./Button";
export {
  Field,
  Input,
  Textarea,
  Select,
  LabeledInput,
  controlBase,
  type FieldProps,
  type InputProps,
  type TextareaProps,
  type SelectProps,
} from "./Field";
export { Card, Panel, SectionHeading, type PanelProps } from "./Card";
export { Badge, StatusBadge, type BadgeProps, type StatusBadgeProps } from "./Badge";
export { Table, THead, TBody, TR, TH, TD, type TRProps, type CellProps } from "./Table";
export { Skeleton, SkeletonText, SkeletonRows } from "./Skeleton";
export { EmptyState, type EmptyStateProps } from "./EmptyState";
export { ImageUpload } from "./ImageUpload";
export { InfoRow } from "./InfoRow";
export { Kpi } from "./Kpi";
export { Dialog, ConfirmDialog, type DialogProps, type ConfirmDialogProps } from "./Dialog";
export { Drawer, type DrawerProps } from "./Drawer";
export { ToastProvider, useToast } from "./Toast";
export { Money, Rupee } from "./Money";
export { ViewToggle, type ViewMode } from "./ViewToggle";
export { Toggle, type ToggleProps } from "./Toggle";
export { Tooltip, type TooltipProps } from "./Tooltip";
export { PageContainer, PageHeader, PAGE_WIDTH, type PageWidth } from "./Page";
export { useFormDirty, UnsavedGuard } from "./UnsavedGuard";
