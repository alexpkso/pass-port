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
  employees: Employee | Employee[] | null
  created_at: string
}

const formatDate = (d: string | null) => {
  if (!d) return '—'
  const t = new Date(d).getTime()
  return Number.isNaN(t) ? '—' : new Date(d).toLocaleDateString('ru-RU')
}

const formatMoney = (n: number) =>
  new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n) + ' ₽'

type ClientStats = { charged: number; paid: number; start: string | null; end: string | null }

const CSV_SEP = ';' // Excel в русской локали ожидает ; как разделитель

function escapeCsvCell(value: string): string {
  if (!/[\n";]/.test(value)) return value
  return '"' + value.replace(/"/g, '""') + '"'
}

function downloadClientsCsv(
  clients: Client[],
  clientStats: Record<number, ClientStats>,
  employees: Employee[]
) {
  const headers = ['Название', 'Начислено', 'Оплачено', 'Начало', 'Завершение', 'Менеджер']
  const rows = clients.map((client) => {
    const stats = clientStats[client.id] ?? { charged: 0, paid: 0, start: null, end: null }
    const emp = client.employees
    const managerName = Array.isArray(emp) ? emp[0]?.name : (emp as Employee | null)?.name
    const manager = managerName ?? employees.find((e) => e.id === client.manager_id)?.name ?? ''
    return [
      client.name,
      String(stats.charged),
      String(stats.paid),
      stats.start ?? '',
      stats.end ?? '',
      manager,
    ].map(escapeCsvCell)
  })
  const csv = [headers.map(escapeCsvCell).join(CSV_SEP), ...rows.map((r) => r.join(CSV_SEP))].join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `клиенты_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [clientStats, setClientStats] = useState<Record<number, ClientStats>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    legal_name: '',
    manager_id: '',
  })
  const [employees, setEmployees] = useState<Employee[]>([])
  const [updatingId, setUpdatingId] = useState<number | null>(null)
  const [vipClientId, setVipClientId] = useState<number | null>(null)
  const [debtClientId, setDebtClientId] = useState<number | null>(null)

  const supabase = createClient()

  // Пасхалка: через 5 сек показываем VIP-значок у клиента с макс. суммой оплат
  useEffect(() => {
    if (loading || clients.length === 0) return
    const t = setTimeout(() => {
      let maxPaid = 0
      let bestId: number | null = null
      clients.forEach((c) => {
        const paid = clientStats[c.id]?.paid ?? 0
        if (paid > maxPaid) {
          maxPaid = paid
          bestId = c.id
        }
      })
      if (bestId != null && maxPaid > 0) setVipClientId(bestId)
    }, 5000)
    return () => clearTimeout(t)
  }, [loading, clients, clientStats])

  // Пасхалка: через 10 сек показываем "внимание" у клиента с макс. задолженностью
  useEffect(() => {
    if (loading || clients.length === 0) return
    const t = setTimeout(() => {
      let maxDebt = 0
      let worstId: number | null = null
      clients.forEach((c) => {
        const stats = clientStats[c.id] ?? { charged: 0, paid: 0, start: null, end: null }
        const debt = stats.charged - stats.paid
        if (debt > maxDebt) {
          maxDebt = debt
          worstId = c.id
        }
      })
      if (worstId != null && maxDebt > 0) setDebtClientId(worstId)
    }, 10000)
    return () => clearTimeout(t)
  }, [loading, clients, clientStats])

  const updateClient = async (id: number, patch: Partial<Pick<Client, 'manager_id'>>) => {
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
    const [clientsRes, chargesRes, paymentsRes] = await Promise.all([
      supabase.from('clients').select('id, name, manager_id, created_at, employees(id, name)').order('id', { ascending: false }),
      supabase.from('charges').select('client_id, amount, start_date, end_date'),
      supabase.from('payments').select('client_id, amount'),
    ])
    const err = clientsRes.error?.message ?? chargesRes.error?.message ?? paymentsRes.error?.message ?? null
    if (err) {
      setError(err)
      if (clientsRes.error) {
        setClients([])
        setClientStats({})
      }
    }
    if (!clientsRes.error) {
      setClients((clientsRes.data ?? []) as Client[])
    }
    if (!clientsRes.error && !chargesRes.error && !paymentsRes.error) {
      const stats: Record<number, ClientStats> = {}
      const charges = (chargesRes.data ?? []) as { client_id: number; amount: number; start_date: string | null; end_date: string | null }[]
      const payments = (paymentsRes.data ?? []) as { client_id: number; amount: number }[]
      charges.forEach((c) => {
        if (c.client_id == null) return
        if (!stats[c.client_id]) stats[c.client_id] = { charged: 0, paid: 0, start: null, end: null }
        stats[c.client_id].charged += Number(c.amount)
        if (c.start_date && (!stats[c.client_id].start || c.start_date < stats[c.client_id].start!)) stats[c.client_id].start = c.start_date
        if (c.end_date && (!stats[c.client_id].end || c.end_date > stats[c.client_id].end!)) stats[c.client_id].end = c.end_date
      })
      payments.forEach((p) => {
        if (p.client_id == null) return
        if (!stats[p.client_id]) stats[p.client_id] = { charged: 0, paid: 0, start: null, end: null }
        stats[p.client_id].paid += Number(p.amount)
      })
      setClientStats(stats)
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
    })
    if (insertError) {
      setError(insertError.message)
      setSaving(false)
      return
    }
    setForm({ name: '', legal_name: '', manager_id: '' })
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
          <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-4">
            <label className="min-w-[200px] flex-1">
              <span className="mb-1 block text-sm font-medium text-[var(--muted-foreground)]">Название *</span>
              <input
                id="name"
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-zinc-900 placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-400"
                placeholder="Название клиента"
              />
            </label>
            <label className="min-w-[200px] flex-1">
              <span className="mb-1 block text-sm font-medium text-[var(--muted-foreground)]">Юридическое название</span>
              <input
                id="legal_name"
                type="text"
                value={form.legal_name}
                onChange={(e) => setForm((f) => ({ ...f, legal_name: e.target.value }))}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-zinc-900 placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-400"
                placeholder="ООО «Пример»"
              />
            </label>
            <label className="min-w-[160px]">
              <span className="mb-1 block text-sm font-medium text-[var(--muted-foreground)]">Менеджер</span>
              <select
                id="manager_id"
                value={form.manager_id}
                onChange={(e) => setForm((f) => ({ ...f, manager_id: e.target.value }))}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              >
                <option value="">— не выбран</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              disabled={saving}
              className="h-[42px] shrink-0 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-500 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:bg-blue-500 dark:hover:bg-blue-400"
            >
              {saving ? 'Сохранение…' : 'Добавить клиента'}
            </button>
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
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-medium text-[var(--foreground)]">
              Клиенты Pass-Port
            </h2>
            <button
              type="button"
              onClick={() => downloadClientsCsv(clients, clientStats, employees)}
              disabled={loading || clients.length === 0}
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-medium text-[var(--foreground)] shadow-sm transition hover:bg-[var(--muted)]/10 disabled:opacity-50"
            >
              Выгрузить в CSV
            </button>
          </div>
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
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--muted)]">Название</th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-[var(--muted)]">Начислено</th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-[var(--muted)]">Оплачено</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--muted)]">Начало</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--muted)]">Завершение</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--muted)]">Менеджер</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {clients.map((client) => {
                    const stats = clientStats[client.id] ?? { charged: 0, paid: 0, start: null, end: null }
                    return (
                      <tr key={client.id} className="hover:bg-[var(--background)]/80 transition-colors">
                        <td className="px-4 py-2 text-sm font-medium text-[var(--foreground)]">
                          <span className="inline-flex items-center gap-1.5">
                            <Link href={`/clients/${client.id}`} className="text-blue-600 hover:underline dark:text-blue-400">
                              {client.name}
                            </Link>
                            {/* Место под VIP-значок заранее */}
                            <span className="inline-flex h-8 w-10 shrink-0 items-center justify-center" style={{ minWidth: '2.5rem' }}>
                              {vipClientId === client.id && (
                                <span
                                  className="vip-badge-enter relative inline-flex h-5 w-5 items-center justify-center"
                                  title="Лучший клиент по сумме оплат"
                                >
                                  {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                                    <span
                                      key={i}
                                      className={`vip-fw-particle vip-fw-${i} absolute z-20 h-2 w-2 rounded-full bg-emerald-400 shadow-sm dark:bg-emerald-300`}
                                      style={{ animationDelay: `${i * 0.04}s` }}
                                    />
                                  ))}
                                  <svg
                                    className="relative z-10 size-5 text-emerald-500 drop-shadow-sm dark:text-emerald-400"
                                    viewBox="0 0 24 24"
                                    fill="currentColor"
                                    aria-hidden
                                  >
                                    <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5m14 3a1 1 0 01-1 1H6a1 1 0 01-1-1v-1h14v1z" />
                                  </svg>
                                </span>
                              )}
                            </span>
                            {/* Место под значок «внимание» (макс. задолженность) */}
                            <span className="inline-flex h-8 w-10 shrink-0 items-center justify-center" style={{ minWidth: '2.5rem' }}>
                              {debtClientId === client.id && (
                                <span
                                  className="vip-badge-enter relative inline-flex h-5 w-5 items-center justify-center"
                                  title="Наибольшая задолженность по оплатам"
                                >
                                  {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                                    <span
                                      key={i}
                                      className={`vip-fw-particle vip-fw-${i} absolute z-20 h-2 w-2 rounded-full bg-orange-500 shadow-sm dark:bg-orange-400`}
                                      style={{ animationDelay: `${i * 0.04}s` }}
                                    />
                                  ))}
                                  <svg
                                    className="relative z-10 size-5 text-orange-600 drop-shadow-sm dark:text-red-500"
                                    viewBox="0 0 24 24"
                                    fill="currentColor"
                                    aria-hidden
                                  >
                                    <path d="M12 2L1 21h22L12 2zm0 3.99L19.53 19H4.47L12 5.99zM11 10v4h2v-4h-2zm0 6v2h2v-2h-2z" />
                                  </svg>
                                </span>
                              )}
                            </span>
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right text-sm tabular-nums text-[var(--foreground)]">
                          {formatMoney(stats.charged)}
                        </td>
                        <td className="px-4 py-2 text-right text-sm tabular-nums text-[var(--foreground)]">
                          {formatMoney(stats.paid)}
                        </td>
                        <td className="px-4 py-2 text-sm text-[var(--muted)]">
                          {formatDate(stats.start)}
                        </td>
                        <td className="px-4 py-2 text-sm text-[var(--muted)]">
                          {formatDate(stats.end)}
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
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
