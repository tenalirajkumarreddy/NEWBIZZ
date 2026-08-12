import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getMyProfile } from "@/lib/data/users";
import { ProfilePage } from "./ProfilePage";

export const metadata = { title: "Profile — NEWBIZZ" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await getSession();
  if (!session) redirect("/login");
  const profile = await getMyProfile(session.user.id);
  return <ProfilePage profile={profile} />;
}
