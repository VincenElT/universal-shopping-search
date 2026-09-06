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
  const amount = Number(match[1]) * (match[2] === "TB" ? 1024 : 1);
  return amount;
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
      return { product: null, score: 0, status: "new", reasons: ["model conflict"] };
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

  if (input.attributes.capacity && normalizedCandidate.attributes.capacity) {
    if (normalizeCapacity(input.attributes.capacity) === normalizeCapacity(normalizedCandidate.attributes.capacity)) {
      score += 7;
      reasons.push("capacity match");
    }
  }

  if (input.attributes.memoryType && input.attributes.memoryType === normalizedCandidate.attributes.memoryType) {
    score += 3;
    reasons.push("memory type match");
  }

  if (input.attributes.speed && input.attributes.speed === normalizedCandidate.attributes.speed) {
    score += 2;
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

  const status = score >= 85 ? "match" : score >= 60 ? "ambiguous" : "new";
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
  if (best.status === "match" && second && second.score >= best.score - 5) {
    return { product: null, score: best.score, status: "ambiguous", reasons: ["multiple close candidates", ...best.reasons] };
  }

  return best;
}
