'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import Nav from '../components/Nav'
import Breadcrumbs from '../components/Breadcrumbs'

type Position = {
  id: number
  name: string
}

type Employee = {
  id: number
  name: string
  position_id: number | null
  /** Supabase для связи many-to-one может вернуть объект или массив */
  positions: Position | Position[] | null
  created_at: string
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', position_id: '' })
  const [updatingId, setUpdatingId] = useState<number | null>(null)

  const supabase = createClient()

  const handlePositionChange = async (employeeId: number, positionId: string) => {
    setUpdatingId(employeeId)
    setError(null)
    const { error: updateError } = await supabase
      .from('employees')
      .update({ position_id: positionId ? Number(positionId) : null })
      .eq('id', employeeId)
    if (updateError) {
      setError(updateError.message)
    } else {
      await fetchEmployees()
    }
    setUpdatingId(null)
  }

  const fetchEmployees = async () => {
    setLoading(true)
    setError(null)
    const { data, error: fetchError } = await supabase
      .from('employees')
      .select('id, name, position_id, created_at, positions(id, name)')
      .order('name')
    if (fetchError) {
      setError(fetchError.message)
      setEmployees([])
    } else {
      setEmployees((data ?? []) as Employee[])
    }
    setLoading(false)
  }

  const fetchPositions = async () => {
    const { data, error: posError } = await supabase.from('positions').select('id, name').order('name')
    if (posError) setError((prev) => prev || posError.message)
    else setPositions((data ?? []) as Position[])
  }

  useEffect(() => {
    fetchEmployees()
    fetchPositions()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    setError(null)
    const { error: insertError } = await supabase.from('employees').insert({
      name: form.name.trim(),
      position_id: form.position_id ? Number(form.position_id) : null,
    })
    if (insertError) {
      setError(insertError.message)
      setSaving(false)
      return
    }
    setForm({ name: '', position_id: '' })
    await fetchEmployees()
    setSaving(false)
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Nav />
      <div className="mx-auto max-w-[84rem] px-4 py-8 sm:px-6">
        <Breadcrumbs items={[{ href: '/', label: 'Главная' }, { href: '/employees', label: 'Сотрудники' }]} />
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          Сотрудники
        </h1>

        <section className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-medium text-[var(--foreground)]">
            Новый сотрудник
          </h2>
          <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-4">
            <div className="min-w-[200px]">
              <label htmlFor="name" className="mb-1 block text-sm font-medium text-[var(--muted-foreground)]">
                Имя *
              </label>
              <input
                id="name"
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-zinc-900 placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                placeholder="Имя сотрудника"
              />
            </div>
            <div className="min-w-[220px]">
              <label htmlFor="position_id" className="mb-1 block text-sm font-medium text-[var(--muted-foreground)]">
                Должность
              </label>
              <select
                id="position_id"
                value={form.position_id}
                onChange={(e) => setForm((f) => ({ ...f, position_id: e.target.value }))}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              >
                <option value="">— не выбрана</option>
                {positions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-500 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-400"
            >
              {saving ? 'Сохранение…' : 'Добавить сотрудника'}
            </button>
          </form>
        </section>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        )}

        <section className="mt-8">
          <h2 className="mb-4 text-lg font-medium text-[var(--foreground)]">
            Список сотрудников
          </h2>
          {loading ? (
            <p className="text-[var(--muted)]">Загрузка…</p>
          ) : employees.length === 0 ? (
            <p className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 text-[var(--muted)]">
              Сотрудников пока нет. Добавьте первого выше.
            </p>
          ) : (
            <div className="overflow-auto rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm max-h-[70vh]">
              <table className="min-w-full divide-y divide-[var(--border)]">
                <thead className="sticky top-0 z-10 bg-[var(--card)] shadow-sm">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
                      Имя
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
                      Должность
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {employees.map((emp) => (
                    <tr key={emp.id} className="hover:bg-[var(--background)]/80 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-[var(--foreground)]">
                        {emp.name}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={emp.position_id ?? ''}
                          onChange={(e) => handlePositionChange(emp.id, e.target.value)}
                          disabled={updatingId === emp.id}
                          className="w-full max-w-xs rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                        >
                          <option value="">— не выбрана</option>
                          {positions.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
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
