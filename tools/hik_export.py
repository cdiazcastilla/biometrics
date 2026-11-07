#!/usr/bin/env python3
"""
Descarga las marcaciones directamente de los equipos Hikvision (huelleros /
terminales de control de acceso) usando la API ISAPI y genera un CSV listo para
cargar en el dashboard de asistencia.

iVMS-4200 no expone una API pública, pero los equipos sí: es la misma
información que ves en "Búsqueda de eventos" de iVMS-4200.

Requisitos: Python 3.8+ (no necesita librerías adicionales).
El equipo debe ser alcanzable por red desde el PC donde se ejecuta
(normalmente el mismo PC donde está iVMS-4200).

Ejemplos:

  # Un equipo, último mes
  python3 hik_export.py --equipo prado=192.168.1.20 --usuario admin --clave "MiClave" --dias 31

  # Las tres sedes en un solo archivo, rango de fechas
  python3 hik_export.py \
      --equipo prado=192.168.1.20 --equipo boston=192.168.2.20 --equipo kids=192.168.3.20 \
      --usuario admin --clave "MiClave" --desde 2026-10-01 --hasta 2026-10-31 \
      --salida marcaciones_octubre.csv

  La clave también puede ir en la variable de entorno HIK_PASSWORD.
"""
import argparse
import csv
import datetime as dt
import json
import os
import ssl
import sys
import urllib.error
import urllib.request
import uuid

SEDES = {"prado": "Sede Prado", "boston": "Sede Boston", "kids": "Sede Kids"}
PAGE = 30  # muchos equipos limitan a 30 resultados por página


def opener(host, user, password, insecure):
    pm = urllib.request.HTTPPasswordMgrWithDefaultRealm()
    pm.add_password(None, host, user, password)
    handlers = [urllib.request.HTTPDigestAuthHandler(pm), urllib.request.HTTPBasicAuthHandler(pm)]
    if insecure:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        handlers.append(urllib.request.HTTPSHandler(context=ctx))
    return urllib.request.build_opener(*handlers)


def fetch_events(base, op, start, end, tz, minor):
    search_id = uuid.uuid4().hex
    pos = 0
    while True:
        body = {
            "AcsEventCond": {
                "searchID": search_id,
                "searchResultPosition": pos,
                "maxResults": PAGE,
                "major": 5,          # 5 = eventos de control de acceso
                "minor": minor,      # 0 = todos los subtipos
                "startTime": start.strftime("%Y-%m-%dT%H:%M:%S") + tz,
                "endTime": end.strftime("%Y-%m-%dT%H:%M:%S") + tz,
            }
        }
        req = urllib.request.Request(
            base + "/ISAPI/AccessControl/AcsEvent?format=json",
            data=json.dumps(body).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with op.open(req, timeout=30) as r:
            data = json.loads(r.read().decode("utf-8", "replace"))
        ev = data.get("AcsEvent", {})
        items = ev.get("InfoList", []) or []
        for it in items:
            yield it
        status = ev.get("responseStatusStrg", "")
        pos += len(items)
        if status != "MORE" or not items:
            break


def main():
    ap = argparse.ArgumentParser(description="Exporta marcaciones de equipos Hikvision a CSV")
    ap.add_argument("--equipo", action="append", required=True, metavar="SEDE=IP[:PUERTO]",
                    help="sede (prado, boston o kids) y dirección del equipo. Repetible.")
    ap.add_argument("--usuario", default="admin")
    ap.add_argument("--clave", default=os.environ.get("HIK_PASSWORD"))
    ap.add_argument("--desde", help="AAAA-MM-DD (por defecto: según --dias)")
    ap.add_argument("--hasta", help="AAAA-MM-DD (por defecto: hoy)")
    ap.add_argument("--dias", type=int, default=31, help="días hacia atrás si no se indica --desde")
    ap.add_argument("--zona", default="-05:00", help="zona horaria del equipo (Colombia: -05:00)")
    ap.add_argument("--https", action="store_true", help="usar https en vez de http")
    ap.add_argument("--inseguro", action="store_true", help="no verificar certificado https")
    ap.add_argument("--minor", type=int, default=0, help="subtipo de evento (0 = todos)")
    ap.add_argument("--salida", default=None, help="archivo CSV de salida")
    a = ap.parse_args()

    if not a.clave:
        sys.exit("Falta la clave: use --clave o la variable HIK_PASSWORD")

    hasta = dt.datetime.strptime(a.hasta, "%Y-%m-%d") if a.hasta else dt.datetime.now()
    hasta = hasta.replace(hour=23, minute=59, second=59)
    desde = dt.datetime.strptime(a.desde, "%Y-%m-%d") if a.desde else (hasta - dt.timedelta(days=a.dias))
    desde = desde.replace(hour=0, minute=0, second=0)
    salida = a.salida or f"marcaciones_{desde:%Y-%m-%d}_a_{hasta:%Y-%m-%d}.csv"

    rows = []
    for eq in a.equipo:
        if "=" not in eq:
            sys.exit(f"Formato inválido '{eq}'. Use sede=ip, ej. prado=192.168.1.20")
        sede, host = eq.split("=", 1)
        sede = sede.strip().lower()
        if sede not in SEDES:
            sys.exit(f"Sede desconocida '{sede}'. Use: {', '.join(SEDES)}")
        base = ("https://" if a.https else "http://") + host.strip()
        op = opener(base, a.usuario, a.clave, a.inseguro)
        n = 0
        print(f"→ {SEDES[sede]} ({host}) …", end="", flush=True)
        try:
            # recorrer por semanas para no saturar el equipo
            cur = desde
            while cur <= hasta:
                fin = min(cur + dt.timedelta(days=7) - dt.timedelta(seconds=1), hasta)
                for it in fetch_events(base, op, cur, fin, a.zona, a.minor):
                    emp = it.get("employeeNoString") or it.get("employeeNo") or ""
                    if not emp:
                        continue  # eventos sin persona (puerta, alarmas, desconocidos)
                    t = (it.get("time") or "")[:19].replace("T", " ")
                    rows.append({
                        "ID de empleado": emp,
                        "Nombre": it.get("name", ""),
                        "Hora": t,
                        "Dispositivo": SEDES[sede],
                        "Estado": it.get("attendanceStatus", ""),
                        "Verificación": it.get("currentVerifyMode", ""),
                        "Evento": f"{it.get('major')}-{it.get('minor')}",
                    })
                    n += 1
                cur = fin + dt.timedelta(seconds=1)
            print(f" {n} marcaciones")
        except urllib.error.HTTPError as e:
            print(f" error HTTP {e.code}: revise usuario/clave o permisos ISAPI")
        except Exception as e:  # noqa: BLE001
            print(f" error: {e}")

    rows.sort(key=lambda r: (r["Dispositivo"], r["Hora"]))
    with open(salida, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=["ID de empleado", "Nombre", "Hora", "Dispositivo", "Estado", "Verificación", "Evento"])
        w.writeheader()
        w.writerows(rows)
    print(f"Listo: {len(rows)} marcaciones en {salida}")


if __name__ == "__main__":
    main()
