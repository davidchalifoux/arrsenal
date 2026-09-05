import { notFound } from "next/navigation";
import { Arrsenal } from "@/components/arrsenal";

export default async function MediaPage({
  params,
}: {
  params: Promise<{ view: string; id: string }>;
}) {
  const { view, id } = await params;
  if (view !== "movies" && view !== "shows") notFound();
  let mediaId: string;
  try {
    mediaId = decodeURIComponent(id);
  } catch {
    notFound();
  }
  return <Arrsenal view={view} mediaId={mediaId} />;
}
