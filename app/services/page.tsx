'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import Nav from '../components/Nav'
import Breadcrumbs from '../components/Breadcrumbs'

type Service = {
  id: number
  name: string
  base_cost: number
  type?: string | null
  duration_days?: number | null
  created_at: string
}

const typeLabel = (t: string | null | undefined) =>
  t === 'subscription' ? 'Подписка' : 'Разовая'

const inputCls =
  'w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-zinc-900 placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 text-sm'

const inputSmCls =
  'rounded border border-zinc-200 bg-white px-2 py-1 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100'

type ServiceFormData = { name: string; cost: string; type: string; duration_days: string }

function validateForm(f: ServiceFormData): string[] {
  const errs: string[] = []
  if (!f.name.trim()) errs.push('Название')
  if (!f.cost.trim()) {
    errs.push('Стоимость')
  } else {
    const n = parseFloat(f.cost.replace(',', '.'))
    if (Number.isNaN(n) || n <= 0) errs.push('Стоимость (введите число > 0)')
  }
  if (f.type === 'subscription') {
    const d = parseInt(f.duration_days, 10)
    if (!f.duration_days.trim() || Number.isNaN(d) || d <= 0) errs.push('Длительность')
  }
  return errs
}

const emptyForm: ServiceFormData = { name: '', cost: '', type: 'one-time', duration_days: '' }

export default function ServicesPage() {
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [apiError, setApiError] = useState<string | null>(null)
  const [form, setForm] = useState<ServiceFormData>(emptyForm)

  // Инлайн-редактирование
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<ServiceFormData>(emptyForm)
  const [editSaving, setEditSaving] = useState(false)

  // Подтверждение удаления
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)

  const supabase = createClient()

  const fetchServices = async () => {
    setLoading(true)
    setApiError(null)
    const { data, error: fetchError } = await supabase
      .from('services')
      .select('id, name, base_cost, type, duration_days, created_at')
      .order('name')
    if (fetchError) {
      setApiError(fetchError.message)
      setServices([])
    } else {
      setServices((data ?? []) as Service[])
    }
    setLoading(false)
  }

  useEffect(() => { fetchServices() }, [])

  // ── Добавление ────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs = validateForm(form)
    if (errs.length) {
      setFormError('Заполните обязательные поля: ' + errs.join(', '))
      return
    }
    setFormError(null)
    setSaving(true)
    setApiError(null)
    const cost = parseFloat(form.cost.replace(',', '.'))
    const serviceType = form.type === 'subscription' ? 'subscription' : 'one-time'
    const durationDays = form.type === 'subscription' ? parseInt(form.duration_days, 10) : null
    const { error: insertError } = await supabase.from('services').insert({
      name: form.name.trim(),
      base_cost: cost,
      type: serviceType,
      duration_days: durationDays && durationDays > 0 ? durationDays : null,
    })
    if (insertError) {
      setApiError(insertError.message)
      setSaving(false)
      return
    }
    setForm(emptyForm)
    await fetchServices()
    setSaving(false)
  }

  // ── Редактирование ────────────────────────────────────────────────────────
  const startEdit = (s: Service) => {
    setEditingId(s.id)
    setDeleteConfirmId(null)
    setApiError(null)
    setEditForm({
      name: s.name,
      cost: String(s.base_cost),
      type: s.type ?? 'one-time',
      duration_days: s.duration_days != null ? String(s.duration_days) : '',
    })
  }

  const handleSaveEdit = async () => {
    const errs = validateForm(editForm)
    if (errs.length) {
      setApiError('Заполните обязательные поля: ' + errs.join(', '))
      return
    }
    setEditSaving(true)
    setApiError(null)
    const cost = parseFloat(editForm.cost.replace(',', '.'))
    const serviceType = editForm.type === 'subscription' ? 'subscription' : 'one-time'
    const durationDays = editForm.type === 'subscription' ? parseInt(editForm.duration_days, 10) : null
    const { error: updateError } = await supabase
      .from('services')
      .update({
        name: editForm.name.trim(),
        base_cost: cost,
        type: serviceType,
        duration_days: durationDays && durationDays > 0 ? durationDays : null,
      })
      .eq('id', editingId!)
    if (updateError) {
      setApiError(updateError.message)
      setEditSaving(false)
      return
    }
    setEditingId(null)
    await fetchServices()
    setEditSaving(false)
  }

  // ── Удаление ──────────────────────────────────────────────────────────────
  const handleDelete = async (id: number) => {
    setDeleting(true)
    setApiError(null)
    const { error: deleteError } = await supabase.from('services').delete().eq('id', id)
    if (deleteError) {
      setApiError(deleteError.message)
      setDeleting(false)
      return
    }
    setDeleteConfirmId(null)
    await fetchServices()
    setDeleting(false)
  }

  const formatCost = (n: number) =>
    new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n)

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Nav />
      <div className="mx-auto max-w-[84rem] px-4 py-8 sm:px-6">
        <Breadcrumbs items={[{ href: '/', label: 'Главная' }, { href: '/services', label: 'Услуги' }]} />
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Услуги</h1>

        {/* ── Форма добавления ─────────────────────────────────────────────── */}
        <section className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-medium text-[var(--foreground)]">Новая услуга</h2>
          <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-4">
            <label className="min-w-[200px] flex-1">
              <span className="mb-1 block text-sm font-medium text-[var(--muted-foreground)]">Название *</span>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className={inputCls}
                placeholder="Название услуги"
              />
            </label>
            <label className="min-w-[140px]">
              <span className="mb-1 block text-sm font-medium text-[var(--muted-foreground)]">Стоимость *</span>
              <input
                type="text"
                inputMode="decimal"
                value={form.cost}
                onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))}
                placeholder="0"
                className={inputCls}
              />
            </label>
            <label className="min-w-[160px]">
              <span className="mb-1 block text-sm font-medium text-[var(--muted-foreground)]">Тип *</span>
              <select
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value, duration_days: '' }))}
                className={inputCls}
              >
                <option value="one-time">Разовая</option>
                <option value="subscription">Подписка</option>
              </select>
            </label>
            {form.type === 'subscription' && (
              <label className="min-w-[140px]">
                <span className="mb-1 block text-sm font-medium text-[var(--muted-foreground)]">Длительность (дней) *</span>
                <input
                  type="number"
                  min={1}
                  value={form.duration_days}
                  onChange={(e) => setForm((f) => ({ ...f, duration_days: e.target.value }))}
                  placeholder="30, 90, 180, 365"
                  className={inputCls}
                />
              </label>
            )}
            <button
              type="submit"
              disabled={saving}
              className="h-[42px] shrink-0 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-500 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-400"
            >
              {saving ? 'Сохранение…' : 'Добавить'}
            </button>
          </form>
          {formError && (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400">
              {formError}
            </p>
          )}
        </section>

        {apiError && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
            {apiError}
          </div>
        )}

        {/* ── Список услуг ─────────────────────────────────────────────────── */}
        <section className="mt-8">
          <h2 className="mb-4 text-lg font-medium text-[var(--foreground)]">Список услуг</h2>
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
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--muted)]">Название</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--muted)]">Базовая стоимость</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--muted)]">Тип</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[var(--muted)]">Длительность (дней)</th>
                    <th className="px-4 py-3 w-40"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {services.map((s) => {
                    const isEditing = editingId === s.id
                    const isDeleteConfirm = deleteConfirmId === s.id

                    // ── Строка редактирования ────────────────────────────────
                    if (isEditing) {
                      return (
                        <tr key={s.id} className="bg-blue-50/50 dark:bg-blue-950/20">
                          <td className="px-4 py-2">
                            <input
                              value={editForm.name}
                              onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                              className={`${inputSmCls} w-full`}
                              placeholder="Название"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={editForm.cost}
                              onChange={e => setEditForm(f => ({ ...f, cost: e.target.value }))}
                              className={`${inputSmCls} w-28`}
                              placeholder="0"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <select
                              value={editForm.type}
                              onChange={e => setEditForm(f => ({ ...f, type: e.target.value, duration_days: '' }))}
                              className={inputSmCls}
                            >
                              <option value="one-time">Разовая</option>
                              <option value="subscription">Подписка</option>
                            </select>
                          </td>
                          <td className="px-4 py-2">
                            {editForm.type === 'subscription' ? (
                              <input
                                type="number"
                                min={1}
                                value={editForm.duration_days}
                                onChange={e => setEditForm(f => ({ ...f, duration_days: e.target.value }))}
                                className={`${inputSmCls} w-24`}
                                placeholder="30"
                              />
                            ) : (
                              <span className="text-sm text-[var(--muted)]">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={handleSaveEdit}
                              disabled={editSaving}
                              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                            >
                              {editSaving ? '…' : 'Сохранить'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              disabled={editSaving}
                              className="ml-2 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted-foreground)] hover:bg-[var(--border)]/50 disabled:opacity-50"
                            >
                              Отмена
                            </button>
                          </td>
                        </tr>
                      )
                    }

                    // ── Строка подтверждения удаления ────────────────────────
                    if (isDeleteConfirm) {
                      return (
                        <tr key={s.id} className="bg-red-50/60 dark:bg-red-950/20">
                          <td colSpan={4} className="px-4 py-3 text-sm text-[var(--foreground)]">
                            Удалить{' '}
                            <span className="font-semibold">«{s.name}»</span>?{' '}
                            <span className="text-[var(--muted)]">Действие необратимо.</span>
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => handleDelete(s.id)}
                              disabled={deleting}
                              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-50"
                            >
                              {deleting ? '…' : 'Да, удалить'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmId(null)}
                              disabled={deleting}
                              className="ml-2 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted-foreground)] hover:bg-[var(--border)]/50 disabled:opacity-50"
                            >
                              Отмена
                            </button>
                          </td>
                        </tr>
                      )
                    }

                    // ── Обычная строка ───────────────────────────────────────
                    return (
                      <tr key={s.id} className="hover:bg-[var(--background)]/80 transition-colors">
                        <td className="px-4 py-3 text-sm font-medium text-[var(--foreground)]">{s.name}</td>
                        <td className="px-4 py-3 text-sm text-[var(--muted-foreground)]">{formatCost(Number(s.base_cost))} ₽</td>
                        <td className="px-4 py-3 text-sm text-[var(--muted-foreground)]">{typeLabel(s.type)}</td>
                        <td className="px-4 py-3 text-sm text-[var(--muted-foreground)]">
                          {s.duration_days != null ? s.duration_days : '—'}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => startEdit(s)}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            Изменить
                          </button>
                          <button
                            type="button"
                            onClick={() => { setDeleteConfirmId(s.id); setEditingId(null) }}
                            className="ml-3 text-xs text-red-500 hover:underline"
                          >
                            Удалить
                          </button>
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
