import type { ReactNode } from "react";

import { LoginThemeLock } from "./login-theme-lock";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <LoginThemeLock />
      {children}
    </>
  );
}
