"use client";

import { useEffect, useRef, useState } from "react";
import { getLocal, setLocal } from "@/lib/offline-store";

type Marks = Record<string, string>;

export function todayInColombia() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  return ["year", "month", "day"].map(type => parts.find(part => part.type === type)!.value).join("-");
}

export function revistaRecordKey(material: string, record: Record<string, unknown>) {
  return JSON.stringify([material, String(record.id), String(record.ubicacion || "")]);
}

// A daily checklist on this device, separate from entry verification and inventory changes.
export function useRevista(user: string | undefined) {
  const [date, setDate] = useState(todayInColombia);
  const [loaded, setLoaded] = useState<{ key: string; marks: Marks } | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState("");
  const key = user && date ? `revista:${JSON.stringify([user, date])}` : "";
  const ready = Boolean(key && loaded?.key === key);
  const marks = ready ? loaded!.marks : {};

  useEffect(() => {
    let cancelled = false;
    setLoaded(null);
    setError("");
    if (key) getLocal<Marks>(key, {}).then(value => {
      if (!cancelled) setLoaded({ key, marks: value });
    }).catch(() => {
      if (!cancelled) setError("No se pudo cargar la revista de este dispositivo. Vuelve a abrir la app para reintentar.");
    });
    return () => { cancelled = true; };
  }, [key]);

  async function toggle(material: string, record: Record<string, unknown>, checked: boolean) {
    if (!ready || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    const next = { ...marks };
    const id = revistaRecordKey(material, record);
    if (checked) next[id] = new Date().toISOString();
    else delete next[id];
    try {
      await setLocal(key, next);
      setLoaded({ key, marks: next });
    } catch {
      setError("No se pudo guardar el check. Inténtalo de nuevo; la marca no se ha cambiado.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return { date, setDate, ready, saving, error, toggle, checked: (material: string, record: Record<string, unknown>) => Boolean(marks[revistaRecordKey(material, record)]) };
}
