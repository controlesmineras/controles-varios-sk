CREATE TABLE `anfo` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`fecha_ingreso` text NOT NULL,
	`fecha_movimiento` text NOT NULL,
	`ubicacion` text NOT NULL,
	`creado_en` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`serial` text NOT NULL,
	`fecha_fabricacion` text NOT NULL,
	`fecha_vencimiento` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_anfo_serial` ON `anfo` (`serial`);--> statement-breakpoint
CREATE TABLE `control_sellos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`fecha` text NOT NULL,
	`sello_indugel` integer NOT NULL,
	`sello_anfo` integer NOT NULL,
	`creado_en` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `detonadores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`fecha_ingreso` text NOT NULL,
	`fecha_movimiento` text NOT NULL,
	`ubicacion` text NOT NULL,
	`creado_en` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`caja_numero` text NOT NULL,
	`contenido` text NOT NULL,
	`lote_produccion` text NOT NULL,
	`fecha_produccion` text NOT NULL,
	`fecha_vencimiento` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_detonadores_caja_numero` ON `detonadores` (`caja_numero`);--> statement-breakpoint
CREATE TABLE `indugel` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`fecha_ingreso` text NOT NULL,
	`fecha_movimiento` text NOT NULL,
	`ubicacion` text NOT NULL,
	`creado_en` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`serial` text NOT NULL,
	`fecha_fabricacion` text NOT NULL,
	`fecha_vencimiento` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_indugel_serial` ON `indugel` (`serial`);--> statement-breakpoint
CREATE TABLE `mecha_seguridad` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`fecha_ingreso` text NOT NULL,
	`fecha_movimiento` text NOT NULL,
	`ubicacion` text NOT NULL,
	`creado_en` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`caja_numero` text NOT NULL,
	`cantidad` integer NOT NULL,
	`contenido` text NOT NULL,
	`fecha_fabricacion` text NOT NULL,
	`fecha_vencimiento` text NOT NULL,
	`bobina_1_inicial_1` integer NOT NULL,
	`bobina_1_final_1` integer NOT NULL,
	`bobina_1_inicial_2` integer,
	`bobina_1_final_2` integer,
	`bobina_2_inicial_1` integer NOT NULL,
	`bobina_2_final_1` integer NOT NULL,
	`bobina_2_inicial_2` integer,
	`bobina_2_final_2` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_mecha_caja_numero` ON `mecha_seguridad` (`caja_numero`);