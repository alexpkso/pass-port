'use client'

import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
  /** Связь: Supabase может вернуть объект (many-to-one) или массив в зависимости от конфига */
  employees: Employee | Employee[] | null
  created_at: string
}
type Charge = {
  id: number
  client_id: number
  service_name: string
  start_date: string | null
  end_date: string | null
  amount: number
  comment: string | null
  created_at: string
}
type Payment = {
  id: number
  client_id: number
  service_name: string
  amount: number
  payment_date?: string
  comment: string | null
  created_at: string
}
type Service = { id: number; name: string; base_cost: number }
type JournalEntry = {
  id: number
  entry_date: string
  debit_account_code: string
  credit_account_code: string
  amount: number
  client_id: number
  service_name: string
  document_type: string
  document_id: number
  document_extra: string
  created_at: string
}

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
  const [chargeFormError, setChargeFormError] = useState<string | null>(null)
  const [paymentFormError, setPaymentFormError] = useState<string | null>(null)
  const [chargeForm, setChargeForm] = useState({ service_name: '', start_date: '', end_date: '', amount: '', comment: '' })
  const [paymentForm, setPaymentForm] = useState(() => ({
    service_name: '',
    amount: '',
    payment_date: new Date().toISOString().slice(0, 10),
    comment: '',
  }))
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState<{ open: boolean; type: 'charge' | 'payment' | 'client'; id: number; data?: Partial<Charge> | Partial<Payment>; action?: 'edit' | 'delete' }>({ open: false, type: 'charge', id: 0 })
  const [editingCharge, setEditingCharge] = useState<Charge | null>(null)
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null)
  const [services, setServices] = useState<Service[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [clientEdit, setClientEdit] = useState({ name: '', legal_name: '', manager_id: '' })
  const [selectedServiceFilter, setSelectedServiceFilter] = useState<string>('')
  const [chargeMenuOpen, setChargeMenuOpen] = useState<{ id: number; rect: DOMRect } | null>(null)
  const [paymentMenuOpen, setPaymentMenuOpen] = useState<{ id: number; rect: DOMRect } | null>(null)
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([])
  const [periodFrom, setPeriodFrom] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-01-01`
  })
  const [periodTo, setPeriodTo] = useState(() => {
    const d = new Date()
    return d.toISOString().slice(0, 10)
  })

  const supabase = createClient()

  const fetchServices = async () => {
    const { data } = await supabase.from('services').select('id, name, base_cost').order('name')
    setServices((data ?? []) as Service[])
  }

  const fetchEmployees = async () => {
    const { data } = await supabase.from('employees').select('id, name').order('name')
    setEmployees((data ?? []) as Employee[])
  }

  const fetchClient = async () => {
    if (!id) return
    const { data, error: e } = await supabase
      .from('clients')
      .select('id, name, legal_name, manager_id, created_at, employees(id, name)')
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
    const { data } = await supabase.from('payments').select('*').eq('client_id', id).order('payment_date', { ascending: false })
    setPayments((data ?? []) as Payment[])
  }

  const fetchJournalEntries = async () => {
    if (!id) return
    const { data } = await supabase
      .from('journal_entries')
      .select('id, entry_date, debit_account_code, credit_account_code, amount, client_id, service_name, document_type, document_id, document_extra, created_at')
      .eq('client_id', id)
      .order('entry_date', { ascending: true })
    setJournalEntries((data ?? []) as JournalEntry[])
  }

  useEffect(() => {
    if (!id || isNaN(id)) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    Promise.all([fetchClient(), fetchCharges(), fetchPayments(), fetchJournalEntries(), fetchServices(), fetchEmployees()]).then(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (client) {
      setClientEdit({
        name: client.name ?? '',
        legal_name: client.legal_name ?? '',
        manager_id: client.manager_id != null ? String(client.manager_id) : '',
      })
    }
  }, [client])

  const handleSaveClient = async () => {
    if (!id || !client) return
    if (!clientEdit.name.trim()) {
      setError('Укажите название клиента')
      return
    }
    setError(null)
    setSaving(true)
    const { error: e } = await supabase
      .from('clients')
      .update({
        name: clientEdit.name.trim(),
        legal_name: clientEdit.legal_name.trim() || null,
        manager_id: clientEdit.manager_id ? Number(clientEdit.manager_id) : null,
      })
      .eq('id', id)
    if (e) setError(e.message)
    else await fetchClient()
    setSaving(false)
  }

  const handleAddCharge = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!id) return
    const missing: string[] = []
    if (!chargeForm.service_name.trim()) missing.push('Услуга')
    if (!chargeForm.start_date) missing.push('Начало')
    if (!chargeForm.end_date) missing.push('Конец')
    if (!chargeForm.amount.trim()) missing.push('Стоимость')
    else if (Number.isNaN(parseFloat(chargeForm.amount.replace(',', '.')))) missing.push('Стоимость (число)')
    if (missing.length) {
      setChargeFormError('Заполните обязательные поля: ' + missing.join(', '))
      return
    }
    setChargeFormError(null)
    setSaving(true)
    const amount = parseFloat(chargeForm.amount.replace(',', '.'))
    const { error: e2 } = await supabase.from('charges').insert({
      client_id: id,
      service_name: chargeForm.service_name.trim(),
      start_date: chargeForm.start_date || null,
      end_date: chargeForm.end_date || null,
      amount,
      comment: chargeForm.comment.trim() || null,
    })
    if (e2) setChargeFormError(e2.message)
    else {
      setChargeForm({ service_name: '', start_date: '', end_date: '', amount: '', comment: '' })
      await Promise.all([fetchCharges(), fetchJournalEntries()])
    }
    setSaving(false)
  }

  const handleAddPayment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!id) return
    const missing: string[] = []
    if (!paymentForm.service_name.trim()) missing.push('Услуга')
    if (!paymentForm.payment_date) missing.push('Дата')
    if (!paymentForm.amount.trim()) missing.push('Сумма')
    else if (Number.isNaN(parseFloat(paymentForm.amount.replace(',', '.')))) missing.push('Сумма (число)')
    if (missing.length) {
      setPaymentFormError('Заполните обязательные поля: ' + missing.join(', '))
      return
    }
    setPaymentFormError(null)
    setSaving(true)
    const amount = parseFloat(paymentForm.amount.replace(',', '.'))
    const { error: e2 } = await supabase.from('payments').insert({
      client_id: id,
      service_name: paymentForm.service_name.trim(),
      amount,
      payment_date: paymentForm.payment_date,
      comment: paymentForm.comment.trim() || null,
    })
    if (e2) setPaymentFormError(e2.message)
    else {
      const today = new Date().toISOString().slice(0, 10)
      setPaymentForm({ service_name: '', amount: '', payment_date: today, comment: '' })
      await Promise.all([fetchPayments(), fetchJournalEntries()])
    }
    setSaving(false)
  }

  const openConfirm = (type: 'charge' | 'payment', rowId: number, data?: Partial<Charge> | Partial<Payment>, action?: 'edit' | 'delete') => {
    setConfirm({ open: true, type, id: rowId, data, action: action ?? (data ? 'edit' : undefined) })
  }

  const handleConfirmEdit = async () => {
    if (confirm.type === 'client') {
      await handleSaveClient()
      setConfirm({ open: false, type: 'charge', id: 0 })
      return
    }
    if (confirm.action === 'delete') {
      if (confirm.type === 'charge') {
        await supabase.from('charges').delete().eq('id', confirm.id)
        await Promise.all([fetchCharges(), fetchJournalEntries()])
        setEditingCharge(null)
      }
      if (confirm.type === 'payment') {
        await supabase.from('payments').delete().eq('id', confirm.id)
        await Promise.all([fetchPayments(), fetchJournalEntries()])
        setEditingPayment(null)
      }
    } else {
      if (confirm.type === 'charge' && confirm.data) {
        await supabase.from('charges').update(confirm.data).eq('id', confirm.id)
        await Promise.all([fetchCharges(), fetchJournalEntries()])
        setEditingCharge(null)
      }
      if (confirm.type === 'payment' && confirm.data) {
        await supabase.from('payments').update(confirm.data).eq('id', confirm.id)
        await Promise.all([fetchPayments(), fetchJournalEntries()])
        setEditingPayment(null)
      }
    }
    setConfirm({ open: false, type: 'charge', id: 0 })
  }

  const requestChargeUpdate = (data: Partial<Charge>) => {
    if (!editingCharge) return
    setConfirm({ open: true, type: 'charge', id: editingCharge.id, data, action: 'edit' })
  }

  const requestChargeDelete = (chargeId: number) => {
    setConfirm({ open: true, type: 'charge', id: chargeId, action: 'delete' })
  }

  const requestPaymentUpdate = (data: Partial<Payment>) => {
    if (!editingPayment) return
    setConfirm({ open: true, type: 'payment', id: editingPayment.id, data, action: 'edit' })
  }

  const requestPaymentDelete = (paymentId: number) => {
    setConfirm({ open: true, type: 'payment', id: paymentId, action: 'delete' })
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

  const uniqueServices = Array.from(new Set(charges.map(c => c.service_name)))
  const singleService = uniqueServices.length === 1
  const activeService = uniqueServices.length === 0 ? '' : (uniqueServices.length === 1 ? uniqueServices[0]! : (selectedServiceFilter || uniqueServices[0]!))
  const chargesFiltered = activeService ? charges.filter(c => c.service_name === activeService) : charges
  const paymentsFiltered = activeService ? payments.filter(p => p.service_name === activeService) : payments

  const totalCharged = chargesFiltered.reduce((s, c) => s + Number(c.amount), 0)
  const totalPaid = paymentsFiltered.reduce((s, p) => s + Number(p.amount), 0)
  const toPay = totalCharged - totalPaid

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const currentWeekMonday = getWeekMonday(today)

  let sumRendered = 0
  let totalWeeksContract = 0
  let weeksRenderedCount = 0
  chargesFiltered.forEach(c => {
    const startStr = c.start_date || c.created_at
    const endStr = c.end_date || c.start_date || c.created_at
    if (!startStr) return
    const start = new Date(startStr)
    const end = endStr ? new Date(endStr) : new Date(start)
    start.setHours(0, 0, 0, 0)
    end.setHours(0, 0, 0, 0)
    const mondayEnd = getWeekMonday(end)
    const mondayOfStartWeek = getWeekMonday(start)
    const firstWeekMonday = new Date(mondayOfStartWeek)
    firstWeekMonday.setDate(firstWeekMonday.getDate() + 7)
    if (firstWeekMonday.getTime() > mondayEnd.getTime()) {
      totalWeeksContract += 1
      if (mondayEnd.getTime() <= currentWeekMonday.getTime()) {
        sumRendered += Number(c.amount)
        weeksRenderedCount += 1
      }
      return
    }
    const cursor = new Date(firstWeekMonday)
    let numWeeks = 0
    while (cursor.getTime() <= mondayEnd.getTime()) {
      numWeeks += 1
      cursor.setDate(cursor.getDate() + 7)
    }
    const amountPerWeek = Number(c.amount) / numWeeks
    totalWeeksContract += numWeeks
    cursor.setTime(firstWeekMonday.getTime())
    while (cursor.getTime() <= mondayEnd.getTime()) {
      if (cursor.getTime() <= currentWeekMonday.getTime()) {
        sumRendered += amountPerWeek
        weeksRenderedCount += 1
      }
      cursor.setDate(cursor.getDate() + 7)
    }
  })

  let debtClient: number | null = null
  let debtUs: number | null = null
  let debtWeeks = 0
  if (activeService && totalWeeksContract > 0) {
    const amountPerWeek = totalCharged / totalWeeksContract
    const weeksPaid = totalPaid / amountPerWeek
    if (weeksRenderedCount > weeksPaid) {
      debtWeeks = Math.round(weeksRenderedCount - weeksPaid)
      debtClient = debtWeeks * amountPerWeek
    } else if (weeksPaid > weeksRenderedCount) {
      debtWeeks = Math.round(weeksPaid - weeksRenderedCount)
      debtUs = debtWeeks * amountPerWeek
    }
  }

  // Карточка счёта 62 по услугам за период
  const entries62 = journalEntries.filter(e => e.debit_account_code === '62' || e.credit_account_code === '62')
  const cardServices = Array.from(new Set(entries62.map(e => e.service_name))).sort()
  const periodFromDate = periodFrom || '1970-01-01'
  const periodToDate = periodTo || '2099-12-31'
  const cardRows = cardServices.map(service_name => {
    const forService = (ee: typeof entries62) => ee.filter(e => e.service_name === service_name)
    const beforePeriod = forService(entries62).filter(e => e.entry_date < periodFromDate)
    const inPeriod = forService(entries62).filter(e => e.entry_date >= periodFromDate && e.entry_date <= periodToDate)
    const opening = beforePeriod.reduce((s, e) => s + (e.debit_account_code === '62' ? Number(e.amount) : -Number(e.amount)), 0)
    const charged = inPeriod.filter(e => e.debit_account_code === '62').reduce((s, e) => s + Number(e.amount), 0)
    const paid = inPeriod.filter(e => e.credit_account_code === '62').reduce((s, e) => s + Number(e.amount), 0)
    const closing = opening + charged - paid
    return { service_name, opening, charged, paid, closing }
  })
  const cardTotal = cardRows.reduce(
    (acc, r) => ({ opening: acc.opening + r.opening, charged: acc.charged + r.charged, paid: acc.paid + r.paid, closing: acc.closing + r.closing }),
    { opening: 0, charged: 0, paid: 0, closing: 0 }
  )

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Nav />
      <div className="mx-auto max-w-[84rem] px-4 py-8 sm:px-6">
        <Breadcrumbs items={[{ href: '/', label: 'Главная' }, { href: '/clients', label: 'Клиенты' }, { href: `/clients/${id}`, label: client.name }]} />
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{client.name}</h1>

        {/* Информация о клиенте */}
        <section className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
          <h2 className="text-lg font-medium text-[var(--foreground)]">Данные клиента</h2>
          <div className="mt-4 flex flex-wrap items-end gap-4">
            <label className="min-w-[200px] flex-1">
              <span className="mb-1 block text-sm text-[var(--muted)]">Название клиента</span>
              <div className="flex items-center gap-2">
                <input
                  value={clientEdit.name}
                  onChange={e => setClientEdit(f => ({ ...f, name: e.target.value }))}
                  placeholder="Название"
                  className="flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
                />
                <button type="button" onClick={() => setConfirm({ open: true, type: 'client', id: 0 })} className="shrink-0 text-sm text-blue-600 hover:underline">Изменить</button>
              </div>
            </label>
            <label className="min-w-[200px] flex-1">
              <span className="mb-1 block text-sm text-[var(--muted)]">Юридическое название</span>
              <input
                value={clientEdit.legal_name}
                onChange={e => setClientEdit(f => ({ ...f, legal_name: e.target.value }))}
                placeholder="—"
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
              />
            </label>
            <label className="min-w-[180px]">
              <span className="mb-1 block text-sm text-[var(--muted)]">Менеджер</span>
              <select
                value={clientEdit.manager_id}
                onChange={e => setClientEdit(f => ({ ...f, manager_id: e.target.value }))}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
              >
                <option value="">— не выбран</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </label>
            <span className="text-sm text-[var(--muted)]">Создан: {formatDate(client.created_at)}</span>
            <button
              type="button"
              onClick={handleSaveClient}
              disabled={saving || (clientEdit.name === (client.name ?? '') && clientEdit.legal_name === (client.legal_name ?? '') && clientEdit.manager_id === (client.manager_id != null ? String(client.manager_id) : ''))}
              className="h-[42px] shrink-0 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
            >
              Сохранить
            </button>
          </div>
        </section>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">{error}</div>
        )}

        {/* Начисления */}
        <section className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
          <h2 className="text-lg font-medium text-[var(--foreground)]">Начисления</h2>
          <form onSubmit={handleAddCharge} className="mt-4 flex flex-wrap items-end gap-3">
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
            <label className="min-w-[160px] flex-1">
              <span className="mb-1 block text-xs text-[var(--muted)]">Комментарий</span>
              <input value={chargeForm.comment} onChange={e => setChargeForm(f => ({ ...f, comment: e.target.value }))} placeholder="Комментарий" className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800" />
            </label>
            <button type="submit" disabled={saving} className="h-[42px] shrink-0 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50">Добавить</button>
          </form>
          {chargeFormError && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{chargeFormError}</p>
          )}
          <div className="mt-4 overflow-auto max-h-64 rounded-lg border border-[var(--border)]">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-[var(--muted)]/10">
                <tr><th className="px-3 py-2 text-left font-medium text-[var(--muted)]">Услуга</th><th className="px-3 py-2 text-left font-medium text-[var(--muted)]">Начало</th><th className="px-3 py-2 text-left font-medium text-[var(--muted)]">Конец</th><th className="px-3 py-2 text-right font-medium text-[var(--muted)]">Сумма</th><th className="px-3 py-2 text-left font-medium text-[var(--muted)]">Комментарий</th><th className="px-3 py-2 w-24"></th></tr>
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
                        <td className="px-3 py-2">
                          <button type="button" onClick={(e) => { const rect = (e.currentTarget as HTMLElement).getBoundingClientRect(); setChargeMenuOpen(prev => prev?.id === c.id ? null : { id: c.id, rect }); }} className="text-blue-600 text-xs hover:underline">Изменить</button>
                          {chargeMenuOpen?.id === c.id && typeof document !== 'undefined' && createPortal(
                            <>
                              <div className="fixed inset-0 z-40" aria-hidden onClick={() => setChargeMenuOpen(null)} />
                              <div
                                className="fixed z-50 min-w-[120px] rounded-lg border border-[var(--border)] bg-[var(--card)] py-1 shadow-xl"
                                style={{ bottom: typeof window !== 'undefined' ? window.innerHeight - chargeMenuOpen.rect.top + 8 : 0, left: chargeMenuOpen.rect.left }}
                              >
                                <button type="button" className="block w-full px-3 py-1.5 text-left text-xs text-blue-600 hover:bg-[var(--muted)]/20" onClick={() => { setEditingCharge(c); setChargeMenuOpen(null); }}>Изменить</button>
                                <button type="button" className="block w-full px-3 py-1.5 text-left text-xs text-red-600 hover:bg-[var(--muted)]/20" onClick={() => { requestChargeDelete(c.id); setChargeMenuOpen(null); }}>Удалить</button>
                                <button type="button" className="block w-full px-3 py-1.5 text-left text-xs text-[var(--muted)] hover:bg-[var(--muted)]/20" onClick={() => setChargeMenuOpen(null)}>Отмена</button>
                              </div>
                            </>,
                            document.body
                          )}
                        </td>
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
              <span className="mb-1 block text-xs text-[var(--muted)]">Дата</span>
              <input type="date" value={paymentForm.payment_date} onChange={e => setPaymentForm(f => ({ ...f, payment_date: e.target.value }))} className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800" />
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
          {paymentFormError && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{paymentFormError}</p>
          )}
          <div className="mt-4 overflow-auto max-h-64 rounded-lg border border-[var(--border)]">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-[var(--muted)]/10">
                <tr><th className="px-3 py-2 text-left font-medium text-[var(--muted)]">Услуга</th><th className="px-3 py-2 text-left font-medium text-[var(--muted)]">Дата</th><th className="px-3 py-2 text-right font-medium text-[var(--muted)]">Сумма</th><th className="px-3 py-2 text-left font-medium text-[var(--muted)]">Комментарий</th><th className="px-3 py-2 w-24"></th></tr>
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
                        <td className="px-3 py-2"><input type="date" className="rounded border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-800" defaultValue={p.payment_date ?? p.created_at?.slice(0, 10) ?? ''} id={`p-dt-${p.id}`} /></td>
                        <td className="px-3 py-2"><input type="text" className="w-20 rounded border border-zinc-200 px-2 py-1 text-sm text-right dark:border-zinc-600 dark:bg-zinc-800" defaultValue={p.amount} id={`p-am-${p.id}`} /></td>
                        <td className="px-3 py-2"><input className="w-full rounded border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-800" defaultValue={p.comment || ''} id={`p-cm-${p.id}`} /></td>
                        <td className="px-3 py-2">
                          <button type="button" onClick={() => { const sn = (document.getElementById(`p-sn-${p.id}`) as HTMLSelectElement)?.value; const dt = (document.getElementById(`p-dt-${p.id}`) as HTMLInputElement)?.value; const am = (document.getElementById(`p-am-${p.id}`) as HTMLInputElement)?.value; const cm = (document.getElementById(`p-cm-${p.id}`) as HTMLInputElement)?.value; requestPaymentUpdate({ service_name: sn, payment_date: dt || p.payment_date || new Date().toISOString().slice(0, 10), amount: am ? parseFloat(am.replace(',', '.')) : 0, comment: cm || null }); }} className="text-blue-600 text-xs hover:underline">Сохранить</button>
                          <button type="button" onClick={() => setEditingPayment(null)} className="ml-1 text-zinc-500 text-xs hover:underline">Отмена</button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2">{p.service_name}</td>
                        <td className="px-3 py-2">{formatDate(p.payment_date ?? p.created_at?.slice(0, 10) ?? null)}</td>
                        <td className="px-3 py-2 text-right">{formatMoney(Number(p.amount))}</td>
                        <td className="px-3 py-2 text-[var(--muted)]">{p.comment ?? '—'}</td>
                        <td className="px-3 py-2">
                          <button type="button" onClick={(e) => { const rect = (e.currentTarget as HTMLElement).getBoundingClientRect(); setPaymentMenuOpen(prev => prev?.id === p.id ? null : { id: p.id, rect }); }} className="text-blue-600 text-xs hover:underline">Изменить</button>
                          {paymentMenuOpen?.id === p.id && typeof document !== 'undefined' && createPortal(
                            <>
                              <div className="fixed inset-0 z-40" aria-hidden onClick={() => setPaymentMenuOpen(null)} />
                              <div
                                className="fixed z-50 min-w-[120px] rounded-lg border border-[var(--border)] bg-[var(--card)] py-1 shadow-xl"
                                style={{ bottom: typeof window !== 'undefined' ? window.innerHeight - paymentMenuOpen.rect.top + 8 : 0, left: paymentMenuOpen.rect.left }}
                              >
                                <button type="button" className="block w-full px-3 py-1.5 text-left text-xs text-blue-600 hover:bg-[var(--muted)]/20" onClick={() => { setEditingPayment(p); setPaymentMenuOpen(null); }}>Изменить</button>
                                <button type="button" className="block w-full px-3 py-1.5 text-left text-xs text-red-600 hover:bg-[var(--muted)]/20" onClick={() => { requestPaymentDelete(p.id); setPaymentMenuOpen(null); }}>Удалить</button>
                                <button type="button" className="block w-full px-3 py-1.5 text-left text-xs text-[var(--muted)] hover:bg-[var(--muted)]/20" onClick={() => setPaymentMenuOpen(null)}>Отмена</button>
                              </div>
                            </>,
                            document.body
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Карточка счёта 62 (расчёты с клиентом) в разрезе услуг */}
        <section className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
          <h2 className="text-lg font-medium text-[var(--foreground)]">Карточка расчётов с клиентом (счёт 62)</h2>
          <div className="mt-4 flex flex-wrap items-end gap-4">
            <label className="flex items-center gap-2">
              <span className="text-sm text-[var(--muted)]">Период с</span>
              <input
                type="date"
                value={periodFrom}
                onChange={e => setPeriodFrom(e.target.value)}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
              />
            </label>
            <label className="flex items-center gap-2">
              <span className="text-sm text-[var(--muted)]">по</span>
              <input
                type="date"
                value={periodTo}
                onChange={e => setPeriodTo(e.target.value)}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
              />
            </label>
          </div>
          <div className="mt-4 overflow-auto rounded-lg border border-[var(--border)]">
            <table className="min-w-full text-sm">
              <thead className="bg-[var(--muted)]/10">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-[var(--muted)]">Услуга</th>
                  <th className="px-3 py-2 text-right font-medium text-[var(--muted)]">Сальдо на начало</th>
                  <th className="px-3 py-2 text-right font-medium text-[var(--muted)]">Начислено</th>
                  <th className="px-3 py-2 text-right font-medium text-[var(--muted)]">Оплачено</th>
                  <th className="px-3 py-2 text-right font-medium text-[var(--muted)]">Сальдо на конец</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {cardRows.map(r => (
                  <tr key={r.service_name}>
                    <td className="px-3 py-2">{r.service_name}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(r.opening)}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(r.charged)}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(r.paid)}</td>
                    <td className="px-3 py-2 text-right font-medium">{formatMoney(r.closing)}</td>
                  </tr>
                ))}
                {cardRows.length > 0 && (
                  <tr className="border-t-2 border-[var(--border)] bg-[var(--muted)]/5 font-medium">
                    <td className="px-3 py-2">Итого</td>
                    <td className="px-3 py-2 text-right">{formatMoney(cardTotal.opening)}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(cardTotal.charged)}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(cardTotal.paid)}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(cardTotal.closing)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {cardRows.length === 0 && (
            <p className="mt-2 text-sm text-[var(--muted)]">Нет проводок по счёту 62 за выбранный период и ранее.</p>
          )}
          <p className="mt-3 text-xs text-[var(--muted)]">Положительное сальдо означает задолженность клиента, отрицательное — переплату.</p>
        </section>

        {/* Карточка оказания услуг */}
        <section className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
          <h2 className="text-lg font-medium text-[var(--foreground)]">Карточка оказания услуг</h2>
          {uniqueServices.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--muted)]">Нет начислений.</p>
          ) : (
            <>
              {singleService ? (
                <p className="mt-2 text-sm text-[var(--muted)]">Услуга: <span className="font-medium text-[var(--foreground)]">{activeService}</span></p>
              ) : (
                <label className="mt-2 block">
                  <span className="mb-1 block text-sm text-[var(--muted)]">Услуга</span>
                  <select
                    value={selectedServiceFilter || uniqueServices[0]}
                    onChange={e => setSelectedServiceFilter(e.target.value)}
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
                  >
                    {uniqueServices.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </label>
              )}
              <div className="mt-4 overflow-hidden rounded-lg border border-rose-200 dark:border-rose-800/60">
              <dl className="grid divide-x divide-y divide-rose-200/80 dark:divide-rose-800/40 sm:grid-cols-2 lg:grid-cols-5">
                <div><dt className="flex h-12 items-center bg-[var(--muted)]/10 px-3 py-2 text-sm font-medium text-[var(--muted)]">Сумма по контрактам<br />за все время</dt><dd className="px-3 py-2 font-medium">{formatMoney(Math.round(totalCharged))}</dd></div>
                <div><dt className="flex h-12 items-center bg-[var(--muted)]/10 px-3 py-2 text-sm font-medium text-[var(--muted)]">Сумма оплат<br />за все время</dt><dd className="px-3 py-2 font-medium">{formatMoney(Math.round(totalPaid))}</dd></div>
                <div><dt className="flex h-12 items-center bg-[var(--muted)]/10 px-3 py-2 text-sm font-medium text-[var(--muted)]">Сумма к оплате</dt><dd className="px-3 py-2 font-medium">{formatMoney(Math.round(Math.max(0, toPay)))}</dd></div>
                <div><dt className="flex h-12 items-center bg-[var(--muted)]/10 px-3 py-2 text-sm font-medium text-[var(--muted)]">Сумма оказанных услуг</dt><dd className="px-3 py-2 font-medium">{formatMoney(Math.round(sumRendered))}</dd></div>
                {activeService && (
                  <div>
                    <dt className="flex h-12 items-center bg-[var(--muted)]/10 px-3 py-2 text-sm font-medium text-[var(--muted)]">Задолженность</dt>
                    <dd className="px-3 py-2 font-medium">
                      {debtClient != null && debtClient > 0
                        ? <span className="text-red-600 dark:text-red-400">Задолженность клиента: {formatMoney(Math.round(debtClient))} ({debtWeeks} нед.)</span>
                        : debtUs != null && debtUs > 0
                          ? <span className="text-green-600 dark:text-green-400">Наша задолженность перед клиентом: {formatMoney(Math.round(debtUs))} ({debtWeeks} нед.)</span>
                          : '—'}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
            </>
          )}
          <p className="mt-3 text-xs text-[var(--muted)]">Наша задолженность — это, сколько недель оказания услуг мы ещё должны клиенту.</p>
        </section>

        {/* Сводка и график начислений */}
        <section className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
          <h2 className="text-lg font-medium text-[var(--foreground)]">Дашборд начислений</h2>
          {uniqueServices.length >= 2 ? (
            <label className="mt-2 block">
              <span className="mb-1 block text-sm text-[var(--muted)]">Услуга</span>
              <select
                value={selectedServiceFilter || uniqueServices[0]}
                onChange={e => setSelectedServiceFilter(e.target.value)}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
              >
                {uniqueServices.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
          ) : activeService ? (
            <p className="mt-1 text-sm text-[var(--muted)]">По услуге: {activeService}</p>
          ) : null}
          <p className="mt-1 text-sm text-[var(--muted)]">Всего начислено: {formatMoney(totalCharged)} · Оплачено: {formatMoney(totalPaid)} · Доля оплаты: {totalCharged ? Math.round((totalPaid / totalCharged) * 100) : 0}%</p>
          <div className="mt-6">
            <ClientChargesChart charges={activeService ? chargesFiltered : charges} payments={activeService ? paymentsFiltered : payments} />
          </div>
        </section>
      </div>

      <ConfirmDialog
        open={confirm.open}
        title="Подтверждение"
        message={confirm.type === 'client' ? 'Точно изменить?' : confirm.action === 'delete' ? 'Точно удалить?' : 'Точно ли вы хотите изменить?'}
        confirmLabel={confirm.action === 'delete' ? 'Да, удалить' : 'Да, изменить'}
        onConfirm={handleConfirmEdit}
        onCancel={() => setConfirm({ open: false, type: 'charge', id: 0 })}
      />
    </div>
  )
}

const CHART_HEIGHT_PX = 180

/** Понедельник недели для даты (ISO неделя) */
function getWeekMonday(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  const day = x.getDay()
  const monOffset = day === 0 ? -6 : 1 - day
  x.setDate(x.getDate() + monOffset)
  return x
}

/** Ключ недели: YYYY-MM-DD понедельника */
function weekKey(d: Date): string {
  const m = getWeekMonday(d)
  return m.toISOString().slice(0, 10)
}

const PAID_BLUE = '#1e40af'
const UNPAID_BLUE = '#93c5fd'
const WINDOW_WEEKS = 25

const Y_STEPS = [1000, 2000, 5000, 10000, 20000, 50000]

/** Круглые деления оси Y (руб.): верхняя граница чуть выше maxVal, столбики занимают большую часть высоты. */
function getYTicksMoney(maxVal: number): number[] {
  if (maxVal <= 0) return [0]
  const step = Y_STEPS.find(s => s >= maxVal / 5) ?? Y_STEPS[Y_STEPS.length - 1]
  const top = Math.ceil((maxVal * 1.05) / step) * step || step
  const ticks: number[] = []
  for (let v = 0; v <= top; v += step) ticks.push(v)
  return ticks
}

const BAR_WIDTH_PX = 28

function ClientChargesChart({ charges, payments }: { charges: Charge[]; payments: Payment[] }) {
  const [scrollPos, setScrollPos] = useState<number | null>(null)
  const [drag, setDrag] = useState<{ x: number; startIndex: number } | null>(null)
  const chartScrollRef = useRef<HTMLDivElement>(null)

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0)
  const totalCharged = charges.reduce((s, c) => s + Number(c.amount), 0)

  const byWeek = new Map<string, { total: number; byService: Record<string, number> }>()
  charges.forEach(c => {
    const startStr = c.start_date || c.created_at
    const endStr = c.end_date || c.start_date || c.created_at
    if (!startStr) return
    const start = new Date(startStr)
    const end = endStr ? new Date(endStr) : new Date(start)
    start.setHours(0, 0, 0, 0)
    end.setHours(0, 0, 0, 0)
    const mondayEnd = getWeekMonday(end)
    // Услуга оказывается со СЛЕДУЮЩЕЙ недели после даты начала (не с недели, содержащей start_date)
    const mondayOfStartWeek = getWeekMonday(start)
    const firstWeekMonday = new Date(mondayOfStartWeek)
    firstWeekMonday.setDate(firstWeekMonday.getDate() + 7)
    const firstWeekKey = firstWeekMonday.toISOString().slice(0, 10)
    const endWeekKey = mondayEnd.toISOString().slice(0, 10)
    if (firstWeekKey > endWeekKey) {
      // Период короче одной недели по правилу «со следующей недели» — относим всю сумму на неделю окончания
      const key = endWeekKey
      if (!byWeek.has(key)) byWeek.set(key, { total: 0, byService: {} })
      const rec = byWeek.get(key)!
      rec.total += Number(c.amount)
      rec.byService[c.service_name] = (rec.byService[c.service_name] ?? 0) + Number(c.amount)
      return
    }
    const cursor = new Date(firstWeekMonday)
    const weekKeysForCharge: string[] = []
    while (cursor.getTime() <= mondayEnd.getTime()) {
      weekKeysForCharge.push(cursor.toISOString().slice(0, 10))
      cursor.setDate(cursor.getDate() + 7)
    }
    const numWeeks = weekKeysForCharge.length
    const amountPerWeek = Number(c.amount) / numWeeks
    weekKeysForCharge.forEach(key => {
      if (!byWeek.has(key)) byWeek.set(key, { total: 0, byService: {} })
      const rec = byWeek.get(key)!
      rec.total += amountPerWeek
      rec.byService[c.service_name] = (rec.byService[c.service_name] ?? 0) + amountPerWeek
    })
  })

  const currentWeekMonday = getWeekMonday(today)
  const currentWeekKey = currentWeekMonday.toISOString().slice(0, 10)
  const dataWeeks = Array.from(byWeek.keys()).sort()
  const firstDataWeek = dataWeeks[0]
  const lastDataWeek = dataWeeks[dataWeeks.length - 1]
  const earliest = firstDataWeek ? new Date(firstDataWeek) : new Date(currentWeekMonday)
  const latest = lastDataWeek ? new Date(lastDataWeek) : new Date(currentWeekMonday)
  earliest.setDate(earliest.getDate() - 4 * 7)
  latest.setDate(latest.getDate() + 4 * 7)
  const allWeekKeys: string[] = []
  const cursor = new Date(getWeekMonday(earliest))
  while (cursor.getTime() <= latest.getTime()) {
    allWeekKeys.push(cursor.toISOString().slice(0, 10))
    cursor.setDate(cursor.getDate() + 7)
  }

  // Оплаченная сумма по неделям: оплаты «съедают» недели с начала (по порядку)
  const paidAmountByWeek = new Map<string, number>()
  let consumed = 0
  allWeekKeys.forEach(key => {
    const total = byWeek.get(key)?.total ?? 0
    const paidThisWeek = total <= 0 ? 0 : Math.min(total, Math.max(0, totalPaid - consumed))
    consumed += paidThisWeek
    paidAmountByWeek.set(key, paidThisWeek)
  })

  const allServices = Array.from(new Set(charges.map(c => c.service_name)))

  const windowSize = Math.min(WINDOW_WEEKS, allWeekKeys.length)
  const maxStart = Math.max(0, allWeekKeys.length - windowSize)
  const currentWeekIndex = allWeekKeys.indexOf(currentWeekKey)
  const centerStartIndex = currentWeekIndex >= 0 ? Math.max(0, Math.min(currentWeekIndex - 12, maxStart)) : 0
  const effectiveScrollPos = scrollPos === null ? (maxStart > 0 ? centerStartIndex / maxStart : 0) : scrollPos
  const startIndex = Math.min(maxStart, Math.round(effectiveScrollPos * maxStart))
  const weekKeys = allWeekKeys.slice(startIndex, startIndex + windowSize)

  const dataMaxSum = Math.max(0, ...weekKeys.map(k => byWeek.get(k)?.total ?? 0))
  const yTicks = getYTicksMoney(dataMaxSum)
  const yMax = Math.max(1, yTicks[yTicks.length - 1] ?? 1)

  const datePart = (key: string) => {
    const [, m, d] = key.split('-').map(Number)
    return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}`
  }
  const yearPart = (key: string) => key.slice(0, 4)

  const yearShades = ['#fce7f3', '#fbcfe8', '#f9a8d4', '#f472b6', '#ec4899']
  const yearsInView = Array.from(new Set(weekKeys.map(yearPart))).sort()
  const yearToShade: Record<string, string> = {}
  yearsInView.forEach((y, i) => { yearToShade[y] = yearShades[i % yearShades.length] })

  useEffect(() => {
    if (!drag) return
    const onMove = (e: MouseEvent) => {
      const deltaPx = e.clientX - drag.x
      const deltaWeeks = -Math.round(deltaPx / BAR_WIDTH_PX)
      const newStartIndex = Math.max(0, Math.min(maxStart, drag.startIndex + deltaWeeks))
      const newPos = maxStart > 0 ? newStartIndex / maxStart : 0
      setScrollPos(newPos) // явная позиция после перетаскивания
    }
    const onUp = () => setDrag(null)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [drag, maxStart])

  const onChartMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    setDrag({ x: e.clientX, startIndex })
  }

  return (
    <div className="space-y-4">
      <div
        ref={chartScrollRef}
        className="overflow-x-auto select-none"
        style={{ cursor: drag ? 'grabbing' : 'grab' }}
        onMouseDown={onChartMouseDown}
      >
        <div className="inline-flex flex-col pt-2">
          {/* Строка: ось Y + столбики (столбики растут от линии нуля вверх) */}
          <div className="flex items-end gap-0.5" style={{ height: CHART_HEIGHT_PX }}>
            <div className="flex w-14 flex-col justify-between pr-2 text-right text-xs text-[var(--muted)] shrink-0" style={{ height: CHART_HEIGHT_PX }}>
              {yTicks.slice().reverse().map((t) => (
                <span key={t}>{formatMoney(t)}</span>
              ))}
            </div>
            <div className="relative flex items-end gap-0.5" style={{ height: CHART_HEIGHT_PX }}>
              <div className="absolute inset-0 pointer-events-none" style={{ height: CHART_HEIGHT_PX }} aria-hidden>
                {yTicks.filter((t) => t > 0).map((tick) => (
                  <div
                    key={tick}
                    className="absolute left-0 right-0 border-b border-zinc-200 dark:border-zinc-600"
                    style={{ bottom: `${(tick / yMax) * 100}%` }}
                  />
                ))}
              </div>
              {weekKeys.map((key) => {
                const data = byWeek.get(key) ?? { total: 0, byService: {} }
                const weekMonday = new Date(key)
                const isFuture = weekMonday > today
                const isCurrent = key === currentWeekKey
                const paidAmount = paidAmountByWeek.get(key) ?? 0
                const paidRatio = data.total > 0 ? Math.min(1, paidAmount / data.total) : 0
                const barHeightPx =
                  yMax > 0 && data.total > 0
                    ? Math.min(CHART_HEIGHT_PX, (data.total / yMax) * CHART_HEIGHT_PX)
                    : 0
                return (
                  <div key={key} className="flex w-7 flex-shrink-0 flex-col justify-end" style={{ height: CHART_HEIGHT_PX }}>
                    {barHeightPx > 0 && (
                      <div
                        className={`w-full rounded-t overflow-hidden border ${isCurrent ? 'border-2 border-blue-500' : 'border border-zinc-300 dark:border-zinc-600'}`}
                        style={{
                          height: barHeightPx,
                          borderStyle: isFuture ? 'dashed' : 'solid',
                          display: 'flex',
                          flexDirection: 'column-reverse',
                        }}
                        title={`Неделя ${key}: ${formatMoney(data.total)} · Оплачено: ${formatMoney(paidAmount)}${allServices.length ? ` (${Object.entries(data.byService).map(([s, v]) => `${s}: ${formatMoney(v)}`).join(', ')})` : ''}`}
                      >
                        {(allServices.length ? allServices : ['']).map((serviceName) => {
                          const serviceAmount = serviceName ? (data.byService[serviceName] ?? 0) : data.total
                          if (serviceAmount <= 0) return null
                          const segmentHeight = (serviceAmount / data.total) * barHeightPx
                          const paidHeightPx = Math.round(segmentHeight * paidRatio)
                          const unpaidHeightPx = segmentHeight - paidHeightPx
                          return (
                            <React.Fragment key={serviceName || 'total'}>
                              {unpaidHeightPx > 0 && (
                                <div className="w-full flex-shrink-0 border-t border-white/30" style={{ height: unpaidHeightPx, background: isFuture ? `repeating-linear-gradient(-45deg, ${UNPAID_BLUE}, ${UNPAID_BLUE} 2px, transparent 2px, transparent 4px)` : UNPAID_BLUE }} />
                              )}
                              {paidHeightPx > 0 && (
                                <div className="w-full flex-shrink-0 border-t border-white/30" style={{ height: paidHeightPx, background: isFuture ? `repeating-linear-gradient(-45deg, ${PAID_BLUE}, ${PAID_BLUE} 2px, transparent 2px, transparent 4px)` : PAID_BLUE }} />
                              )}
                            </React.Fragment>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
          {/* Линия нуля — выше подписей */}
          <div className="flex gap-0.5 border-t-2 border-zinc-400 dark:border-zinc-500 mt-0">
            <div className="w-14 shrink-0" />
            <div className="flex gap-0.5 flex-1 min-w-0" aria-hidden>
              {weekKeys.map((key) => {
                const isCurrent = key === currentWeekKey
                return <div key={key} className="w-7 flex-shrink-0" />
              })}
            </div>
          </div>
          {/* Подписи дат — ниже линии нуля */}
          <div className="flex gap-0.5 pb-2 mt-0.5">
            <div className="w-14 shrink-0" />
            <div className="flex gap-0.5 flex-1 min-w-0">
              {weekKeys.map((key) => {
                const isCurrent = key === currentWeekKey
                return (
                  <div key={key} className="flex w-7 flex-shrink-0 flex-col items-center text-center">
                    <span className={`block text-[10px] leading-tight ${isCurrent ? 'font-semibold text-blue-600 dark:text-blue-400' : 'text-[var(--muted)]'}`} title={isCurrent ? 'Текущая неделя' : key}>
                      {datePart(key)}
                    </span>
                    <span
                      className="mt-0.5 block w-full rounded px-0.5 py-0.5 text-[9px] font-medium leading-tight text-[var(--muted-foreground)]"
                      style={{ backgroundColor: yearToShade[yearPart(key)] ?? '#fce7f3' }}
                      title={yearPart(key)}
                    >
                      {yearPart(key)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-[var(--muted)]">
        <span><span className="inline-block w-3 h-3 rounded mr-1" style={{ background: PAID_BLUE }} /> Оплаченные недели</span>
        <span><span className="inline-block w-3 h-3 rounded mr-1" style={{ background: UNPAID_BLUE }} /> Неоплаченные недели</span>
      </div>
      {charges.length === 0 && (
        <p className="text-sm text-[var(--muted)]">Нет начислений для графика. Добавьте начисления выше.</p>
      )}
    </div>
  )
}
