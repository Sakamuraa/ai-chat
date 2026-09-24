// language: TypeScript, file: app/page.tsx, target: Next.js App Router (server component)
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import Landing from "@/components/landing";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return <Landing username={user.username} />;
}
