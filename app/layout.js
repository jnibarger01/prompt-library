import "./globals.css";

export const metadata = {
  title: "Prompt Foundry — 2,084 AI Prompts",
  description: "Search, save, inspect, and copy a curated library of AI prompts.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "dark light",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b0d11" },
    { media: "(prefers-color-scheme: light)", color: "#f4f1e9" }
  ]
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
