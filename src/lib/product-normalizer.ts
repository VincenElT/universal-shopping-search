export type NormalizedProduct = {
  name: string;
  brand: string | null;
  category: string;
  modelNumber: string | null;
  attributes: Record<string, string>;
  normalizedKey: string;
};

const BRAND_ALIASES: Record<string, string> = {
  logitech: "Logitech",
  samsung: "Samsung",
  kingston: "Kingston",
  corsair: "Corsair",
  razer: "Razer",
  "wd": "Western Digital",
  western: "Western Digital",
  "western digital": "Western Digital",
};

const CATEGORY_RULES: Array<[string, string[]]> = [
  ["Storage", ["ssd", "solid state", "portable ssd", "hard drive", "hdd", "storage"]],
  ["RAM", ["ram", "memory", "ddr4", "ddr5"]],
  ["Mouse", ["mouse", "gaming mouse"]],
  ["Keyboard", ["keyboard"]],
  ["Monitor", ["monitor", "display"]],
  ["Headphones", ["headphone", "headset", "earphone", "earbuds"]],
];

function clean(value: string) {
  return value
    .toLowerCase()
    .replace(/[™®]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectBrand(text: string, explicitBrand?: string | null) {
  if (explicitBrand?.trim()) return explicitBrand.trim();
  const normalized = clean(text);
  for (const [alias, brand] of Object.entries(BRAND_ALIASES)) {
    if (new RegExp(`\\b${alias.replace(/ /g, "\\s+")}\\b`, "i").test(normalized)) return brand;
  }
  return null;
}

function detectCategory(text: string, explicitCategory?: string | null) {
  if (explicitCategory?.trim()) return explicitCategory.trim();
  const normalized = clean(text);
  return CATEGORY_RULES.find(([, terms]) => terms.some((term) => normalized.includes(clean(term))))?.[0] ?? "Other";
}

function detectModel(text: string, explicitModel?: string | null) {
  if (explicitModel?.trim()) return explicitModel.trim();
  const source = text.trim();
  const modelPatterns = [
    /\bMU-[A-Z0-9/-]+\b/i,
    /\bKF[A-Z0-9/-]+\b/i,
    /\bG\d{3,4}\b/i,
    /\bK\d{3,4}\b/i,
  ];
  for (const pattern of modelPatterns) {
    const match = source.match(pattern);
    if (match) return match[0].toUpperCase();
  }
  return null;
}

function extractAttributes(text: string) {
  const normalized = clean(text);
  const attributes: Record<string, string> = {};

  const capacities = Array.from(normalized.matchAll(/\b(\d+(?:\.\d+)?)\s*(tb|gb)\b/gi)).map(
    (match) => `${match[1]}${match[2].toUpperCase()}`,
  );
  const uniqueCapacities = [...new Set(capacities)];

  const ddr = normalized.match(/\bddr\s*(4|5)\b/i);
  const speed = normalized.match(/\b(\d{3,5})\s*mhz\b/i);

  // Keep capacity for backwards compatibility, but expose all capacities when
  // a marketplace listing represents multiple selectable variants.
  if (uniqueCapacities.length) {
    attributes.capacity = uniqueCapacities[0];
    if (uniqueCapacities.length > 1) attributes.capacities = uniqueCapacities.join(",");
  }
  if (ddr) attributes.memoryType = `DDR${ddr[1]}`;
  if (speed) attributes.speed = `${speed[1]}MHz`;
  return attributes;
}

export function normalizeProduct(input: {
  name: string;
  brand?: string | null;
  category?: string | null;
  modelNumber?: string | null;
}): NormalizedProduct {
  const name = input.name.trim();
  const brand = detectBrand(name, input.brand);
  const category = detectCategory(name, input.category);
  const modelNumber = detectModel(name, input.modelNumber);
  const attributes = extractAttributes(name);
  const identity = [brand, modelNumber, category, ...Object.entries(attributes).sort().map(([key, value]) => `${key}:${value}`)]
    .filter(Boolean)
    .map((value) => clean(String(value)))
    .join("|");

  return {
    name,
    brand,
    category,
    modelNumber,
    attributes,
    normalizedKey: identity || clean(name),
  };
}
