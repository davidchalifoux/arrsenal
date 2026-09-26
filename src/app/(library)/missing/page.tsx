import { redirect } from "next/navigation";

export default function MissingPage() {
  redirect("/wanted");
}
