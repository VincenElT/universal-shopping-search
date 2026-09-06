"use client";

import { useMemo, useState } from "react";

type Listing = { marketplace: string; price: number; seller: string; url: string };
type Product = { id: string; name: string; brand: string; category: string; icon: string; listings: Listing[] };

const products: Product[] = [
  { id: "g502", name: "Logitech G502 HERO Gaming Mouse", brand: "Logitech", category: "Mouse", icon: "🖱️", listings: [
    { marketplace: "Shopee", price: 649000, seller: "Official Store", url: "#" },
    { marketplace: "Tokopedia", price: 679000, seller: "Official Store", url: "#" },
    { marketplace: "Lazada", price: 699000, seller: "Official Store", url: "#" },
  ]},
  { id: "k380", name: "Logitech K380 Bluetooth Keyboard", brand: "Logitech", category: "Keyboard", icon: "⌨️", listings: [
    { marketplace: "Tokopedia", price: 479000, seller: "Official Store", url: "#" },
    { marketplace: "Shopee", price: 489000, seller: "Official Store", url: "#" },
    { marketplace: "Lazada", price: 515000, seller: "Official Store", url: "#" },
  ]},
  { id: "t7", name: "Samsung T7 Portable SSD 1TB", brand: "Samsung", category: "Storage", icon: "💾", listings: [
    { marketplace: "Shopee", price: 1399000, seller: "Samsung Official", url: "#" },
    { marketplace: "Lazada", price: 1425000, seller: "Samsung Official", url: "#" },
    { marketplace: "Tokopedia", price: 1499000, seller: "Samsung Official", url: "#" },
  ]},
  { id: "fury", name: "Kingston FURY Beast 16GB DDR4 3200MHz", brand: "Kingston", category: "RAM", icon: "🧠", listings: [
    { marketplace: "Tokopedia", price: 549000, seller: "Kingston Store", url: "#" },
    { marketplace: "Shopee", price: 565000, seller: "Kingston Store", url: "#" },
    { marketplace: "Lazada", price: 599000, seller: "Kingston Store", url: "#" },
  ]},
];

const money = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

function score(product: Product, query: string) {
  const q = query.toLowerCase().trim();
  if (!q) return 0;
  const haystack = `${product.name} ${product.brand} ${product.category}`.toLowerCase();
  if (haystack.includes(q)) return 100;
  return q.split(/\s+/).reduce((total, token) => total + (haystack.includes(token) ? 20 : 0), 0);
}

export default function Home() {
  const [query, setQuery] = useState("");
  const results = useMemo(() => products.filter(p => !query.trim() || score(p, query) > 0).sort((a, b) => score(b, query) - score(a, query)), [query]);

  return (
    <main className="page">
      <header className="header"><nav className="nav"><div className="logo">compare.</div><span className="badge">V1 · Demo</span></nav></header>
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
        <div className="section-title"><h2>{query ? `Results for “${query}”` : "Popular products"}</h2><span className="demo">Sample data — illustrative prices</span></div>
        <div className="grid">
          {results.map(product => {
            const sorted = [...product.listings].sort((a, b) => a.price - b.price);
            return <article className="card" key={product.id}>
              <div className="product-head"><div className="thumb">{product.icon}</div><div><h3 className="product-name">{product.name}</h3><div className="meta">{product.brand} · {product.category}</div></div></div>
              <div className="listings">{sorted.map((listing, i) => <div className="listing" key={listing.marketplace}>
                <div><div className="market">{listing.marketplace}{i === 0 ? " · Best price" : ""}</div><div className="meta">{listing.seller}</div><div className="price">{money.format(listing.price)}</div></div>
                <a className="buy" href={listing.url}>View store</a>
              </div>)}</div>
            </article>;
          })}
          {!results.length && <div className="empty">No demo products matched. Try “Logitech”, “SSD”, “RAM”, or “keyboard”.</div>}
        </div>
      </section>
    </main>
  );
}
