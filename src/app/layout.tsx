import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TrackKeep",
  description: "Back up Spotify playlist metadata and prepare authorized media backups.",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
