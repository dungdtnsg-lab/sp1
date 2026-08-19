import type { ReactNode } from "react";

export function UserButton(): ReactNode {
  return null;
}

export function useCurrentUserState() {
  return { user: null, isPending: false };
}
