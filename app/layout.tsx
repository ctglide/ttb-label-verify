import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TTB Verify",
  description: "AI-assisted alcohol beverage label verification for TTB Compliance Division",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/icon.png", type: "image/png", sizes: "500x500" },
    ],
    apple: [
      { url: "/apple-icon.png", sizes: "500x500", type: "image/png" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
