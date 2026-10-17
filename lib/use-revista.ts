"use client";

import { useEffect, useRef, useState } from "react";
import { getLocal, updateLocal } from "@/lib/offline-store";

type Marks = Record<string, string>;
type Session = { user: string; changes: Record<string, string | null> };

export function todayInColombia() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  return ["year", "month", "day"].map(type => parts.find(part => part.type === type)!.value).join("-");
}

export function revistaRecordKey(material: string, record: Record<string, unknown>) {
  return JSON.stringify([material, String(record.id), String(record.ubicacion || "")]);
}

function applyChanges(marks: Marks, changes: Session["changes"]) {
  const next = { ...marks };
  for (const [id, value] of Object.entries(changes)) {
    if (value === null) delete next[id];
    else next[id] = value;
  }
  return next;
}

// A local daily checklist. Drafts never change saved marks until explicitly finished.
export function useRevista(user: string | undefined) {
  const [date, changeDate] = useState(todayInColombia);
  const [loaded, setLoaded] = useState<{ key: string; marks: Marks } | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState("");
  const key = user && date ? `revista:${JSON.stringify([user, date])}` : "";
  const contextRef = useRef(key);
  contextRef.current = key;
  const ready = Boolean(key && loaded?.key === key);
  const active = Boolean(user && session?.user === user);
  const dirty = active && Object.keys(session!.changes).length > 0;
  const marks = applyChanges(ready ? loaded!.marks : {}, active ? session!.changes : {});

  function changeSession(value: Session | null) { sessionRef.current = value; setSession(value); }

  useEffect(() => { changeSession(null); }, [user]);
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
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function begin() {
    if (!user || !ready || savingRef.current || active) return;
    setError(""); changeSession({ user, changes: {} });
  }
  function cancel() {
    if (savingRef.current) return;
    setError(""); changeSession(null);
  }
  function setDate(value: string) {
    if (savingRef.current || Object.keys(sessionRef.current?.changes || {}).length) return;
    changeDate(value);
  }
  function toggle(material: string, record: Record<string, unknown>, checked: boolean) {
    const current = sessionRef.current;
    if (!ready || !current || current.user !== user || savingRef.current) return;
    const id = revistaRecordKey(material, record), changes = { ...current.changes };
    if (Boolean(loaded!.marks[id]) === checked) delete changes[id];
    else changes[id] = checked ? new Date().toISOString() : null;
    changeSession({ ...current, changes }); setError("");
  }
  async function finish() {
    const current = sessionRef.current;
    if (!ready || !current || current.user !== user || savingRef.current) return false;
    savingRef.current = true; setSaving(true); setError("");
    try {
      if (Object.keys(current.changes).length) {
        const saved = await updateLocal<Marks>(key, {}, latest => applyChanges(latest, current.changes));
        if (contextRef.current === key) setLoaded({ key, marks: saved });
      }
      if (contextRef.current === key) changeSession(null);
      return true;
    } catch {
      if (contextRef.current === key) setError("No se pudo guardar la revista. El borrador sigue abierto; vuelve a pulsar FINALIZAR REVISTA.");
      return false;
    } finally { savingRef.current = false; setSaving(false); }
  }

  return { date, setDate, ready, active, dirty, saving, error, begin, cancel, finish, toggle,
    checked: (material: string, record: Record<string, unknown>) => Boolean(marks[revistaRecordKey(material, record)]) };
}
