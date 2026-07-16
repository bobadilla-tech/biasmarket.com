import type { ReactNode } from "react";

export function Button({ children }: { children: ReactNode }) {
  return <button>{children}</button>;
}
