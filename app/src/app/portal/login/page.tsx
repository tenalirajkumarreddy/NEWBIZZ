import { Suspense } from "react";
import { PortalLoginFlow } from "@/components/portal/PortalLoginFlow";

// Portal login — same phone-OTP mechanism as the internal app, but defaults to
// /portal after verify. A phone that is NOT an enabled customer_portal number
// will not produce a portal principal and the middleware bounces it.
export default function PortalLoginPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg p-6">
      <div className="w-full max-w-[380px]">
        <Suspense>
          <PortalLoginFlow />
        </Suspense>
      </div>
    </div>
  );
}