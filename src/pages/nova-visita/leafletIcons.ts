import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// O Leaflet resolve os ícones por caminho relativo ao CSS, o que o bundler
// quebra. Corrigir uma vez, num módulo importado por quem desenha mapa —
// estava no topo do `NovaVisita.tsx`, que já não rende mapa nenhum.
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});
