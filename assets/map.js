/* ==========================================================================
   map.js — schematic sea chart
   Positions are plotted from real latitude/longitude using an equirectangular
   projection. The shoreline is a simplified outline of the Barotac Viejo
   coast in Banate Bay; a production build would use cached offline tiles.
   ========================================================================== */

import { AREA_CENTERS } from './store.js';

const W = 720;
const H = 380;

const BOUNDS = { lat0: 10.985, lat1: 11.100, lng0: 122.855, lng1: 122.975 };

const COAST = [
  [11.100, 122.8780],
  [11.088, 122.8725],
  [11.076, 122.8790],
  [11.064, 122.8715],
  [11.052, 122.8835],
  [11.040, 122.8740],
  [11.028, 122.8855],
  [11.016, 122.8765],
  [11.004, 122.8820],
  [10.992, 122.8730],
  [10.985, 122.8760],
];

function px(lng, lat) {
  return {
    x: ((lng - BOUNDS.lng0) / (BOUNDS.lng1 - BOUNDS.lng0)) * W,
    y: ((BOUNDS.lat1 - lat) / (BOUNDS.lat1 - BOUNDS.lat0)) * H,
  };
}

function coastPath() {
  const points = COAST.map(([lat, lng]) => {
    const { x, y } = px(lng, lat);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const { x: leftTop } = px(BOUNDS.lng0, BOUNDS.lat1);
  const { x: leftBottom } = px(BOUNDS.lng0, BOUNDS.lat0);
  return `M ${leftTop.toFixed(1)},0 L ${points.join(' L ')} L ${leftBottom.toFixed(1)},${H} L ${leftTop.toFixed(1)},${H} Z`;
}

function grid() {
  const parts = [];
  for (let lng = 122.86; lng <= 122.97; lng += 0.02) {
    const { x } = px(lng, BOUNDS.lat0);
    parts.push(`<line x1="${x.toFixed(1)}" y1="0" x2="${x.toFixed(1)}" y2="${H}" stroke="#ffffff" stroke-opacity=".35" stroke-width="1"/>`);
    parts.push(`<text x="${(x + 4).toFixed(1)}" y="${H - 8}" fill="#2b5d7d" font-size="9" font-family="ui-monospace, monospace" opacity=".75">${lng.toFixed(2)}°E</text>`);
  }
  for (let lat = 11.00; lat <= 11.09; lat += 0.02) {
    const { y } = px(BOUNDS.lng0, lat);
    parts.push(`<line x1="0" y1="${y.toFixed(1)}" x2="${W}" y2="${y.toFixed(1)}" stroke="#ffffff" stroke-opacity=".35" stroke-width="1"/>`);
    parts.push(`<text x="8" y="${(y - 5).toFixed(1)}" fill="#2b5d7d" font-size="9" font-family="ui-monospace, monospace" opacity=".75">${lat.toFixed(2)}°N</text>`);
  }
  return parts.join('');
}

function tripPosition(trip, lastCheckin) {
  if (lastCheckin && typeof lastCheckin.lat === 'number') {
    return { lat: lastCheckin.lat, lng: lastCheckin.lng, fromFix: true };
  }
  const center = AREA_CENTERS[trip.area] || { lat: 11.03, lng: 122.9 };
  return { lat: center.lat, lng: center.lng, fromFix: false };
}

/**
 * Render the chart.
 * @param {HTMLElement} container
 * @param {object} opts { trips, stateOf, onSelect }
 */
export function renderChart(container, { trips, stateOf, onSelect }) {
  const markers = trips.map((trip, index) => {
    const pos = tripPosition(trip, trip.lastCheckin);
    const { x, y } = px(pos.lng, pos.lat);
    const state = stateOf(trip).key;
    const color = state === 'overdue' ? '#b42318' : state === 'grace' ? '#d99a06' : state === 'returned' ? '#64748b' : '#0e7490';

    const trail = (trip.trail || []).map((c) => {
      const p = px(c.lng, c.lat);
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    }).join(' ');

    return `
      <g class="boat ${state}" data-trip="${trip.id}">
        ${trail ? `<polyline points="${trail}" fill="none" stroke="${color}" stroke-opacity=".45" stroke-width="1.6" stroke-dasharray="4 3"/>` : ''}
        <circle class="halo" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="16" fill="${color}"/>
        <circle class="core" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6.5" fill="${color}" stroke="#fff" stroke-width="2"/>
        <text x="${(x + 11).toFixed(1)}" y="${(y + 4).toFixed(1)}">${trip.fisher.boat.replace('F/B ', '')}</text>
      </g>`;
  }).join('');

  const town = px(122.8695, 11.0575);

  container.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Schematic chart of fishing grounds with boat positions">
      <defs>
        <linearGradient id="sea" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#cfe4f0"/>
          <stop offset="100%" stop-color="#b9d8ea"/>
        </linearGradient>
        <pattern id="seine" width="26" height="26" patternUnits="userSpaceOnUse">
          <path d="M0 26 L26 0" stroke="#ffffff" stroke-opacity=".16" stroke-width="1"/>
        </pattern>
      </defs>

      <rect width="${W}" height="${H}" fill="url(#sea)"/>
      <rect width="${W}" height="${H}" fill="url(#seine)"/>
      ${grid()}

      <path d="${coastPath()}" fill="#e7e2d5" stroke="#c9c0ab" stroke-width="1.5"/>
      <path d="${coastPath()}" fill="none" stroke="#8aa2b3" stroke-width="1.5" stroke-dasharray="0"/>

      <text x="${px(122.864, 11.0).x.toFixed(1)}" y="${px(122.864, 11.0).y.toFixed(1)}" fill="#7a6f57" font-size="10.5" font-family="Georgia, serif" letter-spacing="1.5" transform="rotate(-90 ${px(122.864, 11.0).x.toFixed(1)} ${px(122.864, 11.0).y.toFixed(1)})">PANAY ISLAND</text>

      <text x="${px(122.905, 11.005).x.toFixed(1)}" y="${px(122.905, 11.005).y.toFixed(1)}" fill="#2b5d7d" font-size="11" font-family="Georgia, serif" letter-spacing="2" opacity=".8">BANATE BAY</text>
      <text x="${px(122.945, 11.088).x.toFixed(1)}" y="${px(122.945, 11.088).y.toFixed(1)}" fill="#2b5d7d" font-size="11" font-family="Georgia, serif" letter-spacing="2" opacity=".8">VISAYAN SEA</text>

      <g>
        <rect x="${(town.x - 3).toFixed(1)}" y="${(town.y - 3).toFixed(1)}" width="6" height="6" fill="#5c5343"/>
        <text x="${(town.x + 8).toFixed(1)}" y="${(town.y + 3).toFixed(1)}" fill="#5c5343" font-size="9.5" font-family="Georgia, serif">Barotac Viejo</text>
      </g>

      ${markers}

      <g transform="translate(${W - 96}, ${H - 46})">
        <line x1="0" y1="0" x2="60" y2="0" stroke="#2b5d7d" stroke-width="2"/>
        <line x1="0" y1="-4" x2="0" y2="4" stroke="#2b5d7d" stroke-width="2"/>
        <line x1="60" y1="-4" x2="60" y2="4" stroke="#2b5d7d" stroke-width="2"/>
        <text x="0" y="14" fill="#2b5d7d" font-size="9" font-family="ui-monospace, monospace">5 km</text>
      </g>

      <g transform="translate(24, 26)">
        <path d="M0 12 L6 0 L12 12 Z" fill="#2b5d7d"/>
        <text x="6" y="24" fill="#2b5d7d" font-size="9" text-anchor="middle" font-family="ui-monospace, monospace">N</text>
      </g>
    </svg>`;

  if (onSelect) {
    container.querySelectorAll('.boat').forEach((node) => {
      node.addEventListener('click', () => onSelect(node.getAttribute('data-trip')));
    });
  }
}
