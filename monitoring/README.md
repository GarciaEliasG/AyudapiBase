# Monitorización AyudAPI (Prometheus + Grafana)

Stack local para visualizar las métricas de negocio que expone
`src/app/api/metrics/route.ts`. Cada compañero lo levanta en su propia
máquina, contra su propio `npm run dev` — no comparten datos entre sí, pero
sí la misma configuración.

## Requisitos
Docker Desktop instalado y corriendo.

## 1. Levantá tu app Next.js
En la raíz del repo, en una terminal:
```bash
npm run dev
```
Dejala corriendo — Prometheus necesita algo respondiendo en
`localhost:3000/api/metrics` para poder scrapearlo.

## 2. Levantá el stack de monitorización
En otra terminal, parado en esta carpeta (`monitoring/`):
```bash
docker compose up -d
```
La primera vez descarga las imágenes de Prometheus y Grafana, puede tardar
un par de minutos.

## 3. Verificá que Prometheus vea tu app
Entrá a `http://localhost:9090/targets`. El job `ayudapi` debería aparecer
en verde, estado `UP`. Si dice `DOWN`, mirá el mensaje de error:
- *"server gave HTTP response to HTTPS client"* → revisá que `prometheus.yml`
  tenga `scheme: http` (no `https`) para uso local.
- *conexión rechazada* → confirmá que `npm run dev` esté corriendo y
  escuchando en el puerto 3000.

## 4. Configurá Grafana
1. Entrá a `http://localhost:3001` (usuario `admin`, la password del
   `docker-compose.yml` — cambiala ahí si no lo hiciste).
2. Connections → Data sources → Add data source → Prometheus.
3. URL: `http://prometheus:9090` (así se llaman entre sí los contenedores,
   por el nombre del servicio en el `docker-compose.yml`).
4. Save & test.
5. Dashboards → New dashboard → Add visualization → elegí la data source
   Prometheus, y usá cualquiera de estas métricas:
   - `ayudapi_incidentes_total`
   - `ayudapi_incidentes_resueltos`
   - `ayudapi_incidentes_en_curso`
   - `ayudapi_escaneos_total`
   - `ayudapi_qr_activos`
   - `ayudapi_atenciones_total`
   - `ayudapi_usuarios_activos`

## Si en algún momento se despliega contra el deploy real (Vercel)
En vez de apuntar a tu máquina local, se puede apuntar al dominio real de
Vercel. Editá `prometheus.yml` como indica el comentario ahí adentro
(cambiar `scheme` a `https` y el target al dominio real), y configurá la
variable `METRICS_TOKEN` en Vercel + en el `bearer_token` de este archivo
para proteger el endpoint.
