export interface StyleCatalogEntry {
  key: string;
  name: string;
  description: string;
  colorTendencies: string[];
  materialTendencies: string[];
}

export const STYLE_CATALOG: ReadonlyArray<StyleCatalogEntry> = [
  {
    key: 'JAPANDI',
    name: 'Japandi',
    description: 'A blend of Japanese minimalism and Scandinavian warmth.',
    colorTendencies: ['warm white', 'oak', 'charcoal'],
    materialTendencies: ['light wood', 'linen', 'ceramic'],
  },
  {
    key: 'SCANDINAVIAN',
    name: 'Scandinavian',
    description: 'Bright, airy, functional simplicity with natural textures.',
    colorTendencies: ['white', 'pale grey', 'blush'],
    materialTendencies: ['pine', 'wool', 'cotton'],
  },
  {
    key: 'MID_CENTURY_MODERN',
    name: 'Mid-Century Modern',
    description: 'Clean lines, organic curves, and a playful retro spirit.',
    colorTendencies: ['mustard', 'teal', 'walnut'],
    materialTendencies: ['teak', 'leather', 'molded plastic'],
  },
  {
    key: 'INDUSTRIAL',
    name: 'Industrial',
    description: 'Raw, utilitarian, loft-inspired spaces with exposed structure.',
    colorTendencies: ['charcoal', 'rust', 'concrete grey'],
    materialTendencies: ['steel', 'reclaimed wood', 'brick'],
  },
  {
    key: 'BOHEMIAN',
    name: 'Bohemian',
    description: 'Eclectic, layered, globally-inspired comfort.',
    colorTendencies: ['terracotta', 'ochre', 'deep green'],
    materialTendencies: ['rattan', 'kilim textile', 'brass'],
  },
  {
    key: 'MODERN_FARMHOUSE',
    name: 'Modern Farmhouse',
    description: 'Rustic warmth meets contemporary clean lines.',
    colorTendencies: ['white', 'black', 'sage'],
    materialTendencies: ['shiplap', 'oak', 'iron'],
  },
  {
    key: 'COASTAL',
    name: 'Coastal',
    description: 'Breezy, light-filled, nautical without being themed.',
    colorTendencies: ['seafoam', 'sand', 'driftwood grey'],
    materialTendencies: ['whitewashed wood', 'jute', 'rope'],
  },
  {
    key: 'ART_DECO',
    name: 'Art Deco',
    description: 'Glamorous geometry, luxe materials, and bold symmetry.',
    colorTendencies: ['black', 'gold', 'emerald'],
    materialTendencies: ['lacquer', 'brass', 'marble'],
  },
];

export function isValidStyleKey(key: string): boolean {
  return STYLE_CATALOG.some((s) => s.key === key);
}

export function findStyle(key: string): StyleCatalogEntry | undefined {
  return STYLE_CATALOG.find((s) => s.key === key);
}
