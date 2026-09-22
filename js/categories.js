// Every feature belongs to exactly one category. Colour, glyph and the natural geometry
// (point / line / area / none) live here so the map, forms, list and layers panel agree.
// Glyphs are 24x24 SVG paths, drawn to read at 14 px inside a coloured disc. Hand-authored
// rather than taken from an icon set: they are filled shapes on a disc, where the usual sets
// are stroked outlines, and vendoring one for a dozen glyphs is not worth the weight.
export const CATEGORIES = [
  { id: "trees",      name: "Trees & plants",  color: "#3e8a3a", geom: "point",
    glyph: "M12 2c-2 0-3.8 1.1-4.7 2.8-.3-.1-.6-.1-.9-.1C4.5 4.7 3 6.3 3 8.2c0 1.1.5 2.1 1.3 2.8-.2.5-.3 1-.3 1.5 0 1.9 1.5 3.4 3.4 3.4h3.4L10.5 22h3l-.3-6.1h3.4c1.9 0 3.4-1.5 3.4-3.4 0-.5-.1-1-.3-1.5.8-.7 1.3-1.7 1.3-2.8 0-1.9-1.5-3.5-3.4-3.5-.3 0-.6 0-.9.1C15.8 3.1 14 2 12 2z" },
  { id: "water",      name: "Water",           color: "#2f7fd0", geom: "point",
    glyph: "M12 2.5S5.5 10 5.5 14.5a6.5 6.5 0 0 0 13 0C18.5 10 12 2.5 12 2.5z" },
  { id: "structures", name: "Structures",      color: "#7a6f60", geom: "area",
    glyph: "M3 11 12 3l9 8h-2v9h-5v-6h-4v6H5v-9z" },
  { id: "fences",     name: "Fences",          color: "#8a4b1e", geom: "line",
    glyph: "M4 4h3v16H4zM10.5 4h3v16h-3zM17 4h3v16h-3zM2 8h20v2H2zM2 14h20v2H2z" },
  { id: "paddocks",   name: "Paddocks",        color: "#b8962e", geom: "area",
    glyph: "M3.2 4.6c1.9 0 3.5.8 4.6 2.1C8.9 6.2 10.4 5.9 12 5.9s3.1.3 4.2.8c1.1-1.3 2.7-2.1 4.6-2.1.3 0 .5.3.4.6-.3 1.5-1.1 2.8-2.2 3.6.2.7.3 1.4.3 2.2 0 4-2.7 7.1-7.3 7.1s-7.3-3.1-7.3-7.1c0-.8.1-1.5.3-2.2C3.9 7.9 3.1 6.6 2.8 5.2c-.1-.3.1-.6.4-.6zM9.2 10a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6zm5.6 0a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6z" },
  { id: "growing",    name: "Growing areas",   color: "#5aa24a", geom: "area",
    glyph: "M8.8 1.8h6.4V4h-2.1v8.6h4.3v4.2c0 2.5-2 4.6-5.4 5.4-3.4-.8-5.4-2.9-5.4-5.4v-4.2h4.3V4H8.8z" },
  { id: "access",     name: "Access & yard",   color: "#d9782a", geom: "point",
    glyph: "M1.8 3.6h2.6v16.8H1.8zM19.6 3.6h2.6v16.8h-2.6zM4.8 6h14.4v2.6H4.8zM4.8 15.4h14.4V18H4.8zM5.4 14.9 18.4 7l1.3 2.2L6.7 17.1z" },
  { id: "vegetation", name: "Vegetation",      color: "#6e9a5b", geom: "line",
    glyph: "M12 3c-2 4-6 6-6 11a6 6 0 0 0 12 0c0-5-4-7-6-11zm0 16a4 4 0 0 1-4-4c0-3 2-5 4-8 2 3 4 5 4 8a4 4 0 0 1-4 4z" },
  { id: "other",      name: "Other",           color: "#7b6fa8", geom: "point",
    glyph: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm0 3a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm-1.5 5h3v5h-3z" },
  { id: "pets",       name: "Pets",            color: "#c25b8a", geom: "none",
    glyph: "M6 9a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm12 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM9 4a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm6 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM12 11c3 0 6 2.5 6 5.5S16 20 12 20s-6-.5-6-3.5S9 11 12 11z" },
  { id: "livestock",  name: "Livestock",       color: "#a0522d", geom: "none",
    glyph: "M4 6c2 0 3 2 3 3h10c0-1 1-3 3-3v3c-1 0-2 1-2 2v5h-3v-3h-6v3H6v-5c0-1-1-2-2-2z" },
];
export const CAT = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));
export const catOf = f => CAT[f.type] ?? CAT.other;

// SVG for a point icon: a disc in the category colour with the glyph in white.
export function iconSvg(cat, size = 28) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 28 28">` +
    `<circle cx="14" cy="14" r="12.5" fill="${cat.color}" stroke="#fff" stroke-width="2"/>` +
    `<g transform="translate(6 6) scale(0.667)"><path d="${cat.glyph}" fill="#fff"/></g></svg>`;
}
