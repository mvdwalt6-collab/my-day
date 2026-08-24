import { Suspense } from "react";

import OnboardingForm from "./OnboardingForm";

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="auth-shell" />}>
      <OnboardingForm />
    </Suspense>
  );
}
