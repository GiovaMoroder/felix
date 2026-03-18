import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Productivity Agent",
  description: "A personal planning system with a real calendar and an AI planning layer.",
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
