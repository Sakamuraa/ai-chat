// language: TypeScript, file: app/login/page.tsx + app/register/page.tsx pattern
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import AuthForm from "@/components/auth-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Masuk" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: { from?: string } | Promise<{ from?: string }>;
}) {
  const params = (await Promise.resolve(searchParams)) ?? {};
  const user = await getSessionUser();
  // dari menu "Tambah akun": biarkan terbuka walau masih login (sesi lama tak disentuh)
  if (user && params.from !== "switch") redirect("/");
  return <AuthForm mode="login" switching={params.from === "switch"} />;
}
