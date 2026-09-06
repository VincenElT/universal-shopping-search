import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Compare — Universal Shopping Search",
  description: "Search once. Compare everywhere.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
