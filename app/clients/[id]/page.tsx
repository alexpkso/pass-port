'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import Nav from '../../components/Nav'
import Breadcrumbs from '../../components/Breadcrumbs'
import ConfirmDialog from '../../components/ConfirmDialog'

type Employee = { id: number; name: string }
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
type Charge = {
  id: number
  client_id: number
  service_name: string
  start_date: string
  end_date: string
  amount: number
  comment: string | null
  created_at: string
}
type Payment = {
  id: number
  client_id: number
  service_name: string
  amount: number
  comment: string | null
  created_at: string
}
type Service = { id: number; name: string; base_cost: number }

const formatDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('ru-RU') : '—')
const formatMoney = (n: number) => new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n) + ' ₽'

export default function ClientCardPage() {
  const params = useParams()
  const id = Number(params?.id)
  const [client, setClient] = useState<Client | null>(null)
  const [charges, setCharges] = useState<Charge[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [chargeForm, setChargeForm] = useState({ service_name: '', start_date: '', end_date: '', amount: '', comment: '' })
  const [paymentForm, setPaymentForm] = useState({ service_name: '', amount: '', comment: '' })
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState<{ open: boolean; type: 'charge' | 'payment'; id: number; data?: Partial<Charge> | Partial<Payment> }>({ open: false, type: 'charge', id: 0 })
  const [editingCharge, setEditingCharge] = useState<Charge | null>(null)
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null)
  const [services, setServices] = useState<Service[]>([])

  const supabase = createClient()

  const fetchServices = async () => {
    const { data } = await supabase.from('services').select('id, name, base_cost').order('name')
    setServices((data ?? []) as Service[])
  }

  const fetchClient = async () => {
    if (!id) return
    const { data, error: e } = await supabase
      .from('clients')
      .select('id, name, legal_name, manager_id, subscription_start, subscription_end, created_at, employees(id, name)')
      .eq('id', id)
      .single()
    if (e) {
      setError(e.message)
      setClient(null)
      return
    }
    setClient(data as Client)
  }

  const fetchCharges = async () => {
    if (!id) return
    const { data } = await supabase.from('charges').select('*').eq('client_id', id).order('start_date', { ascending: false })
    setCharges((data ?? []) as Charge[])
  }

  const fetchPayments = async () => {
    if (!id) return
    const { data } = await supabase.from('payments').select('*').eq('client_id', id).order('created_at', { ascending: false })
    setPayments((data ?? []) as Payment[])
  }

  useEffect(() => {
    if (!id || isNaN(id)) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    Promise.all([fetchClient(), fetchCharges(), fetchPayments(), fetchServices()]).then(() => setLoading(false))
  }, [id])

  const handleAddCharge = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!id || !chargeForm.service_name.trim()) return
    setSaving(true)
    const amount = chargeForm.amount.trim() ? parseFloat(chargeForm.amount.replace(',', '.')) : 0
    const { error: e2 } = await supabase.from('charges').insert({
      client_id: id,
      service_name: chargeForm.service_name.trim(),
      start_date: chargeForm.start_date || null,
      end_date: chargeForm.end_date || null,
      amount: Number.isNaN(amount) ? 0 : amount,
      comment: chargeForm.comment.trim() || null,
    })
    if (e2) setError(e2.message)
    else {
      setChargeForm({ service_name: '', start_date: '', end_date: '', amount: '', comment: '' })
      await fetchCharges()
    }
    setSaving(false)
  }

  const handleAddPayment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!id || !paymentForm.service_name.trim()) return
    setSaving(true)
    const amount = paymentForm.amount.trim() ? parseFloat(paymentForm.amount.replace(',', '.')) : 0
    const { error: e2 } = await supabase.from('payments').insert({
      client_id: id,
      service_name: paymentForm.service_name.trim(),
      amount: Number.isNaN(amount) ? 0 : amount,
      comment: paymentForm.comment.trim() || null,
    })
    if (e2) setError(e2.message)
    else {
      setPaymentForm({ service_name: '', amount: '', comment: '' })
      await fetchPayments()
    }
    setSaving(false)
  }

  const openConfirm = (type: 'charge' | 'payment', rowId: number, data?: Partial<Charge> | Partial<Payment>) => {
    setConfirm({ open: true, type, id: rowId, data })
  }

  const handleConfirmEdit = async () => {
    if (confirm.type === 'charge' && confirm.data) {
      await supabase.from('charges').update(confirm.data).eq('id', confirm.id)
      await fetchCharges()
      setEditingCharge(null)
    }
    if (confirm.type === 'payment' && confirm.data) {
      await supabase.from('payments').update(confirm.data).eq('id', confirm.id)
      await fetchPayments()
      setEditingPayment(null)
    }
    setConfirm({ open: false, type: 'charge', id: 0 })
  }

  const requestChargeUpdate = (data: Partial<Charge>) => {
    if (!editingCharge) return
    setConfirm({ open: true, type: 'charge', id: editingCharge.id, data })
  }

  const requestPaymentUpdate = (data: Partial<Payment>) => {
    if (!editingPayment) return
    setConfirm({ open: true, type: 'payment', id: editingPayment.id, data })
  }

  if (loading || !client) {
    return (
      <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
        <Nav />
        <div className="mx-auto max-w-[84rem] px-4 py-8 sm:px-6">
          <Breadcrumbs items={[{ href: '/', label: 'Главная' }, { href: '/clients', label: 'Клиенты' }, { href: '#', label: '…' }]} />
          <p className="mt-4 text-[var(--muted)]">{loading ? 'Загрузка…' : error || 'Клиент не найден.'}</p>
        </div>
      </div>
    )
  }

  const totalCharged = charges.reduce((s, c) => s + Number(c.amount), 0)
  const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0)

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Nav />
      <div className="mx-auto max-w-[84rem] px-4 py-8 sm:px-6">
        <Breadcrumbs items={[{ href: '/', label: 'Главная' }, { href: '/clients', label: 'Клиенты' }, { href: `/clients/${id}`, label: client.name }]} />
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{client.name}</h1>

        {/* Информация о клиенте */}
        <section className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
          <h2 className="text-lg font-medium text-[var(--foreground)]">Данные клиента</h2>
          <dl className="mt-4 grid gap-2 sm:grid-cols-2">
            <div><dt className="text-sm text-[var(--muted)]">Юридическое название</dt><dd className="font-medium">{client.legal_name ?? '—'}</dd></div>
            <div><dt className="text-sm text-[var(--muted)]">Менеджер</dt><dd className="font-medium">{client.employees?.name ?? '—'}</dd></div>
            <div><dt className="text-sm text-[var(--muted)]">Начало подписки</dt><dd className="font-medium">{formatDate(client.subscription_start)}</dd></div>
            <div><dt className="text-sm text-[var(--muted)]">Конец подписки</dt><dd className="font-medium">{formatDate(client.subscription_end)}</dd></div>
            <div><dt className="text-sm text-[var(--muted)]">Создан</dt><dd className="font-medium">{formatDate(client.created_at)}</dd></div>
          </dl>
        </section>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">{error}</div>
        )}

        {/* Начисления */}
        <section className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
          <h2 className="text-lg font-medium text-[var(--foreground)]">Начисления</h2>
          <form onSubmit={handleAddCharge} className="mt-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-end gap-3">
              <label className="min-w-[180px] flex-1">
                <span className="mb-1 block text-xs text-[var(--muted)]">Услуга</span>
                <select
                  required
                  value={chargeForm.service_name}
                  onChange={e => {
                    const name = e.target.value
                    const svc = services.find(s => s.name === name)
                    setChargeForm(f => ({ ...f, service_name: name, amount: svc ? String(svc.base_cost) : f.amount }))
                  }}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
                >
                  <option value="">— выбрать из справочника —</option>
                  {services.map(s => (
                    <option key={s.id} value={s.name}>{s.name} ({formatMoney(Number(s.base_cost))})</option>
                  ))}
                </select>
              </label>
              <label className="min-w-[140px]">
                <span className="mb-1 block text-xs text-[var(--muted)]">Начало</span>
                <input type="date" value={chargeForm.start_date} onChange={e => setChargeForm(f => ({ ...f, start_date: e.target.value }))} className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800" />
              </label>
              <label className="min-w-[140px]">
                <span className="mb-1 block text-xs text-[var(--muted)]">Конец</span>
                <input type="date" value={chargeForm.end_date} onChange={e => setChargeForm(f => ({ ...f, end_date: e.target.value }))} className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800" />
              </label>
              <label className="min-w-[120px]">
                <span className="mb-1 block text-xs text-[var(--muted)]">Стоимость</span>
                <input value={chargeForm.amount} onChange={e => setChargeForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800" />
              </label>
              <button type="submit" disabled={saving} className="h-[42px] shrink-0 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50">Добавить</button>
            </div>
            <label>
              <span className="mb-1 block text-xs text-[var(--muted)]">Комментарий</span>
              <input value={chargeForm.comment} onChange={e => setChargeForm(f => ({ ...f, comment: e.target.value }))} placeholder="Комментарий" className="w-full max-w-md rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800" />
            </label>
          </form>
          <div className="mt-4 overflow-auto max-h-64 rounded-lg border border-[var(--border)]">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-[var(--card)]">
                <tr><th className="px-3 py-2 text-left text-[var(--muted)]">Услуга</th><th className="px-3 py-2 text-left text-[var(--muted)]">Начало</th><th className="px-3 py-2 text-left text-[var(--muted)]">Конец</th><th className="px-3 py-2 text-right text-[var(--muted)]">Сумма</th><th className="px-3 py-2 text-left text-[var(--muted)]">Комментарий</th><th className="px-3 py-2 w-24"></th></tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {charges.map(c => (
                  <tr key={c.id}>
                    {editingCharge?.id === c.id ? (
                      <>
                        <td className="px-3 py-2">
                          <select className="min-w-[140px] rounded border border-zinc-200 bg-white px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-800" id={`c-sn-${c.id}`} defaultValue={c.service_name}>
                            {!services.some(s => s.name === c.service_name) && <option value={c.service_name}>{c.service_name}</option>}
                            {services.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2"><input type="date" className="rounded border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-800" defaultValue={c.start_date || ''} id={`c-sd-${c.id}`} /></td>
                        <td className="px-3 py-2"><input type="date" className="rounded border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-800" defaultValue={c.end_date || ''} id={`c-ed-${c.id}`} /></td>
                        <td className="px-3 py-2"><input type="text" className="w-20 rounded border border-zinc-200 px-2 py-1 text-sm text-right dark:border-zinc-600 dark:bg-zinc-800" defaultValue={c.amount} id={`c-am-${c.id}`} /></td>
                        <td className="px-3 py-2"><input className="w-full rounded border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-800" defaultValue={c.comment || ''} id={`c-cm-${c.id}`} /></td>
                        <td className="px-3 py-2">
                          <button type="button" onClick={() => { const sn = (document.getElementById(`c-sn-${c.id}`) as HTMLSelectElement)?.value; const sd = (document.getElementById(`c-sd-${c.id}`) as HTMLInputElement)?.value; const ed = (document.getElementById(`c-ed-${c.id}`) as HTMLInputElement)?.value; const am = (document.getElementById(`c-am-${c.id}`) as HTMLInputElement)?.value; const cm = (document.getElementById(`c-cm-${c.id}`) as HTMLInputElement)?.value; requestChargeUpdate({ service_name: sn, start_date: sd || null, end_date: ed || null, amount: am ? parseFloat(am.replace(',', '.')) : 0, comment: cm || null }); }} className="text-blue-600 text-xs hover:underline">Сохранить</button>
                          <button type="button" onClick={() => setEditingCharge(null)} className="ml-1 text-zinc-500 text-xs hover:underline">Отмена</button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2">{c.service_name}</td>
                        <td className="px-3 py-2">{formatDate(c.start_date)}</td>
                        <td className="px-3 py-2">{formatDate(c.end_date)}</td>
                        <td className="px-3 py-2 text-right">{formatMoney(Number(c.amount))}</td>
                        <td className="px-3 py-2 text-[var(--muted)]">{c.comment ?? '—'}</td>
                        <td className="px-3 py-2"><button type="button" onClick={() => setEditingCharge(c)} className="text-blue-600 text-xs hover:underline">Изменить</button></td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Оплаты */}
        <section className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
          <h2 className="text-lg font-medium text-[var(--foreground)]">Оплаты</h2>
          <form onSubmit={handleAddPayment} className="mt-4 flex flex-wrap items-end gap-3">
            <label className="min-w-[180px] flex-1">
              <span className="mb-1 block text-xs text-[var(--muted)]">Услуга</span>
              <select
                required
                value={paymentForm.service_name}
                onChange={e => setPaymentForm(f => ({ ...f, service_name: e.target.value }))}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
              >
                <option value="">— выбрать из справочника —</option>
                {services.map(s => (
                  <option key={s.id} value={s.name}>{s.name}</option>
                ))}
              </select>
            </label>
            <label className="min-w-[120px]">
              <span className="mb-1 block text-xs text-[var(--muted)]">Сумма</span>
              <input value={paymentForm.amount} onChange={e => setPaymentForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800" />
            </label>
            <label className="min-w-[180px] flex-1">
              <span className="mb-1 block text-xs text-[var(--muted)]">Комментарий</span>
              <input value={paymentForm.comment} onChange={e => setPaymentForm(f => ({ ...f, comment: e.target.value }))} placeholder="Комментарий" className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800" />
            </label>
            <button type="submit" disabled={saving} className="h-[42px] shrink-0 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50">Добавить</button>
          </form>
          <div className="mt-4 overflow-auto max-h-64 rounded-lg border border-[var(--border)]">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-[var(--card)]">
                <tr><th className="px-3 py-2 text-left text-[var(--muted)]">Услуга</th><th className="px-3 py-2 text-right text-[var(--muted)]">Сумма</th><th className="px-3 py-2 text-left text-[var(--muted)]">Комментарий</th><th className="px-3 py-2 w-24"></th></tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {payments.map(p => (
                  <tr key={p.id}>
                    {editingPayment?.id === p.id ? (
                      <>
                        <td className="px-3 py-2">
                          <select className="min-w-[140px] rounded border border-zinc-200 bg-white px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-800" id={`p-sn-${p.id}`} defaultValue={p.service_name}>
                            {!services.some(s => s.name === p.service_name) && <option value={p.service_name}>{p.service_name}</option>}
                            {services.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2"><input type="text" className="w-20 rounded border border-zinc-200 px-2 py-1 text-sm text-right dark:border-zinc-600 dark:bg-zinc-800" defaultValue={p.amount} id={`p-am-${p.id}`} /></td>
                        <td className="px-3 py-2"><input className="w-full rounded border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-800" defaultValue={p.comment || ''} id={`p-cm-${p.id}`} /></td>
                        <td className="px-3 py-2">
                          <button type="button" onClick={() => { const sn = (document.getElementById(`p-sn-${p.id}`) as HTMLSelectElement)?.value; const am = (document.getElementById(`p-am-${p.id}`) as HTMLInputElement)?.value; const cm = (document.getElementById(`p-cm-${p.id}`) as HTMLInputElement)?.value; requestPaymentUpdate({ service_name: sn, amount: am ? parseFloat(am.replace(',', '.')) : 0, comment: cm || null }); }} className="text-blue-600 text-xs hover:underline">Сохранить</button>
                          <button type="button" onClick={() => setEditingPayment(null)} className="ml-1 text-zinc-500 text-xs hover:underline">Отмена</button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2">{p.service_name}</td>
                        <td className="px-3 py-2 text-right">{formatMoney(Number(p.amount))}</td>
                        <td className="px-3 py-2 text-[var(--muted)]">{p.comment ?? '—'}</td>
                        <td className="px-3 py-2"><button type="button" onClick={() => setEditingPayment(p)} className="text-blue-600 text-xs hover:underline">Изменить</button></td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Сводка и график начислений */}
        <section className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
          <h2 className="text-lg font-medium text-[var(--foreground)]">Дашборд начислений</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">Всего начислено: {formatMoney(totalCharged)} · Оплачено: {formatMoney(totalPaid)} · Доля оплаты: {totalCharged ? Math.round((totalPaid / totalCharged) * 100) : 0}%</p>
          <div className="mt-6">
            <ClientChargesChart charges={charges} payments={payments} />
          </div>
        </section>
      </div>

      <ConfirmDialog
        open={confirm.open}
        title="Подтверждение"
        message="Точно ли вы хотите изменить?"
        onConfirm={handleConfirmEdit}
        onCancel={() => setConfirm({ open: false, type: 'charge', id: 0 })}
      />
    </div>
  )
}

const CHART_HEIGHT_PX = 180
const MIN_BAR_HEIGHT_PX = 24

function ClientChargesChart({ charges, payments }: { charges: Charge[]; payments: Payment[] }) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0)
  const totalCharged = charges.reduce((s, c) => s + Number(c.amount), 0)
  const paidShare = totalCharged ? totalPaid / totalCharged : 0

  const byMonth = new Map<string, { total: number; byService: Record<string, number> }>()
  charges.forEach(c => {
    const dateStr = c.start_date || c.created_at
    if (!dateStr) return
    const start = new Date(dateStr)
    const key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`
    if (!byMonth.has(key)) byMonth.set(key, { total: 0, byService: {} })
    const rec = byMonth.get(key)!
    rec.total += Number(c.amount)
    rec.byService[c.service_name] = (rec.byService[c.service_name] ?? 0) + Number(c.amount)
  })

  const allServices = Array.from(new Set(charges.map(c => c.service_name)))
  const colorList = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']
  const colors: Record<string, string> = {}
  allServices.forEach((s, i) => { colors[s] = colorList[i % colorList.length] })

  const nowY = today.getFullYear()
  const nowM = today.getMonth()
  const currentKey = `${nowY}-${String(nowM + 1).padStart(2, '0')}`
  const centerMonths: string[] = []
  for (let i = -6; i <= 6; i++) {
    const d = new Date(nowY, nowM + i, 1)
    centerMonths.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const dataMonths = Array.from(byMonth.keys()).sort()
  const monthKeys = Array.from(new Set([...dataMonths, ...centerMonths])).sort()

  const maxSum = Math.max(1, ...Array.from(byMonth.values()).map(r => r.total))

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--muted)]">Ось X — время (месяц), ось Y — сумма (₽). Сплошные столбики — прошлое, пунктир — будущее. Зелёная часть — доля оплаты.</p>
      <div className="overflow-x-auto">
        <div className="inline-flex items-end gap-1 pb-8 pt-2" style={{ minHeight: CHART_HEIGHT_PX + 48 }}>
          {/* Ось Y: подпись макс. суммы */}
          <div className="flex flex-col justify-between pr-2 text-right text-xs text-[var(--muted)]" style={{ height: CHART_HEIGHT_PX }}>
            <span>{formatMoney(maxSum)}</span>
            <span>0</span>
          </div>
          <div className="flex items-end gap-1.5">
            {monthKeys.map((key) => {
              const data = byMonth.get(key) ?? { total: 0, byService: {} }
              const [y, m] = key.split('-').map(Number)
              const monthDate = new Date(y, m - 1, 1)
              const isFuture = monthDate > today
              const isCurrent = key === currentKey
              const ratio = maxSum ? data.total / maxSum : 0
              const barHeightPx = data.total > 0 ? Math.max(MIN_BAR_HEIGHT_PX, Math.round(ratio * CHART_HEIGHT_PX)) : 0
              const paidHeightPx = barHeightPx * Math.min(1, paidShare)
              return (
                <div key={key} className="flex w-10 flex-shrink-0 flex-col items-center gap-1">
                  <div className="w-full" style={{ height: CHART_HEIGHT_PX }}>
                    {barHeightPx > 0 && (
                      <div
                        className="w-full rounded-t overflow-hidden border border-zinc-300 dark:border-zinc-600"
                        style={{
                          height: barHeightPx,
                          borderStyle: isFuture ? 'dashed' : 'solid',
                          display: 'flex',
                          flexDirection: 'column-reverse',
                        }}
                        title={`${key}: ${formatMoney(data.total)}${allServices.length ? ` (${Object.entries(data.byService).map(([s, v]) => `${s}: ${formatMoney(v)}`).join(', ')})` : ''}`}
                      >
                        {paidHeightPx > 0 && (
                          <div className="w-full bg-green-500/90 flex-shrink-0" style={{ height: paidHeightPx }} />
                        )}
                        {allServices.map(svc => {
                          const v = data.byService[svc] ?? 0
                          if (v <= 0) return null
                          const segPx = Math.round((v / data.total) * (barHeightPx - paidHeightPx))
                          if (segPx < 1) return null
                          return (
                            <div
                              key={svc}
                              className="w-full flex-shrink-0"
                              style={{
                                height: segPx,
                                background: isFuture ? `repeating-linear-gradient(-45deg, ${colors[svc] || '#94a3b8'}, ${colors[svc] || '#94a3b8'} 2px, transparent 2px, transparent 4px)` : (colors[svc] || '#3b82f6'),
                              }}
                            />
                          )
                        })}
                      </div>
                    )}
                  </div>
                  <span className={`text-xs ${isCurrent ? 'font-semibold text-blue-600' : 'text-[var(--muted)]'}`} title={isCurrent ? 'Текущая дата' : ''}>
                    {m}.{String(y).slice(2)}{isCurrent ? ' ✓' : ''}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      {allServices.length > 0 && (
        <div className="flex flex-wrap gap-4 text-xs text-[var(--muted)]">
          {allServices.slice(0, 5).map(s => <span key={s}><span className="inline-block w-3 h-3 rounded mr-1" style={{ background: colors[s] || '#94a3b8' }} />{s}</span>)}
          <span><span className="inline-block w-3 h-3 rounded bg-green-500/80 mr-1" /> Доля оплаты</span>
        </div>
      )}
      {charges.length === 0 && (
        <p className="text-sm text-[var(--muted)]">Нет начислений для графика. Добавьте начисления выше.</p>
      )}
    </div>
  )
}
