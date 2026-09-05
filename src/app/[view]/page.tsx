import { notFound } from "next/navigation";
import { Arrsenal, type View } from "@/components/arrsenal";

const views: View[] = [
  "movies",
  "shows",
  "missing",
  "discover",
  "queue",
  "settings",
];

export default async function Page({
  params,
}: {
  params: Promise<{ view: string }>;
}) {
  const { view } = await params;
  if (!views.includes(view as View)) notFound();
  return <Arrsenal view={view as View} />;
}
