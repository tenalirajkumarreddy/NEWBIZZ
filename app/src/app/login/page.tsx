import { Suspense } from "react";
import { AuthBrandPanel } from "./AuthBrandPanel";
import { LoginFlow } from "./LoginFlow";

// Split 50/50 auth screen. The brand panel collapses below md; the form column
// stays centered. Middleware bounces already-signed-in users away from here.
export default function LoginPage() {
  return (
    <div className="grid min-h-dvh grid-cols-1 md:grid-cols-2">
      <AuthBrandPanel />
      <Suspense>
        <LoginFlow />
      </Suspense>
    </div>
  );
}
