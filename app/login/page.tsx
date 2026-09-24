// language: TypeScript, file: app/login/page.tsx + app/register/page.tsx pattern
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import AuthForm from "@/components/auth-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Masuk — AI" };

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect("/");
  return <AuthForm mode="login" />;
}
