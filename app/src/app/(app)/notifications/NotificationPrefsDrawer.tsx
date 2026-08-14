"use client";

import { useState } from "react";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { NotificationPrefsPanel } from "./NotificationPrefsPanel";
import type { NotifChannel } from "@/lib/actions/notifications";

// "Channel preferences" for the Notifications page. Opens the external-channel
// preference table in a right-side Drawer so attention stays on the inbox;
// the page never leaves the Notifications context.
export function NotificationPrefsDrawer({
  prefs,
}: {
  prefs: { category: string; channel: NotifChannel; enabled: boolean }[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Channel preferences
      </Button>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="External channel preferences"
        description="In-app notifications always fire here. Choose whether each event category also alerts you via WhatsApp, SMS or email."
        size="lg"
      >
        <NotificationPrefsPanel prefs={prefs} />
      </Drawer>
    </>
  );
}