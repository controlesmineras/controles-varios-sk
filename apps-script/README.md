# Backend empresarial

1. Cree una hoja de cálculo vacía llamada **CONTROL EXPLOSIVOS SK**.
2. Abra **Extensiones → Apps Script**.
3. Reemplace el contenido de `Code.gs` con el archivo de esta carpeta.
4. Ejecute una vez `configurarSistema` y autorice el proyecto.
5. Use **Implementar → Nueva implementación → Aplicación web**.
6. Configure **Ejecutar como: yo** y **Quién tiene acceso: cualquier persona**. La información sigue protegida por el inicio de sesión de la aplicación.
7. Copie la URL terminada en `/exec` y péguela en `public/config.js`.

La primera vez que se abra la aplicación conectada, pedirá crear el administrador inicial. Esa operación queda bloqueada permanentemente después del primer usuario.
