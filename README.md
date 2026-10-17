# Controles internos

Aplicación empresarial para registros de INDUGEL, ANFO, mecha de seguridad, detonadores y control de sellos.

El frontend se publica mediante GitHub Pages. Los datos y las contraseñas no se almacenan en GitHub: permanecen en un archivo privado de Google Drive gestionado por un proyecto independiente de Google Apps Script.

Consulte `apps-script/README.md` para conectar el backend antes de utilizar la aplicación.

## Abrir la aplicación

[Control de Explosivos SK](https://controlesmineras.github.io/controles-varios-sk/)

## Orden del inventario

El botón **ORDEN ASCENDENTE / ORDEN DESCENDENTE** alterna la dirección de los criterios seleccionados (fecha de ingreso, fecha de traslado, fecha de vencimiento o serial). El segundo criterio resuelve los empates del primero; **AGREGAR CRITERIO** permite combinar dos criterios distintos. Los seriales se ordenan numéricamente y los valores sin fecha válida quedan al final en ambos sentidos.

Al elegir **Fecha de vencimiento** como primer criterio se activa el orden ascendente: vencidos primero, después los de vencimiento próximo y por último los más lejanos. Puede invertirse con el mismo botón de orden. Excel y PDF respetan los criterios y el orden visible.

En **Buscar y filtrar**, el selector de tipo de fecha permite mostrar solo ingresos, traslados o vencimientos de un día concreto; el día es opcional y puede limpiarse. Este filtro limita los resultados, mientras que los criterios solo cambian su posición. Para precintos se usa la fecha de la novedad.

## Revista por fecha

**PASAR REVISTA** muestra los checks y abre un borrador. Seleccione la fecha antes de marcar, busque los seriales y marque los encontrados; el filtro SIN CHECK muestra los pendientes dentro del material, ubicación y demás filtros actuales.

**FINALIZAR REVISTA** guarda los cambios. **CANCELAR REVISTA** descarta únicamente el borrador y conserva las marcas guardadas anteriormente. Entrar y salir sin cambiar checks no crea registros. Mientras haya cambios, finalice o cancele antes de cambiar la fecha o exportar. Si falla el almacenamiento, el borrador sigue abierto para reintentar; no se presenta como guardado.

Las marcas finalizadas se guardan en este dispositivo y usuario mediante IndexedDB, separadas de la verificación de entradas. Se conservan al recargar y pueden marcarse sin conexión con el inventario ya cargado. No se sincronizan entre dispositivos ni modifican las existencias; exporte el informe para conservarlo fuera del navegador. Los borradores no finalizados viven en la pestaña abierta; la app avisa al intentar recargar o cerrar con cambios. Excel y PDF incluyen la fecha y la marca (vacía si no se marcó).

## Sincronización y conexión intermitente

Los cambios de inventario se guardan primero en el dispositivo. Solo se retiran de pendientes con una confirmación válida del servidor. Los IDs de operación se conservan al reintentar, incluso si la respuesta se perdió después de guardar en el servidor.

Una sincronización recoge también los cambios añadidos durante el envío, hasta tres rondas por ejecución para no quedarse en un ciclo infinito. Si quedan cambios nuevos sin rechazos, continúa automáticamente. Ante errores de conexión, tiempos de espera o respuestas HTTP temporales, los pendientes se reintentan tras 5, 10, 20, 40 y hasta 60 segundos mientras la app esté visible y conectada. Volver a tener conexión también permite reintentar; siempre está disponible SINCRONIZAR.

Los errores de permisos, sesión, datos o confirmaciones inválidas conservan los pendientes y requieren revisión; no disparan reintentos automáticos continuos. No se amplían permisos ni se borran pendientes para ocultar errores. Las revistas son locales y no forman parte de esta cola.

Estas mejoras del cliente no requieren actualizar Apps Script. La sincronización central en lotes de 50 sigue requiriendo API 7, según `apps-script/README.md`; las versiones anteriores conservan su protocolo compatible.

## Verificación

Las pruebas usan datos simulados y no acceden al inventario de la empresa:

```sh
node tests/device-access.cjs
node tests/offline-session.cjs
node tests/synchronization.cjs
node tests/revista-order.cjs
```
