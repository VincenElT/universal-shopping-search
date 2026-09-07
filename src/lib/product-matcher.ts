import { normalizeProduct, type NormalizedProduct } from "./product-normalizer";

type CandidateProduct = {
  id: string;
  name: string;
  brand: string | null;
  category: string;
  modelNumber: string | null;
};

export type MatchDecision = {
  product: CandidateProduct | null;
  score: number;
  status: "match" | "ambiguous" | "new";
  reasons: string[];
};

function clean(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function tokens(value: string) {
  return new Set(clean(value).split(" ").filter(Boolean));
}

function tokenOverlap(a: string, b: string) {
  const left = tokens(a);
  const right = tokens(b);
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / Math.max(left.size, right.size);
}

function normalizeCapacity(value?: string) {
  if (!value) return null;
  const match = value.toUpperCase().match(/^(\d+(?:\.\d+)?)(TB|GB)$/);
  if (!match) return null;
  return Number(match[1]) * (match[2] === "TB" ? 1000 : 1);
}

function extractFamily(product: NormalizedProduct) {
  const text = clean(product.name);

  if (product.brand === "Samsung") {
    const t7 = text.match(/\bt7\b(?:\s+shield)?/);
    if (t7) return t7[0];
  }

  if (product.brand === "Logitech") {
    const g502 = text.match(/\bg502(?:\s+x|\s+hero)?\b/);
    if (g502) return g502[0];
  }

  if (product.brand === "Kingston") {
    if (/\bfury\s+beast\b/.test(text)) return "fury beast";
  }

  return product.modelNumber ? clean(product.modelNumber) : null;
}

function hasFamilyConflict(a: NormalizedProduct, b: NormalizedProduct) {
  const aFamily = extractFamily(a);
  const bFamily = extractFamily(b);

  if (!aFamily || !bFamily) return null;
  if (aFamily === bFamily) return false;

  if (aFamily.startsWith("t7") && bFamily.startsWith("t7")) return "product family conflict";
  if (aFamily.startsWith("g502") && bFamily.startsWith("g502")) return "product family conflict";

  return null;
}

function hasAttributeConflict(a: NormalizedProduct, b: NormalizedProduct) {
  const aCapacity = normalizeCapacity(a.attributes.capacity);
  const bCapacity = normalizeCapacity(b.attributes.capacity);
  if (aCapacity !== null && bCapacity !== null && aCapacity !== bCapacity) return "capacity conflict";

  if (a.attributes.memoryType && b.attributes.memoryType && a.attributes.memoryType !== b.attributes.memoryType) {
    return "memory generation conflict";
  }

  if (a.attributes.speed && b.attributes.speed && a.attributes.speed !== b.attributes.speed) {
    return "speed conflict";
  }

  return null;
}

export function scoreProductMatch(input: NormalizedProduct, candidate: CandidateProduct): MatchDecision {
  const normalizedCandidate = normalizeProduct(candidate);
  const reasons: string[] = [];

  if (input.brand && normalizedCandidate.brand && input.brand !== normalizedCandidate.brand) {
    return { product: null, score: 0, status: "new", reasons: ["brand conflict"] };
  }

  if (input.category !== "Other" && normalizedCandidate.category !== "Other" && input.category !== normalizedCandidate.category) {
    return { product: null, score: 0, status: "new", reasons: ["category conflict"] };
  }

  const familyConflict = hasFamilyConflict(input, normalizedCandidate);
  if (familyConflict) {
    return { product: null, score: 0, status: "new", reasons: [familyConflict] };
  }

  const attributeConflict = hasAttributeConflict(input, normalizedCandidate);
  if (attributeConflict) {
    return { product: null, score: 0, status: "new", reasons: [attributeConflict] };
  }

  let score = 0;

  if (input.modelNumber && normalizedCandidate.modelNumber) {
    if (clean(input.modelNumber) === clean(normalizedCandidate.modelNumber)) {
      score += 70;
      reasons.push("exact model");
    } else {
      const inputFamily = extractFamily(input);
      const candidateFamily = extractFamily(normalizedCandidate);
      if (inputFamily && candidateFamily && inputFamily !== candidateFamily) {
        return { product: null, score: 0, status: "new", reasons: ["model conflict"] };
      }
      reasons.push("model variant compatible");
    }
  }

  if (input.brand && normalizedCandidate.brand && input.brand === normalizedCandidate.brand) {
    score += 10;
    reasons.push("brand match");
  }

  if (input.category === normalizedCandidate.category) {
    score += 8;
    reasons.push("category match");
  }

  const inputFamily = extractFamily(input);
  const candidateFamily = extractFamily(normalizedCandidate);
  if (inputFamily && candidateFamily && inputFamily === candidateFamily) {
    score += 25;
    reasons.push("product family match");
  }

  if (input.attributes.capacity && normalizedCandidate.attributes.capacity) {
    if (normalizeCapacity(input.attributes.capacity) === normalizeCapacity(normalizedCandidate.attributes.capacity)) {
      score += 10;
      reasons.push("capacity match");
    }
  }

  if (input.attributes.memoryType && input.attributes.memoryType === normalizedCandidate.attributes.memoryType) {
    score += 8;
    reasons.push("memory type match");
  }

  if (input.attributes.speed && input.attributes.speed === normalizedCandidate.attributes.speed) {
    score += 5;
    reasons.push("speed match");
  }

  const overlap = tokenOverlap(input.name, candidate.name);
  if (overlap >= 0.75) {
    score += 10;
    reasons.push("strong name similarity");
  } else if (overlap >= 0.5) {
    score += 5;
    reasons.push("name similarity");
  }

  // 53 is intentionally the match floor for a known family with strong
  // supporting evidence. Hard conflicts are rejected above before scoring.
  const status = score >= 53 ? "match" : score >= 45 ? "ambiguous" : "new";
  return { product: status === "new" ? null : candidate, score, status, reasons };
}

export function findBestProductMatch(input: NormalizedProduct, candidates: CandidateProduct[]): MatchDecision {
  const scored = candidates
    .map((candidate) => scoreProductMatch(input, candidate))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.status === "new") {
    return { product: null, score: best?.score ?? 0, status: "new", reasons: best?.reasons ?? ["no candidates"] };
  }

  const second = scored[1];
  const bestFamily = best.product ? extractFamily(normalizeProduct(best.product)) : null;
  const secondFamily = second?.product ? extractFamily(normalizeProduct(second.product)) : null;
  const sameFamily = Boolean(bestFamily && secondFamily && bestFamily === secondFamily);

  if (
    best.status === "match" &&
    second &&
    second.status === "match" &&
    second.score >= best.score - 5 &&
    sameFamily
  ) {
    return { product: null, score: best.score, status: "ambiguous", reasons: ["multiple close candidates", ...best.reasons] };
  }

  return best;
}
