# Control de Asistencia — Prado · Boston · Kids

Dashboard web para analizar la asistencia registrada por los huelleros y terminales Hikvision (gestionados con **iVMS-4200**) de las tres sedes: **Prado**, **Boston** y **Kids**.

Muestra asistencia, horarios de entrada y salida, horas extras, tardanzas, ausencias y marcaciones incompletas. Todo es interactivo y se puede descargar en **PDF**, **Excel** o **CSV**.

## Cómo usarlo

1. **Abrir el dashboard**
   - Opción A: abre `index.html` con doble clic. Funciona sin internet y sin instalar nada.
   - Opción B: entra a la versión publicada en GitHub Pages: `https://cdiazcastilla.github.io/biometrics/`. El flujo `.github/workflows/pages.yml` la publica en cada cambio a `main`. Si es la primera vez, activa *Settings → Pages → Source: GitHub Actions*.
2. **Exportar desde iVMS-4200**: *Control de acceso → Búsqueda de eventos* (o *Tiempo y asistencia → Registros originales*). Elige el dispositivo y las fechas, pulsa **Buscar** y luego **Exportar** (Excel o CSV).
3. **Cargar los archivos** en *Cargar datos*. Puedes arrastrarlos o seleccionarlos, y cargar varios a la vez. La sede se detecta sola si el nombre del archivo o del dispositivo contiene *prado*, *boston* o *kids*. Si no, la eliges en una lista.
4. Ajusta **horarios y reglas** en *Configuración*.

> Los datos se guardan solo en el navegador de ese computador (IndexedDB). No se suben a ningún servidor. Si cargas un periodo que ya habías cargado, las marcaciones repetidas se descartan.

## Qué incluye

| Sección | Contenido |
|---|---|
| **Resumen** | Indicadores (personas, % asistencia, % puntualidad, horas trabajadas, horas extras, tardanzas, incompletas, ausencias). Además: tendencia diaria por sede, estado de las jornadas, distribución de la hora de llegada, mapa de calor día × hora y comparativo entre sedes. |
| **Asistencia diaria** | Una fila por persona y día con entrada, salida, horario, horas trabajadas, tardanza, extras y estado. Se puede ordenar, filtrar por estado y exportar. |
| **Personas** | Indicadores de cada persona. Al hacer clic se abre su ficha: calendario, gráfica de entradas y salidas, detalle diario y **reporte individual en PDF o Excel**. |
| **Horas extras** | Horas extras por semana y sede, por área y un ranking por persona. |
| **Puntualidad** | Hora promedio de llegada, tardanzas por día de la semana y ranking de tardanzas. |
| **Novedades** | Ausencias, marcaciones incompletas y salidas anticipadas. |
| **Reportes** | Informe general, horas extras, puntualidad, novedades, asistencia detallada (para nómina), reportes individuales y marcaciones originales, en PDF, Excel o CSV. |

Los filtros de sede, periodo, área y búsqueda de persona aplican a todas las vistas y a los reportes.

## Reglas de cálculo (configurables)

- **Jornada**: la primera marcación del día es la entrada y la última es la salida. Si hay dos marcaciones con menos de *N* minutos de diferencia (doble huella), cuentan como una sola.
- **Tardanza**: la entrada es posterior a la hora de entrada más la tolerancia.
- **Salida anticipada**: la salida es anterior a la hora de salida menos la tolerancia.
- **Horas trabajadas**: salida − entrada. Se descuenta el almuerzo si la jornada supera el umbral configurado.
- **Horas extras**: tiempo después de la hora de salida, siempre que supere el mínimo configurado. En días no laborales y festivos, todo lo trabajado cuenta como extra. Opcionalmente se puede contar también la llegada anticipada.
- **Ausencia**: día laboral sin ninguna marcación, contado entre la primera y la última marcación conocida de la persona.
- **Incompleta**: día con una sola marcación.
- Horario por sede, días laborales, horario especial de sábado y festivos. Con un clic se agregan los festivos de Colombia.

Limitación: no maneja turnos nocturnos que crucen la medianoche.

## Formatos de archivo aceptados

`.xlsx`, `.xls`, `.csv` y `.txt`, con encabezados en español o inglés tal como los exporta iVMS-4200. Algunos ejemplos: *ID de empleado / Employee ID*, *Nombre / Name*, *Departamento / Department*, *Hora / Time*, *Fecha*, *Nombre del dispositivo / Device Name*, *Resultado de autenticación*.

- Las columnas se detectan solas y se pueden corregir a mano antes de importar.
- Se aceptan fecha y hora en una sola columna o en columnas separadas, con formato día/mes/año o mes/día/año.
- Los eventos fallidos (huella no reconocida, acceso denegado, desconocido) y las filas sin persona se descartan.

En `samples/` hay un ejemplo de exportación y una plantilla mínima.

## Descarga automática desde los equipos (opcional)

iVMS-4200 no ofrece una API pública, pero los equipos Hikvision sí tienen la API **ISAPI**. El script `tools/hik_export.py` (Python 3, sin dependencias) descarga las marcaciones directamente de cada equipo y genera un CSV listo para cargar:

```bash
python3 tools/hik_export.py --equipo prado=192.168.1.20 --equipo boston=192.168.2.20 --equipo kids=192.168.3.20 --usuario admin --clave "TU_CLAVE" --desde 2026-10-01 --hasta 2026-10-31
```

- Debe ejecutarse desde un PC que tenga acceso por red a los equipos, por ejemplo el mismo PC donde está iVMS-4200.
- El usuario y la clave son los del equipo, los mismos que usa iVMS-4200 para conectarse.
- Se puede programar con el Programador de tareas de Windows para generar el archivo cada semana.

## Estructura

```
index.html              Aplicación (abrir en el navegador)
assets/css/styles.css   Estilos (modo claro y oscuro)
assets/js/              util, store (IndexedDB), parser, engine (cálculos), charts, reports, demo, app
assets/vendor/          Chart.js, SheetJS, jsPDF, jsPDF-AutoTable (incluidas para funcionar sin internet)
tools/hik_export.py     Descarga de marcaciones vía ISAPI
samples/                Archivos de ejemplo
```
