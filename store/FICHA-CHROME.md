# Where is cheap · ficha para la Chrome Web Store

Todo lo que pide el panel de desarrollador (https://chrome.google.com/webstore/devconsole), en el orden en que aparece.

## 1. Paquete

- Subir: `.output/where-is-cheap-1.0.0-chrome.zip` (se genera con `npm run zip`).

## 2. Ficha de la tienda («Store listing»)

**Nombre** (sale del manifiesto): Where is cheap

**Resumen** (del manifiesto, 132 caracteres máx.):
Dónde sale más barato el juego de Steam que tienes abierto, con el precio real y tu región.

**Descripción:**

¿Ese juego de Steam sale más barato en otra tienda? Where is cheap te lo dice en la misma ficha de Steam, sin buscar nada.

Abre cualquier juego en store.steampowered.com y verás, debajo del botón de compra, el mejor precio en Instant Gaming, Eneba, Driffle y Kinguin. Un clic y estás en la oferta.

LO QUE LA HACE DISTINTA
• Precio final, no el anunciado: suma la comisión de cada tienda según pagues con tarjeta o PayPal.
• Región comprobada: te dice si la clave activa en tu cuenta. Lo que no sirve en tu país sale tachado y al final.
• Sin trampas: las cuentas compartidas y los precios sospechosamente bajos se avisan y nunca salen primero.
• Misma edición: no confunde el juego con su DLC, su edición Deluxe o su secuela.
• Precio en dólares y en pesos dominicanos.

MÁS FUNCIONES
• ¿Compro o espero?: historial de precios y aviso de las próximas rebajas de Steam.
• Lista de deseos: lee tu lista de Steam, pones un precio límite y te avisa cuando baja.
• Carrito: reparte tu carrito de Steam entre tiendas para pagar lo mínimo.
• Panel lateral con Alt + W.
• Sabe qué juegos ya tienes y avisa si un DLC necesita el juego base.
• Tus cupones, restados del precio.
• Lo que llevas ahorrado frente a Steam.
• Opcional: también fuera de Steam, en tráileres, foros y reseñas.

PRIVACIDAD
Sin cuentas, sin anuncios y sin analítica. Todo se guarda en tu navegador. Solo se envía el nombre del juego a las tiendas para buscarlo.

De momento, las regiones están ajustadas para cuentas de Steam de República Dominicana. Las comisiones son estimadas y se indican como tales.

Where is cheap no está afiliada con Valve, Steam ni con las tiendas que compara.

**Categoría:** Compras (Shopping)
**Idioma:** Español

**Imágenes** (carpeta `store/`):

- Icono de la tienda 128×128: `public/icon/128.png`
- Capturas 1280×800: `1-ficha-steam.png`, `2-region.png`, `3-lista-deseos.png`, `4-carrito.png`, `5-fuera-de-steam.png`
- Tesela promocional pequeña 440×280: `tesela-440x280.png`

## 3. Prácticas de privacidad («Privacy practices»)

**Propósito único:**
Comparar el precio del juego de Steam que el usuario está viendo con tiendas de claves y llevarle a la oferta más barata que active en su región.

**Justificación de permisos:**

- `storage`: guardar en el navegador los ajustes, el historial de precios, la lista de deseos, los cupones y el ahorro confirmado.
- `alarms`: revisar cada 6 horas los precios de la lista de deseos para avisar de bajadas.
- `notifications`: avisar cuando un juego de la lista de deseos baja del precio que puso el usuario.
- `scripting`: registrar el script de detección fuera de Steam solo cuando el usuario la activa en los ajustes y concede el permiso.
- `sidePanel`: mostrar la comparación en el panel lateral (Alt + W).
- `declarativeNetRequestWithHostAccess`: la búsqueda pública de Instant Gaming solo responde a peticiones con la cabecera Referer de su web; una regla estática la añade únicamente a las peticiones a qknhp8tc3y-dsn.algolia.net.
- **Permisos de host:**
  - store.steampowered.com: leer el juego abierto, su precio en la región del usuario, su lista de deseos y biblioteca (con su sesión) y el carrito.
  - qknhp8tc3y-dsn.algolia.net (Instant Gaming), www.eneba.com, search.driffle.com, www.kinguin.net: buscar las ofertas del juego.
  - open.er-api.com: tipo de cambio USD → EUR y USD → DOP.
- **Permiso opcional `<all_urls>`:** solo se pide si el usuario activa «Detectar juegos en otras páginas» (desactivado por defecto). Se usa para reconocer el videojuego del que trata la página en webs de videojuegos, fichas de Wikipedia y páginas con datos de videojuego, y enseñar su precio.

**¿Usas código remoto?** No. Todo el código va en el paquete.

**Datos que recoge** (marcar):

- «Contenido del sitio web» (website content): solo si se activa la detección fuera de Steam, y solo en webs de videojuegos, fichas de videojuegos de Wikipedia y páginas con datos de videojuego (JSON-LD VideoGame, tarjeta de juego de YouTube, categoría de Twitch). Se envía a Steam el nombre del posible juego para identificarlo. En otras páginas no se lee ni se envía nada.
- Nada más. No se recoge información personal, de salud, financiera, de autenticación, comunicaciones, ubicación ni historial de navegación.

**Certificaciones** (marcar las tres):

- No vendo ni transfiero datos de usuarios a terceros, salvo en los casos de uso aprobados.
- No uso ni transfiero datos de usuarios para fines no relacionados con el propósito único.
- No uso ni transfiero datos de usuarios para determinar la solvencia o conceder préstamos.

**Política de privacidad (URL):** https://xsharklinx.github.io/where-is-cheap/privacy.html

## 4. Distribución

- Visibilidad recomendada para la primera subida: **No listada** (solo quien tenga el enlace). Cuando la pruebes unos días, pásala a Pública.
- Regiones: todas, o solo República Dominicana mientras las regiones estén ajustadas a RD.

## 5. Nota de la versión 1.0.0

**ES:** Primera versión. Compara el juego de Steam que tienes abierto con Instant Gaming, Eneba, Driffle y Kinguin: precio final con comisiones, si activa en tu región y precio en RD$. Además: historial y «¿compro o espero?», avisos de la lista de deseos, carrito más barato, panel lateral (Alt + W), juegos que ya tienes, cupones, ahorro acumulado y detección opcional fuera de Steam.

**EN:** First release. Compares the Steam game you're viewing with Instant Gaming, Eneba, Driffle and Kinguin: final price with fees, whether the key works in your region, and price in DOP. Also: price history and buy-or-wait advice, wishlist alerts, cheapest cart split, side panel (Alt + W), owned-games awareness, coupons, total savings and optional detection outside Steam.

## Pendiente antes de enviar

1. En el panel: verificar el correo de contacto del desarrollador.
