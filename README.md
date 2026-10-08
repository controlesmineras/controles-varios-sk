# Controles internos

Aplicación empresarial para registros de INDUGEL, ANFO, mecha de seguridad, detonadores y control de sellos.

El frontend se publica mediante GitHub Pages. Los datos y las contraseñas no se almacenan en GitHub: permanecen en una hoja de cálculo y un proyecto independiente de Google Apps Script.

Consulte `apps-script/README.md` para conectar el backend antes de utilizar la aplicación.

## Abrir la aplicación

[Control de Explosivos SK](https://controlesmineras.github.io/controles-varios-sk/)

## Revista por fecha

Cada registro tiene un check de revista. Seleccione la fecha, busque los seriales y marque los encontrados; el filtro SIN CHECK muestra los pendientes dentro del material, ubicación y demás filtros actuales. Excel y PDF incluyen la fecha y la marca (vacía si no se marcó).

Las marcas se guardan en este dispositivo y usuario mediante IndexedDB, separadas de la verificación de entradas. Se conservan al recargar y pueden marcarse sin conexión con el inventario ya cargado. No se sincronizan entre dispositivos ni modifican las existencias; exporte el informe para conservarlo fuera del navegador. No requiere actualizar Apps Script.
