## Acceso local por dispositivo

Las cuentas quedan habilitadas para acceso local después de un ingreso central correcto en este dispositivo. Se guarda un verificador PBKDF2 con salt aleatorio, nunca la contraseña en texto. Los permisos y datos locales corresponden a la última validación disponible. El cierre de sesión conserva este acceso para ingresar de nuevo con la contraseña.

Los cambios se guardan primero en este dispositivo y se envían cuando hay conexión. El servidor conserva la autoridad para aceptar o rechazar cada operación. Una sesión central vencida puede requerir volver a ingresar para renovarla. Las revocaciones conocidas y las contraseñas rechazadas al validar se aplican localmente; un dispositivo desconectado no conoce cambios posteriores hasta reconectar. No se crea acceso local para cuentas nuevas sin confirmación central.

En Gestión de Personal, los reportes laborales y las entregas de cocina pendientes se separan por persona. No se eliminan si el servidor rechaza la operación, por ejemplo por vencimiento del plazo. Conserva el dispositivo hasta confirmar la sincronización.
