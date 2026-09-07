import { notFound } from "next/navigation";
import { MediaScreen } from "@/components/media-screen";
import { mediaIdFromRoute } from "@/lib/client";

export const metadata = { title: "Show details | Arrsenal" };

export default async function ShowPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let mediaId: string;
  try {
    mediaId = mediaIdFromRoute(decodeURIComponent(id), "series");
  } catch {
    notFound();
  }
  return <MediaScreen mediaId={mediaId} kind="series" />;
}
