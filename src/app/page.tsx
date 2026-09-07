"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Listing = { id: string; marketplace: string; price: number; seller: string | null; rating: number | null; reviewCount: number | null; soldCount: number | null; sellerTrustScore: number | null; url: string; inStock: boolean; lastCheckedAt: string };
type Product = { id: string; name: string; brand: string | null; category: string; modelNumber: string | null; listings: Listing[] };
type SearchResponse = { total: number; pages: number; results: Product[] };
type LiveResponse = { stats: { discovered: number; createdProducts: number; upsertedListings: number; recordedSnapshots: number } };

const money = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const categories = ["Mouse", "Keyboard", "Storage", "RAM"];
const brands = ["Logitech", "Samsung", "Kingston"];
const marketplaces = ["shopee", "tokopedia", "lazada"];

function iconFor(category: string) { if (category === "Mouse") return "🖱️"; if (category === "Keyboard") return "⌨️"; if (category === "Storage") return "💾"; return "🧠"; }
function trustLabel(listing: Listing) { if ((listing.sellerTrustScore ?? 0) >= 75) return "Highly trusted"; if ((listing.sellerTrustScore ?? 0) >= 55) return "Trusted seller"; return "Verified result"; }

export default function Home() {
  const [query, setQuery] = useState(""); const [brand, setBrand] = useState(""); const [category, setCategory] = useState(""); const [marketplace, setMarketplace] = useState(""); const [sort, setSort] = useState("relevance");
  const [products, setProducts] = useState<Product[]>([]); const [total, setTotal] = useState(0); const [loading, setLoading] = useState(true); const [liveLoading, setLiveLoading] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");

  async function loadProducts() {
    const search = new URLSearchParams({ q: query, sort, limit: "20" }); if (brand) search.set("brand", brand); if (category) search.set("category", category); if (marketplace) search.set("marketplace", marketplace);
    const response = await fetch(`/api/products?${search.toString()}`, { cache: "no-store" }); if (!response.ok) throw new Error("Search request failed"); const data: SearchResponse = await response.json(); setProducts(data.results); setTotal(data.total);
  }

  useEffect(() => { const controller = new AbortController(); const timer = setTimeout(async () => { try { setLoading(true); setError(""); const search = new URLSearchParams({ q: query, sort, limit: "20" }); if (brand) search.set("brand", brand); if (category) search.set("category", category); if (marketplace) search.set("marketplace", marketplace); const response = await fetch(`/api/products?${search.toString()}`, { signal: controller.signal, cache: "no-store" }); if (!response.ok) throw new Error("Search request failed"); const data: SearchResponse = await response.json(); setProducts(data.results); setTotal(data.total); } catch (err) { if (err instanceof DOMException && err.name === "AbortError") return; setError("Could not load products. Check the database and API."); } finally { setLoading(false); } }, 200); return () => { clearTimeout(timer); controller.abort(); }; }, [query, brand, category, marketplace, sort]);

  async function liveSearch() { if (!query.trim()) return; try { setLiveLoading(true); setMessage(""); setError(""); const response = await fetch(`/api/search/live?q=${encodeURIComponent(query.trim())}&limit=10`, { cache: "no-store" }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Live search failed"); const result = data as LiveResponse; setMessage(`Found ${result.stats.discovered} marketplace results. Saved ${result.stats.upsertedListings} listings with usable prices and seller signals.`); await loadProducts(); } catch (err) { setError(err instanceof Error ? err.message : "Live search failed."); } finally { setLiveLoading(false); } }

  return <main className="page">
    <header className="header"><nav className="nav"><Link className="logo" href="/">compare.</Link><span className="badge">V2 · Trusted Marketplace Search</span></nav></header>
    <section className="hero"><div className="eyebrow">Universal Shopping Search</div><h1>Search once.<br />Buy from stores you can trust.</h1><p className="sub">We prioritize strong ratings, large review counts and sales signals instead of blindly showing the cheapest random listing.</p>
      <form className="search" onSubmit={e => { e.preventDefault(); void liveSearch(); }}><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Try “Samsung T7 1TB” or “Logitech G502”" aria-label="Search products" /><button type="submit" disabled={liveLoading}>{liveLoading ? "Searching…" : "Search live"}</button></form>
      {message && <div className="notice">{message}</div>}{error && <div className="notice">{error}</div>}
    </section>
    <section className="content"><div className="section-title"><h2>{query ? `Results for “${query}”` : "Popular products"}</h2><span className="demo">{total} products</span></div>
      <div className="filters"><select value={brand} onChange={e => setBrand(e.target.value)} aria-label="Filter by brand"><option value="">All brands</option>{brands.map(item => <option key={item} value={item}>{item}</option>)}</select><select value={category} onChange={e => setCategory(e.target.value)} aria-label="Filter by category"><option value="">All categories</option>{categories.map(item => <option key={item} value={item}>{item}</option>)}</select><select value={marketplace} onChange={e => setMarketplace(e.target.value)} aria-label="Filter by marketplace"><option value="">All marketplaces</option>{marketplaces.map(item => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}</select><select value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort results"><option value="relevance">Most relevant</option><option value="price">Lowest price</option></select></div>
      {loading && <div className="empty">Searching local catalog…</div>}{!loading && !error && <div className="grid">{products.map(product => { const sorted = [...product.listings].sort((a,b) => (b.sellerTrustScore ?? -1) - (a.sellerTrustScore ?? -1) || a.price-b.price); const best = sorted[0]; return <article className="card" key={product.id}><Link className="product-link" href={`/product?id=${encodeURIComponent(product.id)}`}><div className="product-head"><div className="thumb">{iconFor(product.category)}</div><div><h3 className="product-name">{product.name}</h3><div className="meta">{product.brand} · {product.category}{product.modelNumber ? ` · ${product.modelNumber}` : ""}</div></div></div></Link><div className="price-summary"><div><span className="meta">Best trusted offer</span><div className="price">{best ? money.format(best.price) : "—"}</div></div><span className="listing-count">{sorted.length} sellers</span></div><div className="listings">{sorted.map((listing,i) => <div className="listing" key={listing.id}><div><div className="market">{listing.marketplace}{i===0 ? " · Recommended" : ""}</div><div className="meta">{listing.seller ?? "Marketplace seller"}</div><div className="meta">{listing.rating ? `${listing.rating.toFixed(1)}★` : "Rating unavailable"}{listing.reviewCount ? ` · ${listing.reviewCount.toLocaleString("id-ID")} reviews` : ""}{listing.soldCount ? ` · ${listing.soldCount.toLocaleString("id-ID")} sold` : ""}</div><div className="price">{money.format(listing.price)}</div><div className="meta">{trustLabel(listing)}</div></div><a className="buy" href={listing.url} target="_blank" rel="noreferrer">View store</a></div>)}</div><Link className="compare-link" href={`/product?id=${encodeURIComponent(product.id)}`}>Compare trusted sellers & history →</Link></article>; })}{!products.length && <div className="empty">No products matched. Enter a product above and use Search live to discover marketplace listings.</div>}</div>}
    </section>
  </main>;
}
