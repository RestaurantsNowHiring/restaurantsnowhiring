"use client";

import { Suspense } from "react";
import EmployerWelcomePage from "../employer-welcome/page";

function CheckEmailContent() {
  return <EmployerWelcomePage />;
}

export default function CheckEmailPage() {
  return (
    <Suspense fallback={null}>
      <CheckEmailContent />
    </Suspense>
  );
}
