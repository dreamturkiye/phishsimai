/**
 * OrgContext — provides the active organization ID to all pages.
 *
 * Priority order:
 * 1. MSP impersonation: if `msp_managed_org` is set in localStorage, use that orgId.
 * 2. Org switcher: if the user has multiple orgs, use the one selected in AppLayout.
 * 3. Default: the user's first org.
 *
 * Pages should use `useActiveOrg()` instead of manually reading `orgsData?.[0]?.org?.id`.
 */
import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

interface OrgContextValue {
  orgId: number | undefined;
  orgName: string | undefined;
  activeOrgIdx: number;
  setActiveOrgIdx: (idx: number) => void;
  isMspImpersonating: boolean;
  mspManagedOrg: { orgId: number; orgName: string } | null;
  clearMspImpersonation: () => void;
}

const OrgContext = createContext<OrgContextValue>({
  orgId: undefined,
  orgName: undefined,
  activeOrgIdx: 0,
  setActiveOrgIdx: () => {},
  isMspImpersonating: false,
  mspManagedOrg: null,
  clearMspImpersonation: () => {},
});

export function OrgProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  // Default to the persisted selection (shared key with AppLayout's switcher) so a
  // refresh restores the active org instead of snapping back to [0].
  const [activeOrgIdx, setActiveOrgIdxState] = useState<number>(() => {
    const saved = Number(localStorage.getItem("active_org_idx"));
    return Number.isInteger(saved) && saved >= 0 ? saved : 0;
  });
  const setActiveOrgIdx = (idx: number) => {
    setActiveOrgIdxState(idx);
    try { localStorage.setItem("active_org_idx", String(idx)); } catch { /* ignore */ }
  };
  const [mspManagedOrg, setMspManagedOrg] = useState<{ orgId: number; orgName: string } | null>(null);

  const { data: orgsData } = trpc.orgs.myOrgs.useQuery(undefined, { enabled: isAuthenticated });

  // Read MSP impersonation from localStorage on mount and on storage events
  useEffect(() => {
    const read = () => {
      try {
        const raw = localStorage.getItem("msp_managed_org");
        setMspManagedOrg(raw ? JSON.parse(raw) : null);
      } catch {
        setMspManagedOrg(null);
      }
    };
    read();
    window.addEventListener("storage", read);
    // Also poll every 500ms to catch same-tab changes
    const interval = setInterval(read, 500);
    return () => {
      window.removeEventListener("storage", read);
      clearInterval(interval);
    };
  }, []);

  const clearMspImpersonation = () => {
    localStorage.removeItem("msp_managed_org");
    setMspManagedOrg(null);
  };

  const isMspImpersonating = !!mspManagedOrg;

  // Determine active orgId
  let orgId: number | undefined;
  let orgName: string | undefined;

  if (isMspImpersonating && mspManagedOrg) {
    orgId = mspManagedOrg.orgId;
    orgName = mspManagedOrg.orgName;
  } else if (orgsData && orgsData.length > 0) {
    const idx = Math.min(activeOrgIdx, orgsData.length - 1);
    orgId = orgsData[idx]?.org?.id;
    orgName = orgsData[idx]?.org?.name;
  }

  return (
    <OrgContext.Provider value={{
      orgId,
      orgName,
      activeOrgIdx,
      setActiveOrgIdx,
      isMspImpersonating,
      mspManagedOrg,
      clearMspImpersonation,
    }}>
      {children}
    </OrgContext.Provider>
  );
}

export function useActiveOrg() {
  return useContext(OrgContext);
}
