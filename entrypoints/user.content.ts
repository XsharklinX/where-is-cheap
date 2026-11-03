import { call } from '@/lib/api';
import { sessionFromDom } from '@/lib/steamUser';

// Q y E: en cualquier página de la tienda de Steam, pasa al background quién eres (tu ID y el token de la sesión de
// esta página) para que lea tu lista de deseos y tu biblioteca. El background decide si toca leer (como mucho cada 10 min).
export default defineContentScript({
  matches: ['https://store.steampowered.com/*'],
  runAt: 'document_idle',
  main() {
    const session = sessionFromDom(document);
    void call('syncUser', { session }).catch(() => {});
  },
});
