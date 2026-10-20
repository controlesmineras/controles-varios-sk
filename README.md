# Controles internos

Aplicación empresarial para registros de INDUGEL, ANFO, mecha de seguridad, detonadores y control de sellos.

El frontend se publica mediante GitHub Pages. Los datos y las contraseñas no se almacenan en GitHub: permanecen en un archivo privado de Google Drive gestionado por un proyecto independiente de Google Apps Script.

Consulte `apps-script/README.md` para conectar el backend antes de utilizar la aplicación.

## Abrir la aplicación

[Control de Explosivos SK](https://controlesmineras.github.io/controles-varios-sk/)

## Orden del inventario

Cada criterio es un botón con su nombre y una flecha a la derecha: **↑ ascendente** o **↓ descendente**. Al tocarlo se invierte solo ese criterio. Los criterios disponibles son fecha de ingreso, fecha de traslado, fecha de vencimiento y serial; se aplican de izquierda a derecha. Cada criterio posterior resuelve los empates de los anteriores.

**AGREGAR CRITERIO** añade un criterio distinto, siempre ascendente. El mismo menú permite quitar criterios. Se pueden combinar hasta los cuatro, sin repetirlos; al usar todos, el menú se llama **EDITAR CRITERIOS**. Por ejemplo: vencimiento ascendente y, para fechas iguales, serial descendente. Al retirar todos, se conserva el orden de carga hasta agregar otro criterio.

Con **Fecha de vencimiento ↑** como primer criterio aparecen los vencidos primero, después los de vencimiento próximo y por último los más lejanos. Las fechas ausentes o inválidas quedan al final en ambos sentidos. Los seriales se ordenan numéricamente. Excel y PDF conservan los criterios, el sentido individual de cada uno y el orden visible.

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

### Conteo de ingresos repetidos pendientes

Al recibir el inventario central, una copia local pendiente con el mismo serial (Indugel/ANFO) o número de caja (mecha/detonadores) y distinto ID no se suma como otra unidad. Se conserva el registro central con su ubicación e historial. El ingreso y los movimientos rechazados permanecen íntegros en pendientes con su aviso para revisión; no se borran, no se confirman automáticamente y no se trasladan a otro ID.

Un serial eliminado y reingresado correctamente conserva su nuevo ID; el archivo de eliminaciones no forma parte de las existencias. La tarjeta cuenta ingresos verificados y alterna cajas/barras en Indugel (154 barras por caja); la lista también puede incluir ingresos sin verificar según sus filtros. Este ajuste del conteo no requiere actualizar `Code.gs`.

## Verificación

Las pruebas usan datos simulados y no acceden al inventario de la empresa:

```sh
node tests/device-access.cjs
node tests/offline-session.cjs
node tests/synchronization.cjs
node tests/revista-order.cjs
```


## Revertir y recuperar inventario

El botón de eliminar seriales fue retirado. Los administradores disponen de **REVERTIR / RECUPERAR** para cancelar solicitudes antiguas de eliminación, recuperar registros desde su copia archivada y revertir el último traslado conservando serial e historial. Las correcciones requieren motivo y confirmación del servidor; no se aplican de forma optimista sobre el inventario local. Las reversiones rechazadas por cambios posteriores quedan auditadas sin bloquear futuros movimientos.

**Requiere actualizar el servidor existente a API 8:** ver [instrucciones de Apps Script](apps-script/README.md#correcciones-sin-retirar-seriales-api-8). Publicar el sitio por GitHub no actualiza automáticamente el proyecto de Google Apps Script.


## Pendiente: el documento ya pertenece a Personal de SK Admin

En el dispositivo que muestra el aviso, recargar la app y pulsar **SINCRONIZAR**. El motivo identifica nombre y documento y muestra **USAR PERSONA DE SK ADMIN**. Esta acción consulta el directorio central y exige una coincidencia única por documento antes de resolver las altas externas pendientes de esa persona en ese dispositivo. Funciona también con usuarios operadores.

Se conservan los precintos, sus participantes históricos, los seriales y los demás pendientes. Las solicitudes resueltas se archivan localmente con el usuario, la fecha y la persona confirmada; el buscador prioriza la ficha de SK Admin sobre una copia externa. Si falta conexión, el directorio no es accesible o hay datos ambiguos, el pendiente permanece y el mensaje indica qué revisar.

Este ajuste es de la app y funciona con el servidor de participantes existente (API 6 o posterior); no requiere otra modificación de `Code.gs`.
