'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'
import Nav from '../components/Nav'
import Breadcrumbs from '../components/Breadcrumbs'

type Employee = {
  id: number
  name: string
}

type Client = {
  id: number
  name: string
  legal_name: string | null
  manager_id: number | null
  employees: Employee | null
  subscription_start: string | null
  subscription_end: string | null
  created_at: string
}

const formatDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('ru-RU') : '—'

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    legal_name: '',
    manager_id: '',
    subscription_start: '',
    subscription_end: '',
  })
  const [employees, setEmployees] = useState<Employee[]>([])
  const [updatingId, setUpdatingId] = useState<number | null>(null)
  const [editingLegalName, setEditingLegalName] = useState<Record<number, string>>({})

  const supabase = createClient()

  const updateClient = async (id: number, patch: Partial<Pick<Client, 'legal_name' | 'manager_id' | 'subscription_start' | 'subscription_end'>>) => {
    setUpdatingId(id)
    setError(null)
    const { error: updateError } = await supabase.from('clients').update(patch).eq('id', id)
    if (updateError) setError(updateError.message)
    else await fetchClients()
    setUpdatingId(null)
  }

  const fetchClients = async () => {
    setLoading(true)
    setError(null)
    const { data, error: fetchError } = await supabase
      .from('clients')
      .select('id, name, legal_name, manager_id, subscription_start, subscription_end, created_at, employees(id, name)')
      .order('created_at', { ascending: false })
    if (fetchError) {
      setError(fetchError.message)
      setClients([])
    } else {
      setClients((data ?? []) as Client[])
    }
    setLoading(false)
  }

  const fetchEmployees = async () => {
    const { data } = await supabase.from('employees').select('id, name').order('name')
    setEmployees((data ?? []) as Employee[])
  }

  useEffect(() => {
    fetchClients()
    fetchEmployees()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    setError(null)
    const { error: insertError } = await supabase.from('clients').insert({
      name: form.name.trim(),
      legal_name: form.legal_name.trim() || null,
      manager_id: form.manager_id ? Number(form.manager_id) : null,
      subscription_start: form.subscription_start || null,
      subscription_end: form.subscription_end || null,
    })
    if (insertError) {
      setError(insertError.message)
      setSaving(false)
      return
    }
    setForm({ name: '', legal_name: '', manager_id: '', subscription_start: '', subscription_end: '' })
    await fetchClients()
    setSaving(false)
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Nav />
      <div className="mx-auto max-w-[84rem] px-4 py-8 sm:px-6">
        <Breadcrumbs items={[{ href: '/', label: 'Главная' }, { href: '/clients', label: 'Клиенты' }]} />
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
          Клиенты Pass-Port
        </h1>

        {/* Форма добавления */}
        <section className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-medium text-[var(--foreground)]">
            Новый клиент
          </h2>
          <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="name" className="mb-1 block text-sm font-medium text-[var(--muted-foreground)]">
                Название *
              </label>
              <input
                id="name"
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-zinc-900 placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-400"
                placeholder="Название клиента"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="legal_name" className="mb-1 block text-sm font-medium text-[var(--muted-foreground)]">
                Юридическое название
              </label>
              <input
                id="legal_name"
                type="text"
                value={form.legal_name}
                onChange={(e) => setForm((f) => ({ ...f, legal_name: e.target.value }))}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-zinc-900 placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-400"
                placeholder="ООО «Пример»"
              />
            </div>
            <div>
              <label htmlFor="manager_id" className="mb-1 block text-sm font-medium text-[var(--muted-foreground)]">
                Менеджер
              </label>
              <select
                id="manager_id"
                value={form.manager_id}
                onChange={(e) => setForm((f) => ({ ...f, manager_id: e.target.value }))}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              >
                <option value="">— не выбран</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="subscription_start" className="mb-1 block text-sm font-medium text-[var(--muted-foreground)]">
                  Начало подписки
                </label>
                <input
                  id="subscription_start"
                  type="date"
                  value={form.subscription_start}
                  onChange={(e) => setForm((f) => ({ ...f, subscription_start: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>
              <div>
                <label htmlFor="subscription_end" className="mb-1 block text-sm font-medium text-[var(--muted-foreground)]">
                  Конец подписки
                </label>
                <input
                  id="subscription_end"
                  type="date"
                  value={form.subscription_end}
                  onChange={(e) => setForm((f) => ({ ...f, subscription_end: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>
            </div>
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-500 disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:bg-blue-500 dark:hover:bg-blue-400 dark:focus:ring-blue-400"
              >
                {saving ? 'Сохранение…' : 'Добавить клиента'}
              </button>
            </div>
          </form>
        </section>

        {/* Ошибка */}
        {error && (
          <div className="mt-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Список клиентов */}
        <section className="mt-8">
          <h2 className="mb-4 text-lg font-medium text-[var(--foreground)]">
            Клиенты Pass-Port
          </h2>
          {loading ? (
            <p className="text-[var(--muted)]">Загрузка…</p>
          ) : clients.length === 0 ? (
            <p className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 text-[var(--muted)]">
              Клиентов пока нет. Добавьте первого выше.
            </p>
          ) : (
            <div className="overflow-auto rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm max-h-[70vh]">
              <table className="min-w-full divide-y divide-[var(--border)]">
                <thead className="sticky top-0 z-10 bg-[var(--card)] shadow-sm">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
                      Название
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
                      Юр. название
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
                      Менеджер
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
                      Начало подписки
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
                      Конец подписки
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
                      Создан
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {clients.map((client) => (
                    <tr key={client.id} className="hover:bg-[var(--background)]/80 transition-colors">
                      <td className="px-4 py-2 text-sm font-medium text-[var(--foreground)]">
                        <Link href={`/clients/${client.id}`} className="text-blue-600 hover:underline dark:text-blue-400">
                          {client.name}
                        </Link>
                      </td>
                      <td className="px-4 py-2">
                        <input
                          value={editingLegalName[client.id] ?? client.legal_name ?? ''}
                          onChange={(e) => setEditingLegalName((s) => ({ ...s, [client.id]: e.target.value }))}
                          onBlur={(e) => {
                            const v = e.target.value.trim() || null
                            updateClient(client.id, { legal_name: v })
                            setEditingLegalName((s) => {
                              const next = { ...s }
                              delete next[client.id]
                              return next
                            })
                          }}
                          onFocus={() => setEditingLegalName((s) => ({ ...s, [client.id]: client.legal_name ?? '' }))}
                          disabled={updatingId === client.id}
                          className="w-full min-w-[120px] rounded border border-zinc-200 bg-white px-2 py-1 text-sm text-zinc-900 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                          placeholder="—"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <select
                          value={client.manager_id ?? ''}
                          onChange={(e) => updateClient(client.id, { manager_id: e.target.value ? Number(e.target.value) : null })}
                          disabled={updatingId === client.id}
                          className="min-w-[140px] rounded border border-zinc-200 bg-white px-2 py-1 text-sm text-zinc-900 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                        >
                          <option value="">—</option>
                          {employees.map((e) => (
                            <option key={e.id} value={e.id}>{e.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="date"
                          value={client.subscription_start ?? ''}
                          onChange={(e) => updateClient(client.id, { subscription_start: e.target.value || null })}
                          disabled={updatingId === client.id}
                          className="rounded border border-zinc-200 bg-white px-2 py-1 text-sm text-zinc-900 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="date"
                          value={client.subscription_end ?? ''}
                          onChange={(e) => updateClient(client.id, { subscription_end: e.target.value || null })}
                          disabled={updatingId === client.id}
                          className="rounded border border-zinc-200 bg-white px-2 py-1 text-sm text-zinc-900 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                        />
                      </td>
                      <td className="px-4 py-2 text-sm text-[var(--muted)]">
                        {formatDate(client.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
