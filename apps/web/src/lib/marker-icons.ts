// SVG data-URI marker icons for the job maps. Plain strings so they can be assigned to a
// google.maps Marker `icon` (or the @vis.gl <Marker icon>) without the Maps API being ready —
// no google.maps.Size/Point needed. Rendered as a centred rounded-square badge with a white
// outline, so anchoring on the point's centre reads correctly.

function badge(bg: string, glyphColor: string, glyph: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">` +
    `<rect x="2" y="2" width="32" height="32" rx="9" fill="${bg}" stroke="#ffffff" stroke-width="2"/>` +
    `<g transform="translate(6,6)" fill="none" stroke="${glyphColor}" stroke-width="2" ` +
    `stroke-linecap="round" stroke-linejoin="round">${glyph}</g>` +
    `</svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

// lucide "package" (box)
const BOX_GLYPH =
  '<path d="m7.5 4.27 9 5.15"/>' +
  '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>' +
  '<path d="M3.3 7 12 12l8.7-5"/>' +
  '<path d="M12 22V12"/>';

// lucide "car"
const CAR_GLYPH =
  '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/>' +
  '<circle cx="7" cy="17" r="2"/>' +
  '<path d="M9 17h6"/>' +
  '<circle cx="17" cy="17" r="2"/>';

/** Pickup point — yellow box. */
export const PICKUP_ICON = badge('#FACC15', '#1F2937', BOX_GLYPH);
/** Destination — green box. */
export const DEST_ICON = badge('#16A34A', '#ffffff', BOX_GLYPH);
/** Driver — blue car. */
export const DRIVER_ICON = badge('#2563EB', '#ffffff', CAR_GLYPH);
