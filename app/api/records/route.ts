import { desc } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { anfo, controlSellos, detonadores, indugel, mechaSeguridad } from "@/db/schema";

const locations = new Set(["Polvorín superficie", "Polvorín interior de mina"]);

function requiredString(body: Record<string, unknown>, key: string) {
  const value = String(body[key] ?? "").trim();
  if (!value) throw new Error(`El campo ${key} es obligatorio.`);
  return value;
}

function requiredNumber(body: Record<string, unknown>, key: string) {
  const value = Number(body[key]);
  if (!Number.isFinite(value)) throw new Error(`El campo ${key} debe ser numérico.`);
  return value;
}

function optionalNumber(body: Record<string, unknown>, key: string) {
  if (body[key] === "" || body[key] === null || body[key] === undefined) return null;
  return requiredNumber(body, key);
}

function common(body: Record<string, unknown>) {
  const ubicacion = requiredString(body, "ubicacion");
  if (!locations.has(ubicacion)) throw new Error("La ubicación seleccionada no es válida.");
  return {
    fechaIngreso: requiredString(body, "fechaIngreso"),
    fechaMovimiento: requiredString(body, "fechaMovimiento"),
    ubicacion,
  };
}

function validateRange(start: number | null, end: number | null, label: string, optional = false) {
  if (optional && start === null && end === null) return;
  if (start === null || end === null) throw new Error(`${label} debe tener serial inicial y final.`);
  if (end < start) throw new Error(`El serial final de ${label} no puede ser menor que el inicial.`);
}

export async function GET() {
  const db = getDb();
  const [i, a, m, d, s] = await Promise.all([
    db.select().from(indugel).orderBy(desc(indugel.id)).limit(100),
    db.select().from(anfo).orderBy(desc(anfo.id)).limit(100),
    db.select().from(mechaSeguridad).orderBy(desc(mechaSeguridad.id)).limit(100),
    db.select().from(detonadores).orderBy(desc(detonadores.id)).limit(100),
    db.select().from(controlSellos).orderBy(desc(controlSellos.id)).limit(100),
  ]);
  return NextResponse.json({ INDUGEL: i, ANFO: a, "MECHA DE SEGURIDAD": m, DETONADORES: d, SELLOS: s });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const tipo = requiredString(body, "tipo");
    const db = getDb();

    if (tipo === "INDUGEL" || tipo === "ANFO") {
      const values = {
        ...common(body),
        serial: requiredString(body, "serial"),
        fechaFabricacion: requiredString(body, "fechaFabricacion"),
        fechaVencimiento: requiredString(body, "fechaVencimiento"),
      };
      tipo === "INDUGEL" ? await db.insert(indugel).values(values) : await db.insert(anfo).values(values);
    } else if (tipo === "DETONADORES") {
      await db.insert(detonadores).values({
        ...common(body),
        cajaNumero: requiredString(body, "cajaNumero"),
        contenido: requiredString(body, "contenido"),
        loteProduccion: requiredString(body, "loteProduccion"),
        fechaProduccion: requiredString(body, "fechaProduccion"),
        fechaVencimiento: requiredString(body, "fechaVencimiento"),
      });
    } else if (tipo === "MECHA DE SEGURIDAD") {
      const ranges = {
        bobina1Inicial1: requiredNumber(body, "bobina1Inicial1"), bobina1Final1: requiredNumber(body, "bobina1Final1"),
        bobina1Inicial2: optionalNumber(body, "bobina1Inicial2"), bobina1Final2: optionalNumber(body, "bobina1Final2"),
        bobina2Inicial1: requiredNumber(body, "bobina2Inicial1"), bobina2Final1: requiredNumber(body, "bobina2Final1"),
        bobina2Inicial2: optionalNumber(body, "bobina2Inicial2"), bobina2Final2: optionalNumber(body, "bobina2Final2"),
      };
      validateRange(ranges.bobina1Inicial1, ranges.bobina1Final1, "Bobina 1 · intervalo 1");
      validateRange(ranges.bobina1Inicial2, ranges.bobina1Final2, "Bobina 1 · intervalo 2", true);
      validateRange(ranges.bobina2Inicial1, ranges.bobina2Final1, "Bobina 2 · intervalo 1");
      validateRange(ranges.bobina2Inicial2, ranges.bobina2Final2, "Bobina 2 · intervalo 2", true);
      await db.insert(mechaSeguridad).values({
        ...common(body), ...ranges,
        cajaNumero: requiredString(body, "cajaNumero"),
        cantidad: requiredNumber(body, "cantidad"),
        contenido: requiredString(body, "contenido"),
        fechaFabricacion: requiredString(body, "fechaFabricacion"),
        fechaVencimiento: requiredString(body, "fechaVencimiento"),
      });
    } else if (tipo === "SELLOS") {
      await db.insert(controlSellos).values({
        fecha: requiredString(body, "fecha"),
        selloIndugel: requiredNumber(body, "selloIndugel"),
        selloAnfo: requiredNumber(body, "selloAnfo"),
      });
    } else {
      throw new Error("Tipo de registro no reconocido.");
    }

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo guardar el registro.";
    const duplicate = /unique/i.test(message);
    return NextResponse.json({ error: duplicate ? "Ya existe un registro con ese serial o número de caja." : message }, { status: 400 });
  }
}
