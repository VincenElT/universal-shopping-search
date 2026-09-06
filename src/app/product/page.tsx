"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Listing = {
  id: string;
  marketplace: string;
  marketplaceSlug: string;
  title: string;
  price: number;
  seller: string | null;
  rating: number | null;
  reviewCount: number | null;
  url: string;
  inStock: boolean;
  lastCheckedAt: string;
};

type Product = {
  id: string;
  name: string;
  brand: string | null;
  category: string;
  modelNumber: string | null;
  imageUrl: string | null;
  lowestPrice: number | null;
  highestPrice: number | null;
  savings: number;
  listings: Listing[];
};

const money = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

function iconFor(category: string) {
  if (category === "Mouse") return "🖱️";
  if (category === "Keyboard") return "⌨️";
  if (category === "Storage") return "💾";
  return "🧠";
}

export default function ProductPage() {
  const [id, setId] = useState("");
  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setId(params.get("id")?.trim() ?? "");
  }, []);

  useEffect(() => {
    if (!id) return;

    setError("");
    fetch(`/api/product?id=${encodeURIComponent(id)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Product not found");
        return response.json();
      })
      .then(setProduct)
      .catch(() => setError("Could not load this product."));
  }, [id]);

  if (error) return <main className="detail-page"><Link className="back" href="/">← Back to search</Link><div className="empty detail-empty">{error}</div></main>;
  if (!id) return <main className="detail-page"><Link className="back" href="/">← Back to search</Link><div className="empty detail-empty">Loading product...</div></main>;
  if (!product) return <main className="detail-page"><Link className="back" href="/">← Back to search</Link><div className="empty detail-empty">Loading product...</div></main>;

  return (
    <main className="detail-page">
      <header className="header"><nav className="nav"><Link className="logo" href="/">compare.</Link><span className="badge">V1.3 · Compare</span></nav></header>
      <section className="detail-content">
        <Link className="back" href="/">← Back to search</Link>
        <div className="detail-hero">
          <div className="detail-thumb">{iconFor(product.category)}</div>
          <div>
            <div className="eyebrow">{product.brand ?? "Product"} · {product.category}</div>
            <h1 className="detail-title">{product.name}</h1>
            <div className="meta">{product.modelNumber ? `Model ${product.modelNumber}` : "Model number unavailable"}</div>
          </div>
        </div>

        <div className="stats">
          <div className="stat"><span>Best price</span><strong>{product.lowestPrice !== null ? money.format(product.lowestPrice) : "—"}</strong></div>
          <div className="stat"><span>Highest price</span><strong>{product.highestPrice !== null ? money.format(product.highestPrice) : "—"}</strong></div>
          <div className="stat"><span>Potential savings</span><strong>{money.format(product.savings)}</strong></div>
          <div className="stat"><span>Listings</span><strong>{product.listings.length}</strong></div>
        </div>

        <div className="section-title"><h2>Compare sellers</h2><span className="demo">Sorted by price</span></div>
        <div className="compare-table">
          {product.listings.map((listing, index) => (
            <div className={`compare-row ${index === 0 ? "best-row" : ""}`} key={listing.id}>
              <div><div className="market">{listing.marketplace}{index === 0 ? " · Best price" : ""}</div><div className="meta">{listing.seller ?? "Marketplace seller"}</div></div>
              <div className="compare-price">{money.format(listing.price)}</div>
              <div className="meta stock">{listing.inStock ? "In stock" : "Out of stock"}</div>
              <a className="buy primary" href={listing.url}>View store</a>
            </div>
          ))}
        </div>
        <p className="disclaimer">Prices are for the current MVP dataset. Marketplace links will become real affiliate links when integrations are added.</p>
      </section>
    </main>
  );
}
