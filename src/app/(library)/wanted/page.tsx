import { redirect } from "next/navigation";

export default function WantedPage() {
  redirect("/?status=incomplete");
}
