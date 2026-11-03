# Where is cheap

Extensión de navegador: en la ficha de un juego de Steam dice dónde sale más barato, con el precio final (comisiones incluidas) y si la clave activa en tu región. Un clic y estás en la tienda. Compara Instant Gaming, Eneba, Driffle y Kinguin con Steam.

## Probarla
**Chrome, Edge o Brave:** `npm install`, `npm run build`, abre `chrome://extensions`, activa el modo de desarrollador y pulsa **Cargar descomprimida** → `.output/chrome-mv3`.
**Firefox:** `npm run build:firefox`, abre `about:debugging` → Este Firefox → **Cargar complemento temporal** → `.output/firefox-mv2/manifest.json`.

Después: entra en store.steampowered.com con tu sesión iniciada y abre cualquier juego. Así lee tu lista de deseos y tu biblioteca.

## Qué hace
- **Franja en la ficha de Steam** con el mejor precio que activa en tu país y un panel con todas las ofertas, ordenadas por lo que pagas al final.
- **Ventana del icono y panel lateral** (Alt + W): Precios, Lista de deseos (límites y avisos) y Ahorro (compras confirmadas).
- **Historial y veredicto:** compra o espera, según lo visto y las próximas rebajas de Steam.
- **Avisos:** cada 6 h revisa tu lista de deseos y te avisa si algo baja de tu límite o mucho frente a Steam.
- **Carrito:** en el carrito de Steam, reparte los juegos entre tiendas para pagar lo mínimo.
- **Fuera de Steam (opcional):** en YouTube, Twitch, Wikipedia, Metacritic… aparece una etiqueta con el precio del juego de la página.
- **Ajustes:** forma de pago, moneda (USD y RD$), marketplaces, cuentas, cupones propios.

## Comprobar
- `npm run check` (tipos) y `npm test` (pruebas sin red).
- Con las tiendas de verdad (Git Bash): `LIVE=1 npx vitest run tests/live.test.ts`.

## Cómo está hecha
- `entrypoints/background.ts`: Steam, búsqueda en tiendas, caché de 30 min, historial, lista de deseos y alarmas, carrito, detección, insignia con el % de ahorro.
- `entrypoints/steam.content`, `cart.content`, `detect.content`: franja en la ficha, recuadro del carrito y etiqueta fuera de Steam (Shadow DOM).
- `entrypoints/popup`, `sidepanel`, `options` + `lib/app.ts`: ventana, panel lateral y ajustes.
- `lib/stores/*`: una por tienda. `lib/match.ts`: mismo juego y edición. `lib/region.ts`: qué activa en RD. `lib/fees.ts`: comisiones (estimadas). `lib/compare.ts`: orden, cupones, precios sospechosos y carrito. `lib/history.ts`: historial y veredicto. `lib/detect.ts`: nombres de juego en páginas. `lib/data.ts`: lo que se guarda en el navegador.
- `public/rules.json`: Referer que exige la búsqueda de Instant Gaming. `public/stores/`: logos de las tiendas.

Plan y estado: `PROGRESS.md`. Propuesta de diseño: `docs/propuesta.html`.
