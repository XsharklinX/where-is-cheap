import { defineConfig } from 'wxt';

const HOSTS = [
  'https://store.steampowered.com/*',
  // Q y E: lista de deseos y biblioteca por la API oficial, con el token de tu sesión.
  'https://api.steampowered.com/*',
  'https://qknhp8tc3y-dsn.algolia.net/*',
  'https://www.eneba.com/*',
  'https://search.driffle.com/*',
  'https://open.er-api.com/*',
  'https://www.kinguin.net/*',
  // 2: mínimo histórico de las tiendas oficiales.
  'https://www.cheapshark.com/*',
  // 5 (fase D): páginas de pedido donde detectamos la clave de Steam (Instant Gaming y Driffle se añaden ahora).
  'https://www.instant-gaming.com/*',
  'https://driffle.com/*',
  // 7 (fase D): juegos gratis de Epic.
  'https://store-site-backend-static.ak.epicgames.com/*',
];

export default defineConfig({
  hooks: {
    // El script de detección se registra al vuelo y solo con el permiso opcional: WXT añade <all_urls> como
    // obligatorio por su «matches», y aquí se quita para que siga siendo opcional.
    'build:manifestGenerated': (_wxt, manifest) => {
      const strip = (a?: string[]) => a?.filter((x) => x !== '<all_urls>');
      manifest.host_permissions = strip(manifest.host_permissions);
      manifest.permissions = strip(manifest.permissions as string[]) as typeof manifest.permissions;
    },
  },
  manifest: ({ browser }) => {
    const firefox = browser === 'firefox';
    return {
      name: 'Where is cheap',
      description: 'Dónde sale más barato el juego de Steam que tienes abierto, con el precio real y tu región.',
      // 4: system.cpu y system.memory para «¿Lo corre mi PC?» (Chrome no pide permiso al usuario por ellos; Firefox no los tiene).
      permissions: ['storage', 'declarativeNetRequestWithHostAccess', 'alarms', 'notifications', 'scripting', ...(firefox ? [] : ['sidePanel', 'system.cpu', 'system.memory'])],
      host_permissions: HOSTS,
      // C: «todas las páginas» solo se pide si activas la detección fuera de Steam.
      ...(firefox ? { optional_permissions: ['<all_urls>'] } : { optional_host_permissions: ['<all_urls>'] }),
      declarative_net_request: {
        rule_resources: [{ id: 'ig_referer', enabled: true, path: 'rules.json' }],
      },
      action: { default_title: 'Where is cheap' },
      // 11: escribe «wic» y el nombre del juego en la barra de direcciones.
      omnibox: { keyword: 'wic' },
      commands: {
        'open-panel': { suggested_key: { default: 'Alt+W' }, description: 'Abrir el panel lateral de Where is cheap' },
        [firefox ? '_execute_browser_action' : '_execute_action']: { suggested_key: { default: 'Alt+Shift+W' }, description: 'Abrir la ventana de Where is cheap' },
      },
      web_accessible_resources: [{ resources: ['stores/*.png'], matches: ['<all_urls>'] }],
      ...(firefox
        ? { browser_specific_settings: { gecko: { id: 'where-is-cheap@sharky', data_collection_permissions: { required: ['none'], optional: ['websiteContent'] } } } }
        : {}),
    };
  },
});
