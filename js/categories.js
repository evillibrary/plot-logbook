// Every feature belongs to exactly one category. Colour, glyph and the natural geometry
// (point / line / area / none) live here so the map, forms, list and layers panel agree.
// Glyphs are 24x24 SVG paths, drawn to read at 14 px inside a coloured disc.
export const CATEGORIES = [
  { id: "trees",      name: "Trees & plants",  color: "#3e8a3a", geom: "point",
    glyph: "M12 2C8 2 5 5.5 5 9c0 2.5 1.5 4.5 3.5 5.5L8 20h8l-.5-5.5C17.5 13.5 19 11.5 19 9c0-3.5-3-7-7-7z" },
  { id: "water",      name: "Water",           color: "#2f7fd0", geom: "point",
    glyph: "M12 2.5S5.5 10 5.5 14.5a6.5 6.5 0 0 0 13 0C18.5 10 12 2.5 12 2.5z" },
  { id: "structures", name: "Structures",      color: "#7a6f60", geom: "area",
    glyph: "M3 11 12 3l9 8h-2v9h-5v-6h-4v6H5v-9z" },
  { id: "fences",     name: "Fences",          color: "#8a4b1e", geom: "line",
    glyph: "M4 4h3v16H4zM10.5 4h3v16h-3zM17 4h3v16h-3zM2 8h20v2H2zM2 14h20v2H2z" },
  { id: "paddocks",   name: "Paddocks",        color: "#b8962e", geom: "area",
    glyph: "M3 5h18v14H3zM5 7v10h14V7zM7 9h4v6H7z" },
  { id: "growing",    name: "Growing areas",   color: "#5aa24a", geom: "area",
    glyph: "M4 19h16v2H4zM6 17c0-4 2-7 6-8 4 1 6 4 6 8H6zM12 4c1.5 1 2 3 2 5h-4c0-2 .5-4 2-5z" },
  { id: "access",     name: "Access & yard",   color: "#d9782a", geom: "point",
    glyph: "M3 6h2v12H3zM19 6h2v12h-2zM6 8h12v2H6zM6 14h12v2H6zM11 8h2v8h-2z" },
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
