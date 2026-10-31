import type { Metadata, Viewport } from "next";
import { EB_Garamond } from "next/font/google";
import "./globals.css";

const serif = EB_Garamond({ subsets: ["latin", "latin-ext"], display: "swap", variable: "--font-serif" });

export const metadata: Metadata = {
  title: "Write a letter",
  description: "Write a letter by hand, almost: a love letter or a letter to a friend. Send a link and let them watch every word being written.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2a1218",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={serif.variable}>
      <body>{children}</body>
    </html>
  );
}
