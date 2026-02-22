'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import Nav from '../components/Nav'
import Breadcrumbs from '../components/Breadcrumbs'

type Service = {
  id: number
  name: string
  base_cost: number
  created_at: string
}

export default function ServicesPage() {
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', cost: '' })

  const supabase = createClient()

  const fetchServices = async () => {
    setLoading(true)
    setError(null)
    const { data, error: fetchError } = await supabase
      .from('services')
      .select('id, name, base_cost, created_at')
      .order('name')
    if (fetchError) {
      setError(fetchError.message)
      setServices([])
    } else {
      setServices((data ?? []) as Service[])
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchServices()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return
    const cost = form.cost.trim() ? parseFloat(form.cost.replace(',', '.')) : 0
    if (Number.isNaN(cost) || cost < 0) {
      setError('Введите корректную стоимость')
      return
    }
    setSaving(true)
    setError(null)
    const { error: insertError } = await supabase.from('services').insert({
      name: form.name.trim(),
      base_cost: cost,
    })
    if (insertError) {
      setError(insertError.message)
      setSaving(false)
      return
    }
    setForm({ name: '', cost: '' })
    await fetchServices()
    setSaving(false)
  }

  const formatCost = (n: number) =>
    new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n)

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Nav />
      <div className="mx-auto max-w-[84rem] px-4 py-8 sm:px-6">
        <Breadcrumbs items={[{ href: '/', label: 'Главная' }, { href: '/services', label: 'Услуги' }]} />
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          Услуги
        </h1>

        <section className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-medium text-[var(--foreground)]">
            Новая услуга
          </h2>
          <form onSubmit={handleSubmit} className="grid max-w-2xl gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="name" className="mb-1 block text-sm font-medium text-[var(--muted-foreground)]">
                Название *
              </label>
              <input
                id="name"
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-zinc-900 placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                placeholder="Название услуги"
              />
            </div>
            <div>
              <label htmlFor="cost" className="mb-1 block text-sm font-medium text-[var(--muted-foreground)]">
                Стоимость
              </label>
              <input
                id="cost"
                type="text"
                inputMode="decimal"
                value={form.cost}
                onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))}
                placeholder="Базовая стоимость"
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-zinc-900 placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-500 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-400"
              >
                {saving ? 'Сохранение…' : 'Добавить услугу'}
              </button>
            </div>
          </form>
        </section>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        )}

        <section className="mt-8">
          <h2 className="mb-4 text-lg font-medium text-[var(--foreground)]">
            Список услуг
          </h2>
          {loading ? (
            <p className="text-[var(--muted)]">Загрузка…</p>
          ) : services.length === 0 ? (
            <p className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 text-[var(--muted)]">
              Услуг пока нет. Добавьте первую выше.
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
                      Базовая стоимость
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {services.map((s) => (
                    <tr key={s.id} className="hover:bg-[var(--background)]/80 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-[var(--foreground)]">
                        {s.name}
                      </td>
                      <td className="px-4 py-3 text-sm text-[var(--muted-foreground)]">
                        {formatCost(Number(s.base_cost))} ₽
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
