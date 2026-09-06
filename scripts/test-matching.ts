import { findBestProductMatch } from "../src/lib/product-matcher";
import { normalizeProduct } from "../src/lib/product-normalizer";

type TestCase = {
  name: string;
  expected: string;
  input: Parameters<typeof normalizeProduct>[0];
  candidates: Array<{
    id: string;
    name: string;
    brand: string | null;
    category: string;
    modelNumber: string | null;
  }>;
};

const products = [
  { id: "t7", name: "Samsung T7 Portable SSD 1TB", brand: "Samsung", category: "Storage", modelNumber: "MU-PC1T0T" },
  { id: "t7-500", name: "Samsung T7 Portable SSD 500GB", brand: "Samsung", category: "Storage", modelNumber: "MU-PC500T" },
  { id: "t7-shield", name: "Samsung T7 Shield Portable SSD 1TB", brand: "Samsung", category: "Storage", modelNumber: "MU-PE1T0S" },
  { id: "g502", name: "Logitech G502 HERO Gaming Mouse", brand: "Logitech", category: "Mouse", modelNumber: "G502 HERO" },
  { id: "g502-x", name: "Logitech G502 X Gaming Mouse", brand: "Logitech", category: "Mouse", modelNumber: "G502 X" },
  { id: "fury-ddr4", name: "Kingston FURY Beast 16GB DDR4 3200MHz", brand: "Kingston", category: "RAM", modelNumber: "KF432C16BB/16" },
  { id: "fury-ddr5", name: "Kingston FURY Beast 16GB DDR5 5200MHz", brand: "Kingston", category: "RAM", modelNumber: "KF552C40BB-16" },
];

const tests: TestCase[] = [
  {
    name: "T7 alternate title",
    expected: "t7",
    input: { name: "Samsung Portable SSD T7 1TB USB 3.2" },
    candidates: products,
  },
  {
    name: "T7 1000GB variant",
    expected: "t7",
    input: { name: "SAMSUNG T7 SSD 1000GB" },
    candidates: products,
  },
  {
    name: "T7 explicit model",
    expected: "t7",
    input: { name: "Samsung MU-PC1T0T T7 1TB" },
    candidates: products,
  },
  {
    name: "T7 wrong capacity",
    expected: "t7-500",
    input: { name: "Samsung T7 500GB Portable SSD" },
    candidates: products,
  },
  {
    name: "T7 Shield must stay separate",
    expected: "t7-shield",
    input: { name: "Samsung T7 Shield 1TB Portable SSD" },
    candidates: products,
  },
  {
    name: "G502 marketplace title",
    expected: "g502",
    input: { name: "Logitech G502 HERO RGB Gaming Mouse" },
    candidates: products,
  },
  {
    name: "G502 X must stay separate",
    expected: "g502-x",
    input: { name: "Logitech G502 X Gaming Mouse" },
    candidates: products,
  },
  {
    name: "DDR4 variant",
    expected: "fury-ddr4",
    input: { name: "Kingston Fury Beast 16GB DDR4 3200MHz" },
    candidates: products,
  },
  {
    name: "DDR5 must stay separate",
    expected: "fury-ddr5",
    input: { name: "Kingston Fury Beast 16GB DDR5 5200MHz" },
    candidates: products,
  },
];

let passed = 0;

for (const test of tests) {
  const result = findBestProductMatch(normalizeProduct(test.input), test.candidates);
  const actual = result.product?.id ?? "new";
  const ok = actual === test.expected && result.status === "match";

  console.log(`${ok ? "PASS" : "FAIL"} ${test.name}: expected=${test.expected}, actual=${actual}, score=${result.score}, status=${result.status}${result.reasons.length ? ` (${result.reasons.join(", ")})` : ""}`);

  if (ok) passed += 1;
}

console.log(`\nMatching stress test: ${passed}/${tests.length} passed.`);

if (passed !== tests.length) process.exit(1);
