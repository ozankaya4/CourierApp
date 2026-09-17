import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Courier | Yemeğin yola çıksın",
  description: "Yemek siparişi ve teslimat takibi.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
