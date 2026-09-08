import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { authorize } from "@/lib/server/auth";

export const metadata = { title: "Sign in | Arrsenal" };

export default async function LoginPage() {
  if (await authorize((await headers()).get("cookie"))) redirect("/");
  return <LoginForm />;
}
