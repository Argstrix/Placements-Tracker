import type { Metadata } from "next";
import SiteFooter from "./components/SiteFooter";
import "./globals.css";

export const metadata: Metadata = {
  title: "Placement Tracker",
  description: "Unofficial VIT placement mail tracker",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">
        <div className="flex-1">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
