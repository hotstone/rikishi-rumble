import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rikishi Rumble",
  description: "Sumo wrestling tipping competition",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
