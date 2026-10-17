## Acceso local por dispositivo

Las cuentas quedan habilitadas para acceso local después de un ingreso central correcto en este dispositivo. Se guarda un verificador PBKDF2 con salt aleatorio, nunca la contraseña en texto. Los permisos y datos locales corresponden a la última validación disponible. El cierre de sesión conserva este acceso para ingresar de nuevo con la contraseña.

Los cambios se guardan primero en este dispositivo y se envían cuando hay conexión. El servidor conserva la autoridad para aceptar o rechazar cada operación. Una sesión central vencida puede requerir volver a ingresar para renovarla. Las revocaciones conocidas y las contraseñas rechazadas al validar se aplican localmente; un dispositivo desconectado no conoce cambios posteriores hasta reconectar. No se crea acceso local para cuentas nuevas sin confirmación central.

En Gestión de Personal, los reportes laborales y las entregas de cocina pendientes se separan por persona. No se eliminan si el servidor rechaza la operación, por ejemplo por vencimiento del plazo. Conserva el dispositivo hasta confirmar la sincronización.


## Arranque sin internet en Explosivos

La publicación prepara una copia completa de la app (pantalla de acceso, scripts, estilos, configuración y módulos de registro). Se descarga al abrirla con internet, incluso antes de iniciar sesión. La nueva versión solo se activa si se completó la descarga; conserva la anterior si falla.

Después de un inicio correcto, el dispositivo guarda la sesión y el verificador de la contraseña. Al cerrar y volver a abrir sin conexión, restaura la sesión activa y el inventario de la última sincronización. Si se cerró sesión expresamente, permite ingresar de nuevo con las credenciales ya validadas en ese dispositivo; no admite usuarios nuevos ni contraseñas incorrectas sin conexión.

En una instalación nueva, abre la app instalada con internet e inicia sesión una vez. No basta con haber ingresado desde otro navegador o dispositivo. Borrar los datos del navegador o de la app elimina sus copias locales.

GitHub Pages ejecuta `node scripts/build-offline-shell.mjs` después de `next build`. Si se compila manualmente, se debe ejecutar ese mismo paso antes de publicar `out/`. Las actualizaciones listas se anuncian con ACTUALIZAR APP, para poder guardar primero un registro que esté en edición.

## Confirmación de pendientes

Cada operación conserva su identificador hasta recibir una confirmación explícita y un inventario válido del servidor. Los cambios locales y su pendiente se guardan juntos. Al descargar datos se vuelven a aplicar los cambios todavía pendientes, incluidos los creados durante la sincronización.

La sincronización agrupa hasta cinco operaciones independientes por solicitud (máximo aproximado de 64 KiB), usando la API existente. Los ingresos por rangos, verificaciones por lote y cambios del directorio se envían por separado. Si un grupo es rechazado por validación, se reintenta individualmente con los mismos identificadores para aislar el error sin duplicar registros. Se aprovecha el inventario incluido en la confirmación, evitando descargarlo nuevamente al finalizar. Un rechazo de validación conserva el pendiente y muestra su motivo; los cambios independientes pueden continuar. Los cambios posteriores del mismo registro esperan su confirmación. Los errores de conexión, sesión o respuestas incompletas detienen el envío y conservan lo no confirmado. La fecha de sincronización completa solo se actualiza cuando no quedan pendientes.

Con internet, ingresar espera a que el servidor renueve la sesión. Sin conexión se mantiene el acceso local ya validado. La actualización no borra la base local ni necesita modificar Apps Script si ya está desplegada la API 6.
