# 💸 MyApp Gastos

App web **simple, rápida e intuitiva** para registrar tus **ingresos y egresos** y entender en qué se va tu dinero.

## ✨ Funcionalidades

- **Registro en segundos**: botón flotante ＋ → elegís Egreso/Ingreso, monto, categoría (con un toque) y listo.
- **Resumen mensual**: balance del mes, balance acumulado, total de ingresos y egresos.
- **Gráficos**: dona de gastos por categoría y barras comparativas de los últimos 6 meses.
- **Movimientos agrupados por día**, con búsqueda, filtro por tipo y por categoría. Tocá un movimiento para editarlo o eliminarlo.
- **Categorías personalizables** (ícono emoji + color). Vienen 15 categorías precargadas.
- **Exportar a CSV** (abre directo en Excel / Google Sheets).
- **Multi-moneda** (ARS, USD, EUR, MXN, CLP, COP, PEN, UYU), **modo oscuro** y diseño **mobile-first** instalable como app (PWA).
- Atajos de teclado: `N` nuevo movimiento, `←` / `→` cambiar de mes.

## 🧱 Stack

| Capa | Tecnología |
|------|------------|
| Frontend | HTML + CSS + JavaScript (sin frameworks, sin build) |
| Backend | Node.js 22 + Express (API REST) |
| Base de datos | SQLite (módulo nativo `node:sqlite`, sin dependencias extra) |
| Tests | `node:test` |

## 🚀 Cómo usarla

Requisito: **Node.js 22.13 o superior**.

```bash
git clone https://github.com/ederorellano/MyApp_Gastos.git
cd MyApp_Gastos
npm install
npm start
```

Abrí <http://localhost:3000>. Los datos se guardan en `data/gastos.db`.

**En Windows** también podés hacer doble clic en **`Abrir Gastos.bat`**: instala lo necesario la primera vez, arranca la app y abre el navegador. Para tenerlo a mano: clic derecho → *Enviar a* → *Escritorio (crear acceso directo)*.

Otros comandos:

```bash
npm run dev   # recarga automática al editar
npm test      # ejecuta los tests de la API
```

Variables de entorno opcionales: `PORT` (por defecto `3000`) y `DB_FILE` (ruta de la base de datos).

## 🔌 API REST

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/transactions?month=AAAA-MM&type=&category_id=&q=` | Lista movimientos con filtros |
| POST | `/api/transactions` | Crea un movimiento `{ type, amount, date, category_id?, description? }` |
| PUT | `/api/transactions/:id` | Edita un movimiento |
| DELETE | `/api/transactions/:id` | Elimina un movimiento |
| GET | `/api/categories` | Lista categorías |
| POST | `/api/categories` | Crea categoría `{ name, type, icon?, color? }` |
| DELETE | `/api/categories/:id` | Elimina categoría (los movimientos quedan "Sin categoría") |
| GET | `/api/summary?month=AAAA-MM` | Totales, balance, gastos por categoría y tendencia de 6 meses |
| GET | `/api/export.csv` | Exporta movimientos (acepta los mismos filtros) |

`type` es `ingreso` o `egreso`.

## 📁 Estructura

```
├── public/          # Frontend (index.html, styles.css, app.js, PWA)
├── src/
│   ├── app.js       # Rutas de la API y validaciones
│   ├── db.js        # Esquema SQLite y categorías iniciales
│   └── server.js    # Punto de entrada
└── test/            # Tests de la API
```

## 📄 Licencia

MIT
