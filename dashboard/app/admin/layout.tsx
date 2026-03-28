import { auth } from "@/auth";
import { redirect } from "next/navigation";
import AdminSidebar from "@/components/admin/AdminSidebar";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") redirect("/login");

  return (
    <div className='h-screen overflow-hidden flex bg-page'>
      <AdminSidebar />
      <main className='flex-1 min-h-0 overflow-y-auto p-6'>{children}</main>
    </div>
  );
}
