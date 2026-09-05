import { SettingsScreen } from "@/components/settings-screen";

export const metadata = { title: "Connections | Arrsenal" };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ connect?: string }>;
}) {
  const params = await searchParams;
  return <SettingsScreen autoOpen={params.connect === "1"} />;
}
