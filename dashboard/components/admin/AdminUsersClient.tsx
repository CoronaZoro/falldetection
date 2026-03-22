"use client";

import { useEffect, useState } from "react";
import StatusBadge from "@/components/StatusBadge";
import { UserPlus, Pencil, Trash2, X, Check } from "lucide-react";

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "RESPONDER";
  phone: string | null;
  isActive: boolean;
  createdAt: string;
}

const inputCls = "w-full bg-[#0a0c10] border border-[#1e2229] rounded px-3 py-2 text-[#c8d0e0] text-sm outline-none focus:border-[#3b82f6] transition-colors";
const labelCls = "block text-[12px] text-[#4a5568] mb-1 font-medium";

export default function AdminUsersClient() {
  const [users, setUsers]       = useState<UserRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [form, setForm]         = useState({ name: "", email: "", password: "", role: "RESPONDER", phone: "" });
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState("");

  async function load() {
    const res = await fetch("/api/admin/users");
    setUsers(await res.json());
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditUser(null);
    setForm({ name: "", email: "", password: "", role: "RESPONDER", phone: "" });
    setError("");
    setShowModal(true);
  }

  function openEdit(u: UserRow) {
    setEditUser(u);
    setForm({ name: u.name, email: u.email, password: "", role: u.role, phone: u.phone ?? "" });
    setError("");
    setShowModal(true);
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const method = editUser ? "PUT" : "POST";
      const url    = editUser ? `/api/admin/users/${editUser.id}` : "/api/admin/users";
      const body   = editUser
        ? { name: form.name, email: form.email, role: form.role, phone: form.phone || null, ...(form.password && { password: form.password }) }
        : { name: form.name, email: form.email, password: form.password, role: form.role, phone: form.phone || null };
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { setError((await res.json()).error ?? "Failed"); return; }
      setShowModal(false);
      load();
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(u: UserRow) {
    await fetch(`/api/admin/users/${u.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: !u.isActive }) });
    load();
  }

  async function deleteUser(u: UserRow) {
    if (!confirm(`Delete ${u.name}?`)) return;
    await fetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
    load();
  }

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#c8d0e0]">User Management</h1>
          <p className="text-sm text-[#4a5568]">{users.length} accounts</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-[#3b82f6] hover:bg-[#2563eb] border-none rounded-lg px-4 py-2.5 text-white font-semibold text-sm cursor-pointer transition-colors"
        >
          <UserPlus size={16} /> Add Responder
        </button>
      </div>

      <div className="bg-[#111318] border border-[#1e2229] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[#1e2229]">
                {["Name", "Email", "Role", "Status", "Joined", "Actions"].map((h) => (
                  <th key={h} className="py-3 px-4 text-left text-[#4a5568] font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="py-8 text-center text-[#4a5568]">Loading...</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={6} className="py-8 text-center text-[#4a5568]">No users</td></tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="border-b border-[#1e2229]">
                    <td className="py-3 px-4 text-[#c8d0e0] font-medium">{u.name}</td>
                    <td className="py-3 px-4 text-[#4a5568]">{u.email}</td>
                    <td className="py-3 px-4"><StatusBadge status={u.role} /></td>
                    <td className="py-3 px-4"><StatusBadge status={u.isActive ? "ONLINE" : "OFFLINE"} /></td>
                    <td className="py-3 px-4 text-[#4a5568] text-[12px] font-mono">{new Date(u.createdAt).toLocaleDateString()}</td>
                    <td className="py-3 px-4">
                      <div className="flex gap-1.5">
                        <IconBtn icon={<Pencil size={13} />} onClick={() => openEdit(u)} title="Edit" />
                        <IconBtn
                          icon={u.isActive ? <X size={13} /> : <Check size={13} />}
                          onClick={() => toggleActive(u)}
                          title={u.isActive ? "Deactivate" : "Activate"}
                          danger={u.isActive}
                          success={!u.isActive}
                        />
                        <IconBtn icon={<Trash2 size={13} />} onClick={() => deleteUser(u)} title="Delete" danger />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
          onClick={(e) => e.target === e.currentTarget && setShowModal(false)}
        >
          <div className="bg-[#111318] border border-[#1e2229] rounded-xl p-6 w-full max-w-md">
            <h2 className="font-bold text-[#c8d0e0] mb-5">{editUser ? "Edit User" : "Add Responder"}</h2>

            {error && (
              <div className="bg-[#ff3355]/10 border border-[#ff3355]/30 rounded px-3 py-2 mb-4 text-[#ff3355] text-sm">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-3.5">
              <div>
                <label className={labelCls}>Name</label>
                <input type="text"  className={inputCls} value={form.name}     onChange={f("name")}     />
              </div>
              <div>
                <label className={labelCls}>Email</label>
                <input type="email" className={inputCls} value={form.email}    onChange={f("email")}    />
              </div>
              <div>
                <label className={labelCls}>{editUser ? "New Password (leave blank to keep)" : "Password"}</label>
                <input type="password" className={inputCls} value={form.password} onChange={f("password")} />
              </div>
              <div>
                <label className={labelCls}>Role</label>
                <select className={inputCls} value={form.role} onChange={f("role")}>
                  <option value="RESPONDER">RESPONDER</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Phone (optional)</label>
                <input type="tel" className={inputCls} value={form.phone} onChange={f("phone")} />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 bg-[#1e2229] border-none rounded-lg py-2.5 text-[#4a5568] cursor-pointer text-sm hover:text-[#c8d0e0] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="flex-1 bg-[#3b82f6] hover:bg-[#2563eb] border-none rounded-lg py-2.5 text-white cursor-pointer font-semibold text-sm disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function IconBtn({
  icon, onClick, title, danger, success,
}: {
  icon: React.ReactNode; onClick: () => void; title?: string; danger?: boolean; success?: boolean;
}) {
  const color = danger ? "text-[#ff3355] hover:border-[#ff3355]/40" : success ? "text-[#00ff88] hover:border-[#00ff88]/40" : "text-[#4a5568] hover:text-[#c8d0e0]";
  return (
    <button
      onClick={onClick}
      title={title}
      className={`bg-transparent border border-[#1e2229] rounded px-2 py-1.5 cursor-pointer flex items-center transition-colors ${color}`}
    >
      {icon}
    </button>
  );
}
