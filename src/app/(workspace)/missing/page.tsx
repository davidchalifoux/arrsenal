import { LibraryBrowser } from "@/components/library-browser";

export const metadata = { title: "Missing media | Arrsenal" };

export default function MissingPage() {
  return <LibraryBrowser category="missing" />;
}
