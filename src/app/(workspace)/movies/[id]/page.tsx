import { notFound } from "next/navigation";
import { MediaScreen } from "@/components/media-screen";

export const metadata = { title: "Movie details | Arrsenal" };

export default async function MoviePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let mediaId: string;
  try {
    mediaId = decodeURIComponent(id);
  } catch {
    notFound();
  }
  return <MediaScreen mediaId={mediaId} kind="movie" />;
}
