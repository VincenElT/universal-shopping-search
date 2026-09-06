"use client";

import { useEffect, useState } from "react";

type Listing = {
  id: string;
  marketplace: string;
  price: number;
  seller: string | null;
  rating: number | null;
  reviewCount: number | null;
  url: string;
  inStock: boolean;
};

type Product = {
  id: string;
  name: string;
  brand: string | null;
  category: string;
  modelNumber: string | null;
  listings: Listing[];
};

type SearchResponse = {
  total: number;
  pages: number;
  results: Product[];
};

const money = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const categories = ["", "Mouse", "Keyboard", "Storage", "RAM"];
const brands = ["", "Logitech", "Samsung", "Kingston"];
const marketplaces = ["", "shopee", "tokopedia", "lazada"];

export default function Home() {
  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [marketplace, setMarketplace] = useState("");
  const [sort, setSort] = useState("relevance");
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        setLoading(true);
        setError("");
        const search = new URLSearchParams({ q: query, sort, limit: "20" });
        if (brand) search.set("brand", brand);
        if (category) search.set("category", category);
        if (marketplace) search.set("marketplace", marketplace);

        const response = await fetch(`/api/products?${search.toString()}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Search request failed");
        const data: SearchResponse = await response.json();
        setProducts(data.results);
        setTotal(data.total);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError("Could not load products. Check the database and API.");
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, brand, category, marketplace, sort]);

  return (
    <main className="page">
      <header className="header"><nav className="nav"><div className="logo">compare.</div><span className="badge">V1.2 · Search</span></nav></header>
      <section className="hero">
        <div className="eyebrow">Universal Shopping Search</div>
        <h1>Search once.<br />Compare everywhere.</h1>
        <p className="sub">Find the same product across multiple marketplaces, then choose the best price and seller.</p>
        <form className="search" onSubmit={e => e.preventDefault()}>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Try “Logitech mouse” or “1TB SSD”" aria-label="Search products" />
          <button type="submit">Search</button>
        </form>
      </section>
      <section className="content">
        <div className="section-title">
          <h2>{query ? `Results for “${query}”` : "Popular products"}</h2>
          <span className="demo">{total} products</span>
        </div>
        <div className="filters">
          <select value={brand} onChange={e => setBrand(e.target.value)} aria-label="Filter by brand">
            <option value="">All brands</option>
            {brands.slice(1).map(item => <option key={item} value={item}>{item}</option>)}
          </select>
          <select value={category} onChange={e => setCategory(e.target.value)} aria-label="Filter by category">
            <option value="">All categories</option>
            {categories.slice(1).map(item => <option key={item} value={item}>{item}</option>)}
          </select>
          <select value={marketplace} onChange={e => setMarketplace(e.target.value)} aria-label="Filter by marketplace">
            <option value="">All marketplaces</option>
            {marketplaces.slice(1).map(item => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}
          </select>
          <select value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort results">
            <option value="relevance">Most relevant</option>
            <option value="price">Lowest price</option>
          </select>
        </div>
        {loading && <div className="empty">Searching...</div>}
        {error && <div className="empty">{error}</div>}
        {!loading && !error && <div className="grid">
          {products.map(product => {
            const sorted = [...product.listings].sort((a, b) => a.price - b.price);
            return <article className="card" key={product.id}>
              <div className="product-head"><div className="thumb">{product.category === "Mouse" ? "🖱️" : product.category === "Keyboard" ? "⌨️" : product.category === "Storage" ? "💾" : "🧠"}</div><div><h3 className="product-name">{product.name}</h3><div className="meta">{product.brand} · {product.category}{product.modelNumber ? ` · ${product.modelNumber}` : ""}</div></div></div>
              <div className="listings">{sorted.map((listing, i) => <div className="listing" key={listing.id}>
                <div><div className="market">{listing.marketplace}{i === 0 ? " · Best price" : ""}</div><div className="meta">{listing.seller ?? "Marketplace seller"}</div><div className="price">{money.format(listing.price)}</div></div>
                <a className="buy" href={listing.url}>View store</a>
              </div>)}</div>
            </article>;
          })}
          {!products.length && <div className="empty">No products matched. Try “Logitech”, “SSD”, “RAM”, or “keyboard”.</div>}
        </div>}
      </section>
    </main>
  );
}
