// language: TypeScript, file: app/register/page.tsx, target: Next.js App Router
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import AuthForm from "@/components/auth-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Daftar — AI" };

export default async function RegisterPage() {
  const user = await getSessionUser();
  if (user) redirect("/");
  return <AuthForm mode="register" />;
}
