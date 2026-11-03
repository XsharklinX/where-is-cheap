import { defineConfig } from 'wxt';

const HOSTS = [
  'https://store.steampowered.com/*',
  'https://qknhp8tc3y-dsn.algolia.net/*',
  'https://www.eneba.com/*',
  'https://search.driffle.com/*',
  'https://open.er-api.com/*',
  'https://www.kinguin.net/*',
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
      permissions: ['storage', 'declarativeNetRequestWithHostAccess', 'alarms', 'notifications', 'scripting', ...(firefox ? [] : ['sidePanel'])],
      host_permissions: HOSTS,
      // C: «todas las páginas» solo se pide si activas la detección fuera de Steam.
      ...(firefox ? { optional_permissions: ['<all_urls>'] } : { optional_host_permissions: ['<all_urls>'] }),
      declarative_net_request: {
        rule_resources: [{ id: 'ig_referer', enabled: true, path: 'rules.json' }],
      },
      action: { default_title: 'Where is cheap' },
      commands: {
        'open-panel': { suggested_key: { default: 'Alt+W' }, description: 'Abrir el panel lateral de Where is cheap' },
      },
      web_accessible_resources: [{ resources: ['stores/*.png'], matches: ['<all_urls>'] }],
      ...(firefox
        ? { browser_specific_settings: { gecko: { id: 'where-is-cheap@sharky', data_collection_permissions: { required: ['none'], optional: ['websiteContent'] } } } }
        : {}),
    };
  },
});
