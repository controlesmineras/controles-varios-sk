import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const auditColumns = {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fechaIngreso: text("fecha_ingreso").notNull(),
  fechaMovimiento: text("fecha_movimiento").notNull(),
  ubicacion: text("ubicacion").notNull(),
  creadoEn: text("creado_en").notNull().default(sql`CURRENT_TIMESTAMP`),
};

export const indugel = sqliteTable("indugel", {
  ...auditColumns,
  serial: text("serial").notNull(),
  fechaFabricacion: text("fecha_fabricacion").notNull(),
  fechaVencimiento: text("fecha_vencimiento").notNull(),
}, (table) => [uniqueIndex("idx_indugel_serial").on(table.serial)]);

export const anfo = sqliteTable("anfo", {
  ...auditColumns,
  serial: text("serial").notNull(),
  fechaFabricacion: text("fecha_fabricacion").notNull(),
  fechaVencimiento: text("fecha_vencimiento").notNull(),
}, (table) => [uniqueIndex("idx_anfo_serial").on(table.serial)]);

export const mechaSeguridad = sqliteTable("mecha_seguridad", {
  ...auditColumns,
  cajaNumero: text("caja_numero").notNull(),
  cantidad: integer("cantidad").notNull(),
  contenido: text("contenido").notNull(),
  fechaFabricacion: text("fecha_fabricacion").notNull(),
  fechaVencimiento: text("fecha_vencimiento").notNull(),
  bobina1Inicial1: integer("bobina_1_inicial_1").notNull(),
  bobina1Final1: integer("bobina_1_final_1").notNull(),
  bobina1Inicial2: integer("bobina_1_inicial_2"),
  bobina1Final2: integer("bobina_1_final_2"),
  bobina2Inicial1: integer("bobina_2_inicial_1").notNull(),
  bobina2Final1: integer("bobina_2_final_1").notNull(),
  bobina2Inicial2: integer("bobina_2_inicial_2"),
  bobina2Final2: integer("bobina_2_final_2"),
}, (table) => [uniqueIndex("idx_mecha_caja_numero").on(table.cajaNumero)]);

export const detonadores = sqliteTable("detonadores", {
  ...auditColumns,
  cajaNumero: text("caja_numero").notNull(),
  contenido: text("contenido").notNull(),
  loteProduccion: text("lote_produccion").notNull(),
  fechaProduccion: text("fecha_produccion").notNull(),
  fechaVencimiento: text("fecha_vencimiento").notNull(),
}, (table) => [uniqueIndex("idx_detonadores_caja_numero").on(table.cajaNumero)]);

export const controlSellos = sqliteTable("control_sellos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fecha: text("fecha").notNull(),
  selloIndugel: integer("sello_indugel").notNull(),
  selloAnfo: integer("sello_anfo").notNull(),
  creadoEn: text("creado_en").notNull().default(sql`CURRENT_TIMESTAMP`),
});
