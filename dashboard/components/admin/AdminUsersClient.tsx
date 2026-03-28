"use client";

import { useEffect, useState } from "react";
import StatusBadge from "@/components/StatusBadge";
import { UserPlus, Pencil, Trash2, X, Check, ShieldCheck, ShieldOff } from "lucide-react";

interface UserRow {
  id: string; name: string; email: string;
  role: "ADMIN" | "RESPONDER"; phone: string | null;
  isAuthorized: boolean; isActive: boolean; createdAt: string;
}

const inputCls = "w-full bg-page border border-line rounded px-3 py-2 text-fg text-xs outline-none focus:border-info transition-colors";
const labelCls = "section-label mb-1.5 block";

export default function AdminUsersClient() {
  const [users, setUsers]         = useState<UserRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser]   = useState<UserRow | null>(null);
  const [form, setForm]           = useState({ name: "", email: "", password: "", role: "RESPONDER", phone: "", isAuthorized: false });
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState("");

  async function load() {
    try {
      const res = await fetch("/api/admin/users");
      if (res.ok) setUsers(await res.json());
    } catch { /* network error — keep empty list */ }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditUser(null);
    setForm({ name: "", email: "", password: "", role: "RESPONDER", phone: "", isAuthorized: false });
    setError("");
    setShowModal(true);
  }

  function openEdit(u: UserRow) {
    setEditUser(u);
    setForm({ name: u.name, email: u.email, password: "", role: u.role, phone: u.phone ?? "", isAuthorized: u.isAuthorized });
    setError("");
    setShowModal(true);
  }

  async function save() {
    setSaving(true); setError("");
    try {
      const method = editUser ? "PUT" : "POST";
      const url    = editUser ? `/api/admin/users/${editUser.id}` : "/api/admin/users";
      const body   = editUser
        ? { name: form.name, email: form.email, role: form.role, phone: form.phone || null, isAuthorized: form.isAuthorized, ...(form.password && { password: form.password }) }
        : { name: form.name, email: form.email, password: form.password, role: form.role, phone: form.phone || null, isAuthorized: form.isAuthorized };
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { setError((await res.json()).error ?? "Failed"); return; }
      setShowModal(false); load();
    } finally { setSaving(false); }
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

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));
  const fBool = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.checked }));

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-base font-semibold text-fg'>User Management</h1>
          <p className='section-label mt-0.5'>{users.length} accounts</p>
        </div>
        <button
          onClick={openCreate}
          className='flex items-center gap-1.5 bg-info hover:bg-info-dark border-none rounded px-3 py-2 text-white font-semibold text-xs cursor-pointer transition-colors'
        >
          <UserPlus size={13} /> Add Responder
        </button>
      </div>

      <div className='bg-surface border border-line rounded overflow-hidden'>
        <div className='overflow-x-auto'>
          <table className='w-full border-collapse text-xs'>
            <thead>
              <tr className='border-b border-line'>
                {["Name", "Email", "Role", "Access", "Status", "Joined", "Actions"].map((h) => (
                  <th key={h} className='py-2.5 px-3 text-left section-label'>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className='py-8 text-center text-fg-muted'>Loading...</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={7} className='py-8 text-center text-fg-muted'>No users</td></tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className='border-b border-line'>
                    <td className='py-2.5 px-3 text-fg font-medium'>{u.name}</td>
                    <td className='py-2.5 px-3 text-fg-muted'>{u.email}</td>
                    <td className='py-2.5 px-3'><StatusBadge status={u.role} /></td>
                    <td className='py-2.5 px-3'>
                      {u.role === "RESPONDER" ? (
                        <span className={`flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide ${u.isAuthorized ? "text-success" : "text-warning"}`}>
                          {u.isAuthorized ? <ShieldCheck size={11} /> : <ShieldOff size={11} />}
                          {u.isAuthorized ? "Authorized" : "Unauthorized"}
                        </span>
                      ) : (
                        <span className='text-[10px] text-fg-muted'>—</span>
                      )}
                    </td>
                    <td className='py-2.5 px-3'><StatusBadge status={u.isActive ? "ONLINE" : "OFFLINE"} /></td>
                    <td className='py-2.5 px-3 text-fg-muted font-mono'>{new Date(u.createdAt).toLocaleDateString()}</td>
                    <td className='py-2.5 px-3'>
                      <div className='flex gap-1.5'>
                        <IconBtn icon={<Pencil size={13} />} onClick={() => openEdit(u)} title='Edit' />
                        <IconBtn
                          icon={u.isActive ? <X size={13} /> : <Check size={13} />}
                          onClick={() => toggleActive(u)}
                          title={u.isActive ? "Deactivate" : "Activate"}
                          danger={u.isActive}
                          success={!u.isActive}
                        />
                        <IconBtn icon={<Trash2 size={13} />} onClick={() => deleteUser(u)} title='Delete' danger />
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
          className='fixed inset-0 bg-black/70 flex items-center justify-center z-50'
          onClick={(e) => e.target === e.currentTarget && setShowModal(false)}
        >
          <div className='bg-surface border border-line rounded p-5 w-full max-w-md'>
            <h2 className='text-sm font-semibold text-fg mb-4'>{editUser ? "Edit User" : "Add Responder"}</h2>

            {error && (
              <div className='bg-danger/[0.08] border border-danger/20 rounded px-3 py-2 mb-4 text-danger text-xs'>
                {error}
              </div>
            )}

            <div className='flex flex-col gap-3'>
              <div><label className={labelCls}>Name</label>     <input type='text'     className={inputCls} value={form.name}     onChange={f("name")}     /></div>
              <div><label className={labelCls}>Email</label>    <input type='email'    className={inputCls} value={form.email}    onChange={f("email")}    /></div>
              <div><label className={labelCls}>{editUser ? "New Password (leave blank to keep)" : "Password"}</label><input type='password' className={inputCls} value={form.password} onChange={f("password")} /></div>
              <div>
                <label className={labelCls}>Role</label>
                <select className={inputCls} value={form.role} onChange={f("role")}>
                  <option value='RESPONDER'>RESPONDER</option>
                  <option value='ADMIN'>ADMIN</option>
                </select>
              </div>
              <div><label className={labelCls}>Phone (optional)</label><input type='tel' className={inputCls} value={form.phone} onChange={f("phone")} /></div>
              {form.role === "RESPONDER" && (
                <div className='flex items-center gap-2.5'>
                  <input
                    id='isAuthorized'
                    type='checkbox'
                    checked={form.isAuthorized}
                    onChange={fBool("isAuthorized")}
                    className='w-3.5 h-3.5 accent-success cursor-pointer'
                  />
                  <label htmlFor='isAuthorized' className='text-xs text-fg cursor-pointer'>
                    Authorized healthcare provider
                    <span className='block section-label mt-0'>Can receive clinical first-aid guidance via voice</span>
                  </label>
                </div>
              )}
            </div>

            <div className='flex gap-2 mt-5'>
              <button
                onClick={() => setShowModal(false)}
                className='flex-1 bg-line border-none rounded py-2 text-fg-muted cursor-pointer text-xs hover:text-fg transition-colors'
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                className='flex-1 bg-info hover:bg-info-dark border-none rounded py-2 text-white cursor-pointer font-semibold text-xs disabled:opacity-60 disabled:cursor-not-allowed transition-colors'
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

function IconBtn({ icon, onClick, title, danger, success }: {
  icon: React.ReactNode; onClick: () => void; title?: string; danger?: boolean; success?: boolean;
}) {
  const color = danger  ? "text-danger hover:border-danger/40"
              : success ? "text-success hover:border-success/40"
              : "text-fg-muted hover:text-fg";
  return (
    <button
      onClick={onClick}
      title={title}
      className={`bg-transparent border border-line rounded px-2 py-1.5 cursor-pointer flex items-center transition-colors ${color}`}
    >
      {icon}
    </button>
  );
}
