"use client";

import { useEffect, useMemo, useState } from "react";
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

type HistoryPoint = {
  listingId: string;
  marketplace: string;
  marketplaceSlug: string;
  price: number;
  inStock: boolean;
  observedAt: string;
};

const money = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const dateTime = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" });

function iconFor(category: string) {
  if (category === "Mouse") return "🖱️";
  if (category === "Keyboard") return "⌨️";
  if (category === "Storage") return "💾";
  return "🧠";
}

function PriceChart({ history }: { history: HistoryPoint[] }) {
  const points = [...history].sort((a, b) => new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime());
  if (points.length < 2) return <div className="empty">At least two observations are needed to show a price trend.</div>;

  const width = 900;
  const height = 260;
  const padX = 48;
  const padY = 28;
  const prices = points.map((point) => point.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const x = (index: number) => padX + (index / (points.length - 1)) * (width - padX * 2);
  const y = (price: number) => height - padY - ((price - min) / range) * (height - padY * 2);
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${y(point.price)}`).join(" ");

  return (
    <div className="price-chart-wrap">
      <svg className="price-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Price history chart">
        <line x1={padX} y1={height - padY} x2={width - padX} y2={height - padY} stroke="currentColor" opacity=".15" />
        <line x1={padX} y1={padY} x2={padX} y2={height - padY} stroke="currentColor" opacity=".15" />
        <path d={path} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point, index) => (
          <circle key={`${point.listingId}-${point.observedAt}-${index}`} cx={x(index)} cy={y(point.price)} r="5" fill="currentColor">
            <title>{`${money.format(point.price)} · ${dateTime.format(new Date(point.observedAt))}`}</title>
          </circle>
        ))}
        <text x={padX} y={height - 7} fontSize="11" fill="currentColor" opacity=".55">{dateTime.format(new Date(points[0].observedAt))}</text>
        <text x={width - padX} y={height - 7} textAnchor="end" fontSize="11" fill="currentColor" opacity=".55">{dateTime.format(new Date(points[points.length - 1].observedAt))}</text>
        <text x={padX - 8} y={padY + 4} textAnchor="end" fontSize="11" fill="currentColor" opacity=".55">{money.format(max)}</text>
        <text x={padX - 8} y={height - padY + 4} textAnchor="end" fontSize="11" fill="currentColor" opacity=".55">{money.format(min)}</text>
      </svg>
    </div>
  );
}

export default function ProductPage() {
  const [id, setId] = useState("");
  const [product, setProduct] = useState<Product | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setId(params.get("id")?.trim() ?? "");
  }, []);

  useEffect(() => {
    if (!id) return;

    setError("");
    Promise.all([
      fetch(`/api/product?id=${encodeURIComponent(id)}`).then(async (response) => {
        if (!response.ok) throw new Error("Product not found");
        return response.json();
      }),
      fetch(`/api/product/history?id=${encodeURIComponent(id)}`).then(async (response) => {
        if (!response.ok) throw new Error("History unavailable");
        return response.json();
      }),
    ])
      .then(([productData, historyData]) => {
        setProduct(productData);
        setHistory(historyData.history ?? []);
      })
      .catch(() => setError("Could not load this product."));
  }, [id]);

  const insights = useMemo(() => {
    if (history.length === 0 || !product) return null;
    const prices = history.map((point) => point.price);
    const lowest = Math.min(...prices);
    const highest = Math.max(...prices);
    const average = Math.round(prices.reduce((sum, price) => sum + price, 0) / prices.length);
    const current = product.lowestPrice;
    if (current === null) return null;
    const aboveLow = lowest > 0 ? Math.round(((current - lowest) / lowest) * 100) : 0;
    const isLowest = current <= lowest;
    return { lowest, highest, average, current, aboveLow, isLowest };
  }, [history, product]);

  if (error) return <main className="detail-page"><Link className="back" href="/">← Back to search</Link><div className="empty detail-empty">{error}</div></main>;
  if (!id || !product) return <main className="detail-page"><Link className="back" href="/">← Back to search</Link><div className="empty detail-empty">Loading product...</div></main>;

  return (
    <main className="detail-page">
      <header className="header"><nav className="nav"><Link className="logo" href="/">compare.</Link><span className="badge">V1.5 · Price intelligence</span></nav></header>
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

        <div className="section-title"><h2>Price intelligence</h2><span className="demo">{history.length} observations</span></div>
        {insights && (
          <div className="insight-grid">
            <div className="insight-card"><span>Historical low</span><strong>{money.format(insights.lowest)}</strong></div>
            <div className="insight-card"><span>Historical average</span><strong>{money.format(insights.average)}</strong></div>
            <div className="insight-card"><span>Historical high</span><strong>{money.format(insights.highest)}</strong></div>
            <div className={`insight-card ${insights.isLowest ? "deal-card" : ""}`}>
              <span>Deal signal</span>
              <strong>{insights.isLowest ? "Lowest recorded price" : `${insights.aboveLow}% above historical low`}</strong>
            </div>
          </div>
        )}

        {history.length === 0 ? (
          <div className="empty">No price changes recorded yet. Import the catalog again after changing a listing price to create the first observation.</div>
        ) : (
          <>
            <PriceChart history={history} />
            <div className="history-table">
              {[...history].reverse().map((point, index) => (
                <div className="compare-row" key={`${point.listingId}-${point.observedAt}-${index}`}>
                  <div><div className="market">{point.marketplace}</div><div className="meta">{dateTime.format(new Date(point.observedAt))}</div></div>
                  <div className="compare-price">{money.format(point.price)}</div>
                  <div className="meta stock">{point.inStock ? "In stock" : "Out of stock"}</div>
                  <div className="meta">Observed</div>
                </div>
              ))}
            </div>
          </>
        )}

        <p className="disclaimer">Price intelligence is based on observations collected by imports. It does not yet represent continuous real-time tracking.</p>
      </section>
    </main>
  );
}
