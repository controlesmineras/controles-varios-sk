# Backend empresarial sin hoja de cálculo

1. Abra `script.google.com` y cree un proyecto independiente llamado **CONTROL EXPLOSIVOS SK**.
2. Reemplace el contenido de `Code.gs` con el archivo de esta carpeta.
3. Ejecute una vez `configurarSistema` y autorice el proyecto.
4. El sistema creará automáticamente en Drive el archivo privado `control-explosivos-sk-central.json`.
5. Use **Implementar → Nueva implementación → Aplicación web**.
6. Configure **Ejecutar como: yo** y **Quién tiene acceso: cualquier persona**.
7. Copie la URL terminada en `/exec` y péguela en `public/config.js`.

El archivo JSON contiene los registros, usuarios, contraseñas cifradas y sesiones. No debe compartirse ni editarse manualmente. La primera persona que ingrese crea el administrador inicial; después, solo un administrador puede otorgar nuevos accesos.
