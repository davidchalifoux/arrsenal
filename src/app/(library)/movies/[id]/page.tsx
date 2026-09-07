import { notFound } from "next/navigation";
import { MediaScreen } from "@/components/media-screen";
import { mediaIdFromRoute } from "@/lib/client";

export const metadata = { title: "Movie details | Arrsenal" };

export default async function MoviePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let mediaId: string;
  try {
    mediaId = mediaIdFromRoute(decodeURIComponent(id), "movie");
  } catch {
    notFound();
  }
  return <MediaScreen mediaId={mediaId} kind="movie" />;
}
