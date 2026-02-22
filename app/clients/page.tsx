'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'

type Client = {
  id: number
  name: string
  legal_name: string | null
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
    subscription_start: '',
    subscription_end: '',
  })

  const supabase = createClient()

  const fetchClients = async () => {
    setLoading(true)
    setError(null)
    const { data, error: fetchError } = await supabase
      .from('clients')
      .select('id, name, legal_name, subscription_start, subscription_end, created_at')
      .order('created_at', { ascending: false })
    if (fetchError) {
      setError(fetchError.message)
      setClients([])
    } else {
      setClients((data ?? []) as Client[])
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchClients()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    setError(null)
    const { error: insertError } = await supabase.from('clients').insert({
      name: form.name.trim(),
      legal_name: form.legal_name.trim() || null,
      subscription_start: form.subscription_start || null,
      subscription_end: form.subscription_end || null,
    })
    if (insertError) {
      setError(insertError.message)
      setSaving(false)
      return
    }
    setForm({ name: '', legal_name: '', subscription_start: '', subscription_end: '' })
    await fetchClients()
    setSaving(false)
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-foreground">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Клиенты
        </h1>

        {/* Форма добавления */}
        <section className="mt-8 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-sm">
          <h2 className="text-lg font-medium text-zinc-800 dark:text-zinc-200 mb-4">
            Новый клиент
          </h2>
          <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="name" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Название *
              </label>
              <input
                id="name"
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                placeholder="Название клиента"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="legal_name" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Юридическое название
              </label>
              <input
                id="legal_name"
                type="text"
                value={form.legal_name}
                onChange={(e) => setForm((f) => ({ ...f, legal_name: e.target.value }))}
                className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                placeholder="ООО «Пример»"
              />
            </div>
            <div>
              <label htmlFor="subscription_start" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Начало подписки
              </label>
              <input
                id="subscription_start"
                type="date"
                value={form.subscription_start}
                onChange={(e) => setForm((f) => ({ ...f, subscription_start: e.target.value }))}
                className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-zinc-100 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
              />
            </div>
            <div>
              <label htmlFor="subscription_end" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Конец подписки
              </label>
              <input
                id="subscription_end"
                type="date"
                value={form.subscription_end}
                onChange={(e) => setForm((f) => ({ ...f, subscription_end: e.target.value }))}
                className="w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-zinc-900 dark:text-zinc-100 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
              />
            </div>
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={saving || !form.name.trim()}
                className="rounded-lg bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 transition-colors hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50 disabled:pointer-events-none"
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
          <h2 className="text-lg font-medium text-zinc-800 dark:text-zinc-200 mb-4">
            Список клиентов
          </h2>
          {loading ? (
            <p className="text-zinc-500 dark:text-zinc-400">Загрузка…</p>
          ) : clients.length === 0 ? (
            <p className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 text-zinc-500 dark:text-zinc-400">
              Клиентов пока нет. Добавьте первого выше.
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm">
              <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-700">
                <thead>
                  <tr className="bg-zinc-50 dark:bg-zinc-800/50">
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                      Название
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                      Юр. название
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                      Начало подписки
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                      Конец подписки
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                      Создан
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-700">
                  {clients.map((client) => (
                    <tr key={client.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30">
                      <td className="px-4 py-3 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {client.name}
                      </td>
                      <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
                        {client.legal_name ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
                        {formatDate(client.subscription_start)}
                      </td>
                      <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
                        {formatDate(client.subscription_end)}
                      </td>
                      <td className="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-500">
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
