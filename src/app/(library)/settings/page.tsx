import { redirect } from "next/navigation";

export const metadata = { title: "Settings | Arrsenal" };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ connect?: string | string[] }>;
}) {
  const params = await searchParams;
  if (params.connect === "1") redirect("/settings/connections?connect=1");
  redirect("/settings/connections");
}
