import { connection } from "next/server";
import { Calendar } from "@/components/calendar";

export const metadata = { title: "Calendar | Arrsenal" };

export default async function CalendarPage() {
  await connection();
  return <Calendar today={new Date().toISOString().slice(0, 10)} />;
}
