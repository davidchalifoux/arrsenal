import { LibraryBrowser } from "@/components/library-browser";

export const metadata = { title: "Movies | Arrsenal" };

export default function MoviesPage() {
  return <LibraryBrowser category="movies" />;
}
