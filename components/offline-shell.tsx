"use client";

import { useEffect, useState } from "react";

export function OfflineShell() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let previous = navigator.serviceWorker.controller;
    const changed = () => {
      if (previous && previous !== navigator.serviceWorker.controller) setUpdateAvailable(true);
      previous = navigator.serviceWorker.controller;
    };
    const prepare = () => {
      void navigator.serviceWorker.register("/controles-varios-sk/sw.js", { updateViaCache: "none" })
        .then(registration => registration.update()).catch(() => undefined);
    };
    navigator.serviceWorker.addEventListener("controllerchange", changed);
    window.addEventListener("online", prepare);
    prepare();
    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", changed);
      window.removeEventListener("online", prepare);
    };
  }, []);
  if (!updateAvailable) return null;
  return <div role="status" className="flex flex-wrap items-center justify-center gap-3 bg-amber-100 px-4 py-3 text-sm text-[#0d2c3e]">
    <span>Hay una actualización lista. Guarda lo que estés registrando antes de actualizar.</span>
    <button type="button" className="min-h-10 rounded-md bg-[#0d2c3e] px-4 font-semibold text-white" onClick={() => window.location.reload()}>ACTUALIZAR APP</button>
  </div>;
}
