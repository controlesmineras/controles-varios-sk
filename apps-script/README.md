# Backend empresarial sin hoja de cálculo

1. Abra `script.google.com` y cree un proyecto independiente llamado **CONTROL EXPLOSIVOS SK**.
2. Reemplace el contenido de `Code.gs` con el archivo de esta carpeta.
3. Ejecute una vez `configurarSistema` y autorice el proyecto.
4. El sistema creará automáticamente en Drive el archivo privado `control-explosivos-sk-central.json`.
5. Use **Implementar → Nueva implementación → Aplicación web**.
6. Configure **Ejecutar como: yo** y **Quién tiene acceso: cualquier persona**.
7. Copie la URL terminada en `/exec` y péguela en `public/config.js`.

El archivo JSON contiene los registros, usuarios, contraseñas cifradas y sesiones. No debe compartirse ni editarse manualmente. La primera persona que ingrese crea el administrador inicial; después, solo un administrador puede otorgar nuevos accesos.

## Precintos: participantes y directorio externo (API 6)

Actualizar `Code.gs` y editar la implementación activa para publicar una nueva versión conservando su URL. No ejecutar `configurarSistema` ni crear una base nueva.

El servidor de Explosivos consulta **solo lectura** de Personal en `sk-web-central.json`. Si el archivo no es accesible o hay más de uno, establecer `SK_PERSONAL_FILE_ID` en las propiedades del proyecto con el ID del archivo central correcto y conceder acceso de lectura a la cuenta que ejecuta la implementación. No se requiere modificar el servidor de SK Admin.

Los externos se guardan en `externalPeople` dentro de la base propia de Explosivos, por documento. Los precintos guardan copias de los participantes, fecha/hora de la novedad (Colombia), motivo y usuario autenticado que registra. Los registros antiguos y operaciones pendientes previas siguen admitidos; no se inventan participantes ni motivos históricos.
