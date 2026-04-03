"use client";

import { createContext, useContext, useState } from "react";

interface IncidentCtx {
  hasActiveIncident: boolean;
  setHasActiveIncident: (v: boolean) => void;
}

const Ctx = createContext<IncidentCtx>({
  hasActiveIncident: false,
  setHasActiveIncident: () => {},
});

export function IncidentProvider({ children }: { children: React.ReactNode }) {
  const [hasActiveIncident, setHasActiveIncident] = useState(false);
  return (
    <Ctx.Provider value={{ hasActiveIncident, setHasActiveIncident }}>
      {children}
    </Ctx.Provider>
  );
}

export function useIncidentContext() {
  return useContext(Ctx);
}
