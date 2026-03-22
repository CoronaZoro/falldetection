import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export default async function ProfilePage() {
  const session = await auth();
  const user = session?.user.id
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { name: true, email: true, phone: true, createdAt: true, role: true },
      })
    : null;

  const fields: [string, string][] = [
    ["Name",          user?.name ?? "—"],
    ["Email",         user?.email ?? "—"],
    ["Phone",         user?.phone ?? "—"],
    ["Role",          user?.role ?? "—"],
    ["Member since",  user?.createdAt.toLocaleDateString() ?? "—"],
  ];

  return (
    <div className="max-w-[480px] mx-auto flex flex-col gap-6">
      <h1 className="text-xl font-bold text-[#c8d0e0]">My Profile</h1>

      <div className="bg-[#111318] border border-[#1e2229] rounded-lg p-6">
        <div className="flex flex-col gap-4">
          {fields.map(([label, val]) => (
            <div key={label}>
              <p className="text-[11px] text-[#4a5568] mb-1">{label}</p>
              <p className="text-[15px] text-[#c8d0e0]">{val}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-[#3b82f6]/[0.06] border border-[#3b82f6]/15 rounded-lg p-4 text-sm text-[#4a5568]">
        To update your profile or reset your password, contact your system administrator.
      </div>
    </div>
  );
}
