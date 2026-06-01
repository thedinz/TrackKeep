import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SpotifyBU",
  description: "Back up Spotify playlist metadata and prepare authorized media backups."
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
