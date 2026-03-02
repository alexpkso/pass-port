'use client'

import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useParams } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import Nav from '../../components/Nav'
import Breadcrumbs from '../../components/Breadcrumbs'
import ConfirmDialog from '../../components/ConfirmDialog'
import ClientDashboard from './ClientDashboard'

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
  service_id?: number | null
  start_date: string | null
  end_date: string | null
  amount: number
  comment: string | null
  created_at: string
  subscription_type?: string | null
  status?: string | null
  freeze_start?: string | null
  freeze_end?: string | null
  updated_at?: string | null
}
type Payment = {
  id: number
  client_id: number
  service_name: string
  service_id?: number | null
  charge_id?: number | null
  amount: number
  payment_date?: string
  comment: string | null
  created_at: string
}
type Service = { id: number; name: string; base_cost: number; type?: string | null; duration_days?: number | null }
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

const formatDate = (d: string | null) => {
  if (!d) return '—'
  const t = new Date(d).getTime()
  return Number.isNaN(t) ? '—' : new Date(d).toLocaleDateString('ru-RU')
}
const formatMoney = (n: number) => new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n) + ' ₽'
const formatMoneyInt = (n: number) => new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(n)) + ' ₽'

const docTypeLabel = (t: string): string => {
  if (t === 'charge') return 'Начисление'
  if (t === 'payment') return 'Оплата'
  if (t === 'weekly_recognition') return 'Признание выручки'
  if (t === 'cancellation') return 'Отмена'
  return t
}

const subTypeLabel = (t: string | null | undefined): { label: string; cls: string } | null => {
  if (t === 'primary')  return { label: 'Первичная', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300' }
  if (t === 'renewal')  return { label: 'Продление', cls: 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300' }
  if (t === 'one-time') return { label: 'Разовая',   cls: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400' }
  return null
}

/** Добавить days дней к дате YYYY-MM-DD, вернуть YYYY-MM-DD */
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Вычисляемый статус начисления: upcoming | active | expired | paused | cancelled */
function getChargeDisplayStatus(c: Charge, today: string): 'upcoming' | 'active' | 'expired' | 'paused' | 'cancelled' {
  if (c.status === 'paused') return 'paused'
  if (c.status === 'cancelled') return 'cancelled'
  if (c.end_date && c.end_date < today) return 'expired'
  if (c.start_date && c.start_date > today) return 'upcoming'
  return 'active'
}

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
  const [chargeForm, setChargeForm] = useState({ service_name: '', start_date: new Date().toISOString().slice(0, 10), end_date: '', amount: '', comment: '' })
  const [paymentForm, setPaymentForm] = useState(() => ({
    charge_id: '',
    amount: '',
    payment_date: new Date().toISOString().slice(0, 10),
    comment: '',
  }))
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState<{ open: boolean; type: 'charge' | 'payment' | 'client'; id: number; data?: Partial<Charge> | Partial<Payment>; action?: 'edit' | 'delete' | 'cancel' }>({ open: false, type: 'charge', id: 0 })
  const [dupSubConfirm, setDupSubConfirm] = useState<{ open: boolean; serviceName: string; existingCharge: Charge | null; originalStart: string; originalEnd: string; proceed: ((start: string, end: string, subscriptionType?: string) => void) | null }>({ open: false, serviceName: '', existingCharge: null, originalStart: '', originalEnd: '', proceed: null })
  const [confirmSubmitting, setConfirmSubmitting] = useState(false)
  const [editingCharge, setEditingCharge] = useState<Charge | null>(null)
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null)
  const [services, setServices] = useState<Service[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [clientEdit, setClientEdit] = useState({ name: '', legal_name: '', manager_id: '' })
  const [showClientEdit, setShowClientEdit] = useState(false)
  const [selectedServiceFilter, setSelectedServiceFilter] = useState<string>('')
  const chargeFormRef = useRef<HTMLFormElement>(null)
  const [chargeMenuOpen, setChargeMenuOpen] = useState<{ id: number; rect: DOMRect } | null>(null)
  const [paymentMenuOpen, setPaymentMenuOpen] = useState<{ id: number; rect: DOMRect } | null>(null)
  const [freezeDialog, setFreezeDialog] = useState<{ open: boolean; chargeId: number; charge: Charge | null; mode: 'pause' | 'resume'; date: string }>({ open: false, chargeId: 0, charge: null, mode: 'pause', date: '' })
  const [cancelDialog, setCancelDialog] = useState<{ open: boolean; charge: Charge | null; date: string; submitting: boolean }>({ open: false, charge: null, date: '', submitting: false })
  const [freezeSubmitting, setFreezeSubmitting] = useState(false)
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([])
  const [card62Expanded, setCard62Expanded] = useState<string | null>(null)
  const [journalCollapsed, setJournalCollapsed] = useState<Set<string>>(new Set())
  const [osvCollapsed, setOsvCollapsed] = useState<Set<string>>(new Set())
  const [periodFrom, setPeriodFrom] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-01-01`
  })
  const [periodTo, setPeriodTo] = useState(() => {
    const d = new Date()
    return d.toISOString().slice(0, 10)
  })
  const [card62PeriodFrom, setCard62PeriodFrom] = useState(() => { const d = new Date(); return `${d.getFullYear()}-01-01` })
  const [card62PeriodTo, setCard62PeriodTo] = useState(() => new Date().toISOString().slice(0, 10))
  const [svcStatsPeriodFrom, setSvcStatsPeriodFrom] = useState('')
  const [svcStatsPeriodTo, setSvcStatsPeriodTo] = useState('')
  const [keepPauseModal, setKeepPauseModal] = useState<{ open: boolean; data: Partial<Charge> | null }>({ open: false, data: null })

  const supabase = createClient()

  const fetchServices = async () => {
    const { data } = await supabase.from('services').select('id, name, base_cost, type, duration_days').order('name')
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

  const executeAddCharge = async (
    serviceName: string, startDate: string, endDate: string,
    amount: number, comment: string, svc: Service | undefined,
    forceSubscriptionType?: string
  ) => {
    setSaving(true)
    const subscriptionType =
      forceSubscriptionType ??
      (svc?.type === 'one-time'
        ? 'one-time'
        : charges.some(c => c.service_name === serviceName && c.status !== 'cancelled')
          ? 'renewal'
          : 'primary')
    const { error: e2 } = await supabase.from('charges').insert({
      client_id: id,
      service_name: serviceName,
      service_id: svc?.id ?? null,
      start_date: startDate || null,
      end_date: endDate || null,
      amount,
      comment: comment || null,
      subscription_type: subscriptionType,
    })
    if (e2) setChargeFormError(e2.message)
    else {
      setChargeForm({ service_name: '', start_date: new Date().toISOString().slice(0, 10), end_date: '', amount: '', comment: '' })
      await Promise.all([fetchCharges(), fetchJournalEntries()])
    }
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
    if (chargeForm.start_date && chargeForm.end_date && chargeForm.start_date > chargeForm.end_date) {
      setChargeFormError('Дата начала не может быть позже даты окончания.')
      return
    }
    setChargeFormError(null)
    const serviceName = chargeForm.service_name.trim()
    const amount = parseFloat(chargeForm.amount.replace(',', '.'))
    const comment = chargeForm.comment.trim()
    const svc = services.find(s => s.name === serviceName)

    if (svc?.type === 'subscription') {
      const sameServiceActive = charges.filter(c => c.service_name === serviceName && c.status !== 'cancelled')

      if (sameServiceActive.length > 0) {
        // Та же услуга (продление) — проверяем пересечение дат
        const newStart = chargeForm.start_date
        const newEnd = chargeForm.end_date
        const hasOverlap = sameServiceActive.some(c =>
          c.start_date && c.end_date && newStart && newEnd &&
          newStart < c.end_date && newEnd > c.start_date
        )
        if (hasOverlap) {
          const latestEnd = sameServiceActive.reduce<string | null>(
            (m, ch) => !m || (ch.end_date && ch.end_date > m) ? (ch.end_date ?? m) : m, null
          )
          const nextDate = latestEnd ? addDays(latestEnd, 1) : null
          setChargeFormError(
            `Период пересекается с уже существующим начислением.${nextDate ? ` Ближайшая доступная дата начала: ${formatDate(nextDate)}.` : ''}`
          )
          return
        }
      }

      // Проверяем наличие другой активной подписки (для любого сценария: новая или продление)
      const otherActive = charges.find(c =>
        c.service_name !== serviceName &&
        c.status !== 'cancelled' &&
        c.subscription_type !== 'one-time' &&
        c.subscription_type != null
      )
      if (otherActive) {
        setDupSubConfirm({
          open: true,
          serviceName: otherActive.service_name,
          existingCharge: otherActive,
          originalStart: chargeForm.start_date,
          originalEnd: chargeForm.end_date,
          proceed: (start, end, subscriptionType) => executeAddCharge(serviceName, start, end, amount, comment, svc, subscriptionType),
        })
        return
      }
    }

    await executeAddCharge(serviceName, chargeForm.start_date, chargeForm.end_date, amount, comment, svc)
  }

  const handleAddPayment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!id) return
    const chargeId = paymentForm.charge_id ? Number(paymentForm.charge_id) : null
    const linkedCharge = chargeId ? charges.find(c => c.id === chargeId) : null
    const missing: string[] = []
    if (!chargeId) missing.push('Начисление')
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
    const serviceName = linkedCharge?.service_name ?? ''
    const svcId = linkedCharge ? services.find(s => s.name === linkedCharge.service_name)?.id ?? null : null
    const { error: e2 } = await supabase.from('payments').insert({
      client_id: id,
      service_name: serviceName,
      service_id: svcId,
      charge_id: chargeId,
      amount,
      payment_date: paymentForm.payment_date,
      comment: paymentForm.comment.trim() || null,
    })
    if (e2) setPaymentFormError(e2.message)
    else {
      const today = new Date().toISOString().slice(0, 10)
      setPaymentForm({ charge_id: '', amount: '', payment_date: today, comment: '' })
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
    setConfirmSubmitting(true)
    setError(null)
    try {
      if (confirm.action === 'delete') {
        if (confirm.type === 'charge') {
          const { error: e } = await supabase.from('charges').delete().eq('id', confirm.id)
          if (e) { setError(e.message); setConfirmSubmitting(false); return }
          await Promise.all([fetchCharges(), fetchJournalEntries()])
          setEditingCharge(null)
        }
        if (confirm.type === 'payment') {
          const { error: e } = await supabase.from('payments').delete().eq('id', confirm.id)
          if (e) { setError(e.message); setConfirmSubmitting(false); return }
          await Promise.all([fetchPayments(), fetchJournalEntries()])
          setEditingPayment(null)
        }
      } else {
        if (confirm.type === 'charge' && confirm.data) {
          const { error: e } = await supabase.from('charges').update(confirm.data).eq('id', confirm.id)
          if (e) { setError(e.message); setConfirmSubmitting(false); return }
          await Promise.all([fetchCharges(), fetchJournalEntries()])
          setEditingCharge(null)
        }
        if (confirm.type === 'payment' && confirm.data) {
          const { error: e } = await supabase.from('payments').update(confirm.data).eq('id', confirm.id)
          if (e) { setError(e.message); setConfirmSubmitting(false); return }
          await Promise.all([fetchPayments(), fetchJournalEntries()])
          setEditingPayment(null)
        }
      }
      setConfirm({ open: false, type: 'charge', id: 0 })
    } finally {
      setConfirmSubmitting(false)
    }
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

  const openFreezePause = (c: Charge) => {
    setFreezeDialog({ open: true, chargeId: c.id, charge: c, mode: 'pause', date: new Date().toISOString().slice(0, 10) })
    setChargeMenuOpen(null)
  }
  const openFreezeResume = (c: Charge) => {
    setFreezeDialog({ open: true, chargeId: c.id, charge: c, mode: 'resume', date: new Date().toISOString().slice(0, 10) })
    setChargeMenuOpen(null)
  }
  const handleFreezeSubmit = async () => {
    if (!freezeDialog.charge || !freezeDialog.date) return
    setFreezeSubmitting(true)
    setError(null)
    try {
      const fn = freezeDialog.mode === 'pause'
        ? 'pause_charge_with_accounting'
        : 'resume_charge_with_accounting'
      const paramKey = freezeDialog.mode === 'pause' ? 'p_pause_date' : 'p_resume_date'
      const { data, error: e } = await supabase.rpc(fn, {
        p_charge_id: freezeDialog.chargeId,
        [paramKey]: freezeDialog.date,
      })
      if (e) { setError(e.message); return }
      if (data && typeof data === 'object' && 'error' in data) { setError(String((data as Record<string,unknown>).error)); return }
      await Promise.all([fetchCharges(), fetchJournalEntries()])
      setFreezeDialog(f => ({ ...f, open: false }))
    } finally {
      setFreezeSubmitting(false)
    }
  }
  const handleCancelCharge = (c: Charge) => {
    setChargeMenuOpen(null)
    setCancelDialog({ open: true, charge: c, date: new Date().toISOString().slice(0, 10), submitting: false })
  }

  const handleCancelSubmit = async () => {
    if (!cancelDialog.charge || !cancelDialog.date) return
    if (cancelDialog.charge.end_date && cancelDialog.date > cancelDialog.charge.end_date) {
      setError('Дата отмены не может быть позже даты окончания начисления.')
      return
    }
    setCancelDialog(d => ({ ...d, submitting: true }))
    setError(null)
    const { error: e } = await supabase.rpc('cancel_charge_with_accounting', {
      p_charge_id: cancelDialog.charge.id,
      p_cancel_date: cancelDialog.date,
    })
    if (e) {
      setError(e.message)
      setCancelDialog(d => ({ ...d, submitting: false }))
      return
    }
    await Promise.all([fetchCharges(), fetchJournalEntries()])
    setCancelDialog({ open: false, charge: null, date: '', submitting: false })
  }
  const handleRenewCharge = (c: Charge) => {
    setChargeMenuOpen(null)
    const svc = services.find(s => s.name === c.service_name)
    // Ищем самую позднюю дату окончания среди всех периодов этой услуги (кроме отменённых)
    const latestEndDate = charges
      .filter(ch => ch.service_name === c.service_name && ch.end_date && ch.status !== 'cancelled')
      .reduce<string | null>((latest, ch) => {
        if (!ch.end_date) return latest
        return !latest || ch.end_date > latest ? ch.end_date : latest
      }, null)
    const startDate = latestEndDate ? addDays(latestEndDate, 1) : ''
    const dur = svc?.duration_days ?? 30
    const endDate = startDate ? addDays(startDate, dur) : ''
    setChargeForm({
      service_name: c.service_name,
      start_date: startDate,
      end_date: endDate,
      amount: String(c.amount),
      comment: '',
    })
    setTimeout(() => {
      if (!chargeFormRef.current) return
      const y = chargeFormRef.current.getBoundingClientRect().top + window.scrollY - 80
      window.scrollTo({ top: y, behavior: 'smooth' })
    }, 50)
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
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const currentWeekMonday = getWeekMonday(today)

  const STATUS_SORT: Record<string, number> = { upcoming: 0, active: 1, paused: 2, expired: 3, cancelled: 4 }
  const chargesSorted = [...charges].sort((a, b) => {
    const oa = STATUS_SORT[getChargeDisplayStatus(a, todayStr)] ?? 5
    const ob = STATUS_SORT[getChargeDisplayStatus(b, todayStr)] ?? 5
    if (oa !== ob) return oa - ob
    return (b.start_date ?? '').localeCompare(a.start_date ?? '')
  })

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
    // При паузе: не считаем недели после freeze_start как оказанные (услуга не оказывается)
    const freezeStartMs = c.freeze_start ? new Date(c.freeze_start + 'T00:00:00').getTime() : null
    const mondayEnd = getWeekMonday(end)
    const mondayOfStartWeek = getWeekMonday(start)
    const firstWeekMonday = new Date(mondayOfStartWeek)
    firstWeekMonday.setDate(firstWeekMonday.getDate() + 7)
    if (firstWeekMonday.getTime() > mondayEnd.getTime()) {
      totalWeeksContract += 1
      const weekRendered = mondayEnd.getTime() <= currentWeekMonday.getTime() &&
        (freezeStartMs === null || mondayEnd.getTime() < freezeStartMs)
      if (weekRendered) {
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
      const isPast = cursor.getTime() <= currentWeekMonday.getTime()
      const notFrozen = freezeStartMs === null || cursor.getTime() < freezeStartMs
      if (isPast && notFrozen) {
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

  // Статистика по каждой услуге:
  //   charged/paid — из исходных данных (всё время, без фильтра периода)
  //   rendered     — weekly_recognition из journal_entries за выбранный период
  //   задолженность — по всему объёму оказанных услуг (не фильтруем), в неделях
  const svcStatsFrom = svcStatsPeriodFrom || '1970-01-01'
  const svcStatsTo = svcStatsPeriodTo || '2099-12-31'
  const allServiceStats = uniqueServices.map(svc => {
    const svcCharges = charges.filter(c => c.service_name === svc && c.status !== 'cancelled')
    const svcPayments = payments.filter(p => p.service_name === svc)

    // Начислено/оплачено — итоговые за всё время
    const charged = svcCharges.reduce((s, c) => s + Number(c.amount), 0)
    const paid = svcPayments.reduce((s, p) => s + Number(p.amount), 0)

    // Оказано — из журнала за выбранный период (period-filtered)
    const rendered = journalEntries
      .filter(e => e.service_name === svc && e.document_type === 'weekly_recognition'
        && e.entry_date >= svcStatsFrom && e.entry_date <= svcStatsTo)
      .reduce((s, e) => s + Number(e.amount), 0)

    // Всего оказано за всё время (для расчёта задолженности)
    const renderedTotal = journalEntries
      .filter(e => e.service_name === svc && e.document_type === 'weekly_recognition')
      .reduce((s, e) => s + Number(e.amount), 0)

    // Общее кол-во недель в контракте (с учётом заморозки) — для расчёта apw
    let svcTotalWeeks = 0
    svcCharges.forEach(c => {
      const startStr = c.start_date || c.created_at
      const endStr = c.end_date || c.start_date || c.created_at
      if (!startStr) return
      const start = new Date(startStr + 'T00:00:00'); start.setHours(0, 0, 0, 0)
      const end = endStr ? new Date(endStr + 'T00:00:00') : new Date(start); end.setHours(0, 0, 0, 0)
      const freezeStartMs = c.freeze_start ? new Date(c.freeze_start + 'T00:00:00').getTime() : null
      const freezeEndMs = c.freeze_end ? new Date(c.freeze_end + 'T00:00:00').getTime() : null
      const mondayEnd = getWeekMonday(end)
      const firstWeekMonday = new Date(getWeekMonday(start)); firstWeekMonday.setDate(firstWeekMonday.getDate() + 7)
      if (firstWeekMonday.getTime() > mondayEnd.getTime()) {
        const inFreeze = freezeStartMs !== null
          && mondayEnd.getTime() >= freezeStartMs
          && (freezeEndMs === null || mondayEnd.getTime() < freezeEndMs)
        if (!inFreeze) svcTotalWeeks += 1
        return
      }
      const cur = new Date(firstWeekMonday)
      while (cur.getTime() <= mondayEnd.getTime()) {
        const inFreeze = freezeStartMs !== null
          && cur.getTime() >= freezeStartMs
          && (freezeEndMs === null || cur.getTime() < freezeEndMs)
        if (!inFreeze) svcTotalWeeks += 1
        cur.setDate(cur.getDate() + 7)
      }
    })

    let svcDebtClient: number | null = null
    let svcDebtUs: number | null = null
    let svcDebtWeeksClient = 0
    let svcDebtWeeksUs = 0
    if (svcTotalWeeks > 0 && charged > 0) {
      const apw = charged / svcTotalWeeks
      const weeksRenderedAll = renderedTotal / apw
      const weeksPaid = paid / apw
      const diff = weeksRenderedAll - weeksPaid
      if (diff > 0.5) {
        svcDebtWeeksClient = Math.round(diff)
        svcDebtClient = svcDebtWeeksClient * apw
      } else if (diff < -0.5) {
        svcDebtWeeksUs = Math.round(-diff)
        svcDebtUs = svcDebtWeeksUs * apw
      }
    }
    return { name: svc, charged, paid, toPay: charged - paid, rendered, debtClient: svcDebtClient, debtUs: svcDebtUs, debtWeeksClient: svcDebtWeeksClient, debtWeeksUs: svcDebtWeeksUs }
  })

  // Карточка счёта 62 по услугам за период
  const entries62 = journalEntries.filter(e => e.debit_account_code === '62' || e.credit_account_code === '62')
  const cardServices = Array.from(new Set(entries62.map(e => e.service_name))).sort()
  const card62FromDate = card62PeriodFrom || '1970-01-01'
  const card62ToDate = card62PeriodTo || '2099-12-31'
  const periodFromDate = periodFrom || '1970-01-01'
  const periodToDate = periodTo || '2099-12-31'
  const cardRows = cardServices.map(service_name => {
    const forService = (ee: typeof entries62) => ee.filter(e => e.service_name === service_name)
    const beforePeriod = forService(entries62).filter(e => e.entry_date < card62FromDate)
    const inPeriod = forService(entries62).filter(e => e.entry_date >= card62FromDate && e.entry_date <= card62ToDate)
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

  // ОСВ: оборотно-сальдовая ведомость по счетам в разрезе услуг
  const accountName: Record<string, string> = {
    '62': 'Расчёты с покупателями',
    '98': 'Доходы будущих периодов',
    '90': 'Продажи',
    '51': 'Расчётные счета',
  }
  // ОСВ: разделяем проводки на «до периода» (сальдо нач.) и «внутри периода» (обороты)
  type AccEntry = { dt: number; kt: number }
  const addToMap = (map: Map<string, Map<string, AccEntry>>, svc: string, acc: string, side: 'dt' | 'kt', amount: number) => {
    if (!map.has(svc)) map.set(svc, new Map())
    const m = map.get(svc)!
    if (!m.has(acc)) m.set(acc, { dt: 0, kt: 0 })
    m.get(acc)![side] += amount
  }
  const osvOpenMap = new Map<string, Map<string, AccEntry>>()  // до periodFromDate
  const osvPeriodMap = new Map<string, Map<string, AccEntry>>() // в период
  journalEntries.forEach(e => {
    const svc = e.service_name || '(без услуги)'
    const amt = Number(e.amount)
    const target = e.entry_date < periodFromDate ? osvOpenMap : (e.entry_date <= periodToDate ? osvPeriodMap : null)
    if (!target) return
    addToMap(target, svc, e.debit_account_code, 'dt', amt)
    addToMap(target, svc, e.credit_account_code, 'kt', amt)
  })
  const allOsvSvcs = Array.from(new Set([...osvOpenMap.keys(), ...osvPeriodMap.keys()])).sort()
  const osvData = allOsvSvcs.map(name => {
    const openMap  = osvOpenMap.get(name)  ?? new Map<string, AccEntry>()
    const inMap    = osvPeriodMap.get(name) ?? new Map<string, AccEntry>()
    const allAccs  = Array.from(new Set([...openMap.keys(), ...inMap.keys()])).sort()
    const rows = allAccs.map(account => {
      const o = openMap.get(account)  ?? { dt: 0, kt: 0 }
      const p = inMap.get(account)    ?? { dt: 0, kt: 0 }
      // сальдо нач: dt - kt (положительное = Дт, отрицательное = Кт)
      const openingNet = o.dt - o.kt
      const periodDt   = p.dt
      const periodKt   = p.kt
      // сальдо кон = сальдо нач + (оборот Дт − оборот Кт)
      const closingNet = openingNet + periodDt - periodKt
      return { account, openingNet, periodDt, periodKt, closingNet }
    })
    const totalOpeningNet = rows.reduce((s, r) => s + r.openingNet, 0)
    const totalPeriodDt   = rows.reduce((s, r) => s + r.periodDt, 0)
    const totalPeriodKt   = rows.reduce((s, r) => s + r.periodKt, 0)
    const totalClosingNet = rows.reduce((s, r) => s + r.closingNet, 0)
    return { name, rows, totalOpeningNet, totalPeriodDt, totalPeriodKt, totalClosingNet }
  })
  // Сальдо конечное: Дт = max(0, dt-kt), Кт = max(0, kt-dt) — универсально для любого счёта
  const osvNetDt = (dt: number, kt: number) => dt > kt ? dt - kt : 0
  const osvNetKt = (dt: number, kt: number) => kt > dt ? kt - dt : 0

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Nav />
      <div className="mx-auto max-w-[84rem] px-4 py-8 sm:px-6">
        <Breadcrumbs items={[{ href: '/', label: 'Главная' }, { href: '/clients', label: 'Клиенты' }, { href: `/clients/${id}`, label: client.name }]} />

        <div className="mt-4">
          <ClientDashboard
            clientName={client.name}
            legalName={client.legal_name ?? null}
            managerName={
              client.employees
                ? Array.isArray(client.employees)
                  ? (client.employees[0]?.name ?? null)
                  : client.employees.name
                : null
            }
            createdAt={client.created_at}
            charges={charges}
            payments={payments}
            onEditClick={() => setShowClientEdit(v => !v)}
            editFormSlot={showClientEdit ? (
              <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
                <div className="flex flex-wrap items-end gap-3">
                  <label className="min-w-[180px] flex-1">
                    <span className="mb-1 block text-xs text-[var(--muted)]">Название</span>
                    <input
                      value={clientEdit.name}
                      onChange={e => setClientEdit(f => ({ ...f, name: e.target.value }))}
                      placeholder="Название"
                      className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
                    />
                  </label>
                  <label className="min-w-[180px] flex-1">
                    <span className="mb-1 block text-xs text-[var(--muted)]">Юридическое название</span>
                    <input
                      value={clientEdit.legal_name}
                      onChange={e => setClientEdit(f => ({ ...f, legal_name: e.target.value }))}
                      placeholder="—"
                      className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
                    />
                  </label>
                  <label className="min-w-[150px]">
                    <span className="mb-1 block text-xs text-[var(--muted)]">Менеджер</span>
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
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirm({ open: true, type: 'client', id: 0 })}
                      disabled={saving || (clientEdit.name === (client.name ?? '') && clientEdit.legal_name === (client.legal_name ?? '') && clientEdit.manager_id === (client.manager_id != null ? String(client.manager_id) : ''))}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40"
                    >
                      Сохранить
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowClientEdit(false)}
                      className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              </section>
            ) : undefined}
          />
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">{error}</div>
        )}

        {/* Начисления */}
        <section className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
          <h2 className="text-lg font-medium text-[var(--foreground)]">Начисления</h2>
          <form ref={chargeFormRef} onSubmit={handleAddCharge} className="mt-4 flex flex-wrap items-end gap-3">
            <label className="min-w-[180px] flex-1">
              <span className="mb-1 block text-xs text-[var(--muted)]">Услуга</span>
              <select
                required
                value={chargeForm.service_name}
                onChange={e => {
                  const name = e.target.value
                  const svc = services.find(s => s.name === name)
                  const amount = svc ? String(svc.base_cost) : ''
                  const dur = svc?.duration_days
                  const start = chargeForm.start_date
                  const end = start && dur ? addDays(start, dur) : chargeForm.end_date
                  setChargeForm(f => ({ ...f, service_name: name, amount, end_date: end || f.end_date }))
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
              <input
                type="date"
                value={chargeForm.start_date}
                onChange={e => {
                  const start = e.target.value
                  const svc = services.find(s => s.name === chargeForm.service_name)
                  const dur = svc?.duration_days
                  const end = start && dur ? addDays(start, dur) : chargeForm.end_date
                  setChargeForm(f => ({ ...f, start_date: start, end_date: end || f.end_date }))
                }}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
              />
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
          <div className="mt-4 overflow-auto rounded-lg border border-[var(--border)]">
            <table className="min-w-full text-sm">
              <thead className="bg-[var(--muted)]/10">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-[var(--muted)]">Услуга</th>
                  <th className="px-3 py-2 text-left font-medium text-[var(--muted)]">Начало</th>
                  <th className="px-3 py-2 text-left font-medium text-[var(--muted)]">Конец</th>
                  <th className="px-3 py-2 text-right font-medium text-[var(--muted)]">Сумма</th>
                  <th className="px-3 py-2 text-left font-medium text-[var(--muted)]">Комментарий</th>
                  <th className="px-3 py-2 text-left font-medium text-[var(--muted)]">Тип</th>
                  <th className="px-3 py-2 text-left font-medium text-[var(--muted)]">Статус</th>
                  <th className="px-3 py-2 w-24"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {chargesSorted.map(c => {
                  const status = getChargeDisplayStatus(c, todayStr)
                  const statusLabel = { upcoming: 'Запланирована', active: 'Активна', expired: 'Истекла', paused: 'На паузе', cancelled: 'Отменена' }[status]
                  return (
                  <tr key={c.id} className={status === 'expired' ? 'text-zinc-400 dark:text-zinc-500' : status === 'cancelled' ? 'opacity-50' : ''}>
                    {editingCharge?.id === c.id ? (
                      <>
                        <td className="px-3 py-2">
                          <select className="min-w-[140px] rounded border border-zinc-200 bg-white px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-800" id={`c-sn-${c.id}`} defaultValue={c.service_name}>
                            {!services.some(s => s.name === c.service_name) && <option value={c.service_name}>{c.service_name}</option>}
                            {services.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2"><input type="date" className="rounded border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-800" defaultValue={c.start_date || ''} id={`c-sd-${c.id}`} onChange={e => { const svc = services.find(s => s.name === (document.getElementById(`c-sn-${c.id}`) as HTMLSelectElement)?.value); const dur = svc?.duration_days; if (dur && e.target.value) { const edEl = document.getElementById(`c-ed-${c.id}`) as HTMLInputElement; if (edEl) edEl.value = addDays(e.target.value, dur) } }} /></td>
                        <td className="px-3 py-2"><input type="date" className="rounded border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-800" defaultValue={c.end_date || ''} id={`c-ed-${c.id}`} /></td>
                        <td className="px-3 py-2"><input type="text" className="w-20 rounded border border-zinc-200 px-2 py-1 text-sm text-right dark:border-zinc-600 dark:bg-zinc-800" defaultValue={c.amount} id={`c-am-${c.id}`} /></td>
                        <td className="px-3 py-2"><input className="w-full rounded border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-800" defaultValue={c.comment || ''} id={`c-cm-${c.id}`} /></td>
                        <td className="px-3 py-2 text-xs text-[var(--muted)]">{{ 'primary': 'Подписка / Первичная', 'renewal': 'Подписка / Продление', 'one-time': 'Разовая' }[c.subscription_type ?? ''] ?? '—'}</td>
                        <td className="px-3 py-2 text-[var(--muted)]">—</td>
                        <td className="px-3 py-2">
                          <button type="button" onClick={() => { const sn = (document.getElementById(`c-sn-${c.id}`) as HTMLSelectElement)?.value; const sd = (document.getElementById(`c-sd-${c.id}`) as HTMLInputElement)?.value; const ed = (document.getElementById(`c-ed-${c.id}`) as HTMLInputElement)?.value; const am = (document.getElementById(`c-am-${c.id}`) as HTMLInputElement)?.value; const cm = (document.getElementById(`c-cm-${c.id}`) as HTMLInputElement)?.value; const editSvc = services.find(s => s.name === sn); if (sd && ed && sd > ed) { setChargeFormError('Дата начала не может быть позже даты окончания.'); return; } if (sd && ed && editSvc?.type === 'subscription') { const overlap = charges.filter(ch => ch.service_name === sn && ch.id !== c.id && ch.status !== 'cancelled').some(ch => ch.start_date && ch.end_date && sd < ch.end_date && ed > ch.start_date); if (overlap) { setChargeFormError('Период пересекается с другим начислением по этой услуге.'); return; } } setChargeFormError(null); const updateData = { service_name: sn, start_date: sd || null, end_date: ed || null, amount: am ? parseFloat(am.replace(',', '.')) : 0, comment: cm || null }; if (editingCharge?.freeze_start) { setKeepPauseModal({ open: true, data: updateData }) } else { requestChargeUpdate(updateData) } }} className="text-blue-600 text-xs hover:underline">Сохранить</button>
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
                          {c.subscription_type === 'one-time' ? (
                            <span className="inline-block rounded-full px-2 py-0.5 text-xs font-medium bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">Разовая</span>
                          ) : c.subscription_type === 'primary' ? (
                            <div>
                              <span className="inline-block rounded-full px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">Подписка</span>
                              <div className="mt-0.5 text-xs text-blue-600 dark:text-blue-400">Первичная</div>
                            </div>
                          ) : c.subscription_type === 'renewal' ? (
                            <div>
                              <span className="inline-block rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300">Подписка</span>
                              <div className="mt-0.5 text-xs text-green-600 dark:text-green-400">Продление</div>
                            </div>
                          ) : (
                            <span className="text-[var(--muted)]">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-[var(--muted)]">
                          <div>{statusLabel}</div>
                          {c.status === 'paused' && c.freeze_start && (
                            <div className="text-xs opacity-70">Пауза с {formatDate(c.freeze_start)}</div>
                          )}
                          {c.status !== 'paused' && c.freeze_start && c.freeze_end && (
                            <div className="text-xs opacity-60">Была пауза: {formatDate(c.freeze_start)} – {formatDate(c.freeze_end)}</div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {/* Кнопка-стрелка — открывает/закрывает меню */}
                          <button
                            type="button"
                            title="Действия"
                            onClick={(e) => { const rect = (e.currentTarget as HTMLElement).getBoundingClientRect(); setChargeMenuOpen(prev => prev?.id === c.id ? null : { id: c.id, rect }) }}
                            className="inline-flex items-center justify-center rounded px-1.5 py-1 text-[var(--muted)] hover:bg-[var(--muted)]/20 hover:text-[var(--foreground)] transition-colors"
                          >
                            {chargeMenuOpen?.id === c.id
                              ? <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 9l4-4 4 4"/></svg>
                              : <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 5l4 4 4-4"/></svg>
                            }
                          </button>
                          {chargeMenuOpen?.id === c.id && typeof document !== 'undefined' && createPortal(
                            <>
                              <div className="fixed inset-0 z-40" aria-hidden onClick={() => setChargeMenuOpen(null)} />
                              <div
                                className="fixed z-50 min-w-[190px] rounded-lg border border-[var(--border)] bg-[var(--card)] py-1 shadow-xl"
                                style={{ bottom: typeof window !== 'undefined' ? window.innerHeight - chargeMenuOpen.rect.top + 8 : 0, left: chargeMenuOpen.rect.left }}
                              >
                                {/* Блок 1: главные действия */}
                                {(status === 'active' || status === 'expired' || status === 'paused') && c.subscription_type !== 'one-time' && (
                                  <button type="button" className="block w-full px-3 py-2 text-left text-xs font-semibold text-green-700 hover:bg-[var(--muted)]/20 dark:text-green-400" onClick={() => handleRenewCharge(c)}>Продлить</button>
                                )}
                                {status === 'paused' && (
                                  <button type="button" className="block w-full px-3 py-2 text-left text-xs font-semibold text-green-700 hover:bg-[var(--muted)]/20 dark:text-green-400" onClick={() => openFreezeResume(c)}>Возобновить</button>
                                )}
                                {status !== 'cancelled' && (
                                  <button type="button" className="block w-full px-3 py-2 text-left text-xs hover:bg-[var(--muted)]/20" onClick={() => { setEditingCharge(c); setChargeMenuOpen(null) }}>Изменить</button>
                                )}

                                {/* Разделитель + Блок 2: изменение статуса */}
                                {(status === 'active' || status === 'upcoming' || status === 'expired' || status === 'paused') && (
                                  <>
                                    <div className="my-1 border-t border-[var(--border)]" />
                                    {status === 'active' && (
                                      <button type="button" className="block w-full px-3 py-2 text-left text-xs hover:bg-[var(--muted)]/20" onClick={() => openFreezePause(c)}>Приостановить</button>
                                    )}
                                    <button type="button" className="block w-full px-3 py-2 text-left text-xs hover:bg-[var(--muted)]/20" onClick={() => handleCancelCharge(c)}>Отменить услугу</button>
                                  </>
                                )}

                                {/* Разделитель + Блок 3: удаление */}
                                <div className="my-1 border-t border-[var(--border)]" />
                                <button type="button" className="block w-full px-3 py-2 text-left text-xs text-red-600 hover:bg-red-50/60 dark:text-red-400 dark:hover:bg-red-950/20" onClick={() => { requestChargeDelete(c.id); setChargeMenuOpen(null) }}>Удалить запись</button>
                              </div>
                            </>,
                            document.body
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Оплаты */}
        <section className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
          <h2 className="text-lg font-medium text-[var(--foreground)]">Оплаты</h2>
          <form onSubmit={handleAddPayment} className="mt-4 flex flex-wrap items-end gap-3">
            <label className="min-w-[240px] flex-1">
              <span className="mb-1 block text-xs text-[var(--muted)]">Начисление (период)</span>
              <select
                required
                value={paymentForm.charge_id}
                onChange={e => {
                  const cid = e.target.value
                  const linked = cid ? charges.find(c => c.id === Number(cid)) : null
                  setPaymentForm(f => ({ ...f, charge_id: cid, amount: linked ? String(linked.amount) : f.amount }))
                }}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
              >
                <option value="">— выбрать начисление —</option>
                {charges.filter(c => c.status !== 'cancelled').map(c => (
                  <option key={c.id} value={c.id}>{c.service_name} — {formatDate(c.start_date)} – {formatDate(c.end_date)}</option>
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
          <div className="mt-4 overflow-auto rounded-lg border border-[var(--border)]">
            <table className="min-w-full text-sm">
              <thead className="bg-[var(--muted)]/10">
                <tr><th className="px-3 py-2 text-left font-medium text-[var(--muted)]">Услуга</th><th className="px-3 py-2 text-left font-medium text-[var(--muted)]">Период</th><th className="px-3 py-2 text-left font-medium text-[var(--muted)]">Дата</th><th className="px-3 py-2 text-right font-medium text-[var(--muted)]">Сумма</th><th className="px-3 py-2 text-left font-medium text-[var(--muted)]">Комментарий</th><th className="px-3 py-2 w-24"></th></tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {payments.map(p => (
                  <tr key={p.id}>
                    {editingPayment?.id === p.id ? (
                      <>
                        <td className="px-3 py-2">
                          <select className="min-w-[200px] rounded border border-zinc-200 bg-white px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-800" id={`p-cid-${p.id}`} defaultValue={p.charge_id ?? ''}>
                            <option value="">— без привязки —</option>
                            {charges.map(c => <option key={c.id} value={c.id}>{c.service_name} — {formatDate(c.start_date)} – {formatDate(c.end_date)}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2 text-xs text-[var(--muted)]">—</td>
                        <td className="px-3 py-2"><input type="date" className="rounded border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-800" defaultValue={p.payment_date ?? p.created_at?.slice(0, 10) ?? ''} id={`p-dt-${p.id}`} /></td>
                        <td className="px-3 py-2"><input type="text" className="w-20 rounded border border-zinc-200 px-2 py-1 text-sm text-right dark:border-zinc-600 dark:bg-zinc-800" defaultValue={p.amount} id={`p-am-${p.id}`} /></td>
                        <td className="px-3 py-2"><input className="w-full rounded border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-800" defaultValue={p.comment || ''} id={`p-cm-${p.id}`} /></td>
                        <td className="px-3 py-2">
                          <button type="button" onClick={() => { const cid = (document.getElementById(`p-cid-${p.id}`) as HTMLSelectElement)?.value; const linkedCh = cid ? charges.find(c => c.id === Number(cid)) : null; const sn = linkedCh?.service_name ?? p.service_name; const svcId = linkedCh ? services.find(s => s.name === linkedCh.service_name)?.id ?? null : null; const dt = (document.getElementById(`p-dt-${p.id}`) as HTMLInputElement)?.value; const am = (document.getElementById(`p-am-${p.id}`) as HTMLInputElement)?.value; const cm = (document.getElementById(`p-cm-${p.id}`) as HTMLInputElement)?.value; requestPaymentUpdate({ service_name: sn, service_id: svcId, charge_id: cid ? Number(cid) : null, payment_date: dt || p.payment_date || new Date().toISOString().slice(0, 10), amount: am ? parseFloat(am.replace(',', '.')) : 0, comment: cm || null }); }} className="text-blue-600 text-xs hover:underline">Сохранить</button>
                          <button type="button" onClick={() => setEditingPayment(null)} className="ml-1 text-zinc-500 text-xs hover:underline">Отмена</button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2">{p.service_name}</td>
                        <td className="px-3 py-2 text-xs text-[var(--muted)]">
                          {(() => { const ch = p.charge_id ? charges.find(c => c.id === p.charge_id) : null; return ch ? `${formatDate(ch.start_date)} – ${formatDate(ch.end_date)}` : '—' })()}
                        </td>
                        <td className="px-3 py-2">{formatDate(p.payment_date ?? p.created_at?.slice(0, 10) ?? null)}</td>
                        <td className="px-3 py-2 text-right">{formatMoney(Number(p.amount))}</td>
                        <td className="px-3 py-2 text-[var(--muted)]">{p.comment ?? '—'}</td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            title="Действия"
                            onClick={(e) => { const rect = (e.currentTarget as HTMLElement).getBoundingClientRect(); setPaymentMenuOpen(prev => prev?.id === p.id ? null : { id: p.id, rect }) }}
                            className="inline-flex items-center justify-center rounded px-1.5 py-1 text-[var(--muted)] hover:bg-[var(--muted)]/20 hover:text-[var(--foreground)] transition-colors"
                          >
                            {paymentMenuOpen?.id === p.id
                              ? <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 9l4-4 4 4"/></svg>
                              : <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 5l4 4 4-4"/></svg>
                            }
                          </button>
                          {paymentMenuOpen?.id === p.id && typeof document !== 'undefined' && createPortal(
                            <>
                              <div className="fixed inset-0 z-40" aria-hidden onClick={() => setPaymentMenuOpen(null)} />
                              <div
                                className="fixed z-50 min-w-[190px] rounded-lg border border-[var(--border)] bg-[var(--card)] py-1 shadow-xl"
                                style={{ bottom: typeof window !== 'undefined' ? window.innerHeight - paymentMenuOpen.rect.top + 8 : 0, left: paymentMenuOpen.rect.left }}
                              >
                                <button type="button" className="block w-full px-3 py-2 text-left text-xs hover:bg-[var(--muted)]/20" onClick={() => { setEditingPayment(p); setPaymentMenuOpen(null); }}>Изменить</button>
                                <div className="my-1 border-t border-[var(--border)]" />
                                <button type="button" className="block w-full px-3 py-2 text-left text-xs text-red-600 hover:bg-red-50/60 dark:text-red-400 dark:hover:bg-red-950/20" onClick={() => { requestPaymentDelete(p.id); setPaymentMenuOpen(null); }}>Удалить запись</button>
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
          <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
            <h2 className="text-lg font-medium text-[var(--foreground)]">Карточка расчётов с клиентом (счёт 62)</h2>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2">
                <span className="text-sm text-[var(--muted)]">с</span>
                <input type="date" value={card62PeriodFrom} onChange={e => setCard62PeriodFrom(e.target.value)} className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800" />
              </label>
              <label className="flex items-center gap-2">
                <span className="text-sm text-[var(--muted)]">по</span>
                <input type="date" value={card62PeriodTo} onChange={e => setCard62PeriodTo(e.target.value)} className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800" />
              </label>
            </div>
          </div>
          <div className="overflow-auto rounded-lg border border-[var(--border)]">
            <table className="min-w-full text-sm">
              <thead className="bg-[var(--muted)]/10">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-[var(--muted)]">Услуга</th>
                  <th className="px-3 py-2 text-right font-medium text-[var(--muted)]">Сальдо нач. Дт</th>
                  <th className="px-3 py-2 text-right font-medium text-[var(--muted)]">Сальдо нач. Кт</th>
                  <th className="px-3 py-2 text-right font-medium text-[var(--muted)]">Дт (начислено)</th>
                  <th className="px-3 py-2 text-right font-medium text-[var(--muted)]">Кт (погашено)</th>
                  <th className="px-3 py-2 text-right font-medium text-[var(--muted)]">Сальдо кон. Дт</th>
                  <th className="px-3 py-2 text-right font-medium text-[var(--muted)]">Сальдо кон. Кт</th>
                  <th className="px-3 py-2 w-28"></th>
                </tr>
              </thead>
              <tbody>
                {cardRows.map(r => {
                  const isExpanded = card62Expanded === r.service_name
                  const detailEntries = entries62
                    .filter(e => e.service_name === r.service_name && e.entry_date >= card62FromDate && e.entry_date <= card62ToDate)
                    .sort((a, b) => a.entry_date.localeCompare(b.entry_date))
                  const docLabel: Record<string, string> = {
                    charge: 'Начисление', payment: 'Оплата', weekly_recognition: 'Признание выручки',
                    cancellation: 'Отмена',
                  }
                  return (
                    <React.Fragment key={r.service_name}>
                      <tr className="border-t border-[var(--border)]">
                        <td className="px-3 py-2">{r.service_name}</td>
                        <td className="px-3 py-2 text-right">{r.opening > 0 ? formatMoneyInt(r.opening) : '—'}</td>
                        <td className="px-3 py-2 text-right">{r.opening < 0 ? formatMoneyInt(-r.opening) : '—'}</td>
                        <td className="px-3 py-2 text-right">{formatMoneyInt(r.charged)}</td>
                        <td className="px-3 py-2 text-right">{formatMoneyInt(r.paid)}</td>
                        <td className="px-3 py-2 text-right font-medium">{r.closing > 0 ? formatMoneyInt(r.closing) : '—'}</td>
                        <td className="px-3 py-2 text-right font-medium">{r.closing < 0 ? formatMoneyInt(-r.closing) : '—'}</td>
                        <td className="px-3 py-2 text-right">
                          <button type="button" onClick={() => setCard62Expanded(isExpanded ? null : r.service_name)} className="text-xs text-blue-600 hover:underline">
                            {isExpanded ? 'Свернуть' : 'Развернуть'}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && detailEntries.map(e => (
                        <tr key={e.id} className="border-t border-[var(--border)]/50 bg-[var(--muted)]/5 text-xs">
                          <td className="px-3 py-1.5 pl-6 text-[var(--muted)]">
                            {formatDate(e.entry_date)}
                            <span className="ml-2">{docLabel[e.document_type] ?? e.document_type}</span>
                          </td>
                          <td className="px-3 py-1.5" />
                          <td className="px-3 py-1.5" />
                          <td className="px-3 py-1.5 text-right">{e.debit_account_code === '62' ? formatMoneyInt(Number(e.amount)) : ''}</td>
                          <td className="px-3 py-1.5 text-right">{e.credit_account_code === '62' ? formatMoneyInt(Number(e.amount)) : ''}</td>
                          <td className="px-3 py-1.5" />
                          <td className="px-3 py-1.5" />
                          <td className="px-3 py-1.5" />
                        </tr>
                      ))}
                      {isExpanded && detailEntries.length === 0 && (
                        <tr className="border-t border-[var(--border)]/50 bg-[var(--muted)]/5 text-xs">
                          <td colSpan={8} className="px-3 py-2 pl-6 text-[var(--muted)]">Нет операций за выбранный период.</td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
                {cardRows.length > 0 && (
                  <tr className="border-t-2 border-[var(--border)] bg-[var(--muted)]/5 font-medium">
                    <td className="px-3 py-2">Итого</td>
                    <td className="px-3 py-2 text-right">{cardTotal.opening > 0 ? formatMoneyInt(cardTotal.opening) : '—'}</td>
                    <td className="px-3 py-2 text-right">{cardTotal.opening < 0 ? formatMoneyInt(-cardTotal.opening) : '—'}</td>
                    <td className="px-3 py-2 text-right">{formatMoneyInt(cardTotal.charged)}</td>
                    <td className="px-3 py-2 text-right">{formatMoneyInt(cardTotal.paid)}</td>
                    <td className="px-3 py-2 text-right">{cardTotal.closing > 0 ? formatMoneyInt(cardTotal.closing) : '—'}</td>
                    <td className="px-3 py-2 text-right">{cardTotal.closing < 0 ? formatMoneyInt(-cardTotal.closing) : '—'}</td>
                    <td></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {cardRows.length === 0 && (
            <p className="mt-2 text-sm text-[var(--muted)]">Нет проводок по счёту 62 за выбранный период и ранее.</p>
          )}
          <p className="mt-3 text-xs text-[var(--muted)]">Положительное сальдо — задолженность клиента, отрицательное — переплата. Кт включает оплаты, отмены и сторно заморозок.</p>
        </section>

        {/* Карточка оказания услуг */}
        <section className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
            <h2 className="text-lg font-medium text-[var(--foreground)]">Карточка оказания услуг</h2>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2">
                <span className="text-sm text-[var(--muted)]">с</span>
                <input type="date" value={svcStatsPeriodFrom} onChange={e => setSvcStatsPeriodFrom(e.target.value)} className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800" />
              </label>
              <label className="flex items-center gap-2">
                <span className="text-sm text-[var(--muted)]">по</span>
                <input type="date" value={svcStatsPeriodTo} onChange={e => setSvcStatsPeriodTo(e.target.value)} className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800" />
              </label>
            </div>
          </div>
          {uniqueServices.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--muted)]">Нет начислений.</p>
          ) : (
            <div className="mt-4 overflow-auto rounded-lg border border-[var(--border)]">
              <table className="min-w-full text-sm">
                <thead className="bg-[var(--muted)]/10">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-[var(--muted)]">Услуга</th>
                    <th className="px-3 py-2 text-right font-medium text-[var(--muted)]">Начислено</th>
                    <th className="px-3 py-2 text-right font-medium text-[var(--muted)]">Оплачено</th>
                    <th className="px-3 py-2 text-right font-medium text-[var(--muted)]">К оплате</th>
                    <th className="px-3 py-2 text-right font-medium text-[var(--muted)]">Оказано</th>
                    <th className="px-3 py-2 text-left font-medium text-[var(--muted)]">Задолженность</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {allServiceStats.map(s => (
                    <tr key={s.name} className="border-t border-[var(--border)]">
                      <td className="px-3 py-2 font-medium">{s.name}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(Math.round(s.charged))}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(Math.round(s.paid))}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(Math.round(Math.max(0, s.toPay)))}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(Math.round(s.rendered))}</td>
                      <td className="px-3 py-2 text-sm">
                        {s.debtClient != null && s.debtClient > 0
                          ? <span className="text-red-600 dark:text-red-400">Клиент: {formatMoney(Math.round(s.debtClient))}{s.debtWeeksClient > 0 ? <span className="ml-1 text-xs opacity-70">({s.debtWeeksClient} нед.)</span> : null}</span>
                          : s.debtUs != null && s.debtUs > 0
                            ? <span className="text-green-600 dark:text-green-400">Мы: {formatMoney(Math.round(s.debtUs))}{s.debtWeeksUs > 0 ? <span className="ml-1 text-xs opacity-70">({s.debtWeeksUs} нед.)</span> : null}</span>
                            : <span className="text-emerald-600 dark:text-emerald-400">✓ Закрыто</span>}
                      </td>
                    </tr>
                  ))}
                  {allServiceStats.length > 1 && (
                    <tr className="border-t-2 border-[var(--border)] bg-[var(--muted)]/5 font-medium">
                      <td className="px-3 py-2">Итого</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(Math.round(allServiceStats.reduce((s, r) => s + r.charged, 0)))}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(Math.round(allServiceStats.reduce((s, r) => s + r.paid, 0)))}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(Math.round(Math.max(0, allServiceStats.reduce((s, r) => s + r.toPay, 0))))}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(Math.round(allServiceStats.reduce((s, r) => s + r.rendered, 0)))}</td>
                      <td className="px-3 py-2" />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-[var(--muted)]">«Мы» — задолженность: клиент переплатил, оказываем неделями вперёд. «Клиент» — должен за оказанные, но не оплаченные недели.</p>
        </section>

        {/* Сводка и график начислений */}
        {(() => {
          const dashCharged = charges.reduce((s, c) => s + Number(c.amount), 0)
          const dashPaid = payments.reduce((s, p) => s + Number(p.amount), 0)
          return (
            <section className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
              <h2 className="text-lg font-medium text-[var(--foreground)]">Дашборд начислений</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Всего начислено: {formatMoney(dashCharged)} · Оплачено: {formatMoney(dashPaid)} · Доля оплаты: {dashCharged ? Math.round((dashPaid / dashCharged) * 100) : 0}%</p>
              <div className="mt-6">
                <WeeklyPaymentMatrix charges={charges} payments={payments} journalEntries={journalEntries} />
              </div>
            </section>
          )
        })()}

        {/* Справочно: бухгалтерский учёт */}
        {journalEntries.length > 0 && (
          <section className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
              <h2 className="text-lg font-semibold text-[var(--foreground)]">Справочно (бухгалтерский учёт)</h2>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2">
                  <span className="text-sm text-[var(--muted)]">с</span>
                  <input type="date" value={periodFrom} onChange={e => setPeriodFrom(e.target.value)} className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800" />
                </label>
                <label className="flex items-center gap-2">
                  <span className="text-sm text-[var(--muted)]">по</span>
                  <input type="date" value={periodTo} onChange={e => setPeriodTo(e.target.value)} className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800" />
                </label>
              </div>
            </div>

            {/* Оборотно-сальдовая ведомость */}
            {osvData.length > 0 && (<div className="mb-8">
            <h3 className="mb-3 text-base font-medium text-[var(--foreground)]">Оборотно-сальдовая ведомость</h3>
            <div className="overflow-auto rounded-lg border border-[var(--border)]">
              <table className="min-w-full text-sm">
                <thead className="bg-[var(--muted)]/10">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-[var(--muted)]">Услуга / Счёт</th>
                    <th className="px-3 py-2 text-right font-medium text-[var(--muted)]">Сальдо нач. Дт</th>
                    <th className="px-3 py-2 text-right font-medium text-[var(--muted)]">Сальдо нач. Кт</th>
                    <th className="px-3 py-2 text-right font-medium text-[var(--muted)]">Оборот Дт</th>
                    <th className="px-3 py-2 text-right font-medium text-[var(--muted)]">Оборот Кт</th>
                    <th className="px-3 py-2 text-right font-medium text-[var(--muted)]">Сальдо кон. Дт</th>
                    <th className="px-3 py-2 text-right font-medium text-[var(--muted)]">Сальдо кон. Кт</th>
                  </tr>
                </thead>
                <tbody>
                  {osvData.map((svc, si) => {
                    const isOsvCollapsed = osvCollapsed.has(svc.name)
                    return (
                    <React.Fragment key={`svc-${si}`}>
                      {/* Заголовок услуги — кликабельный */}
                      <tr
                        className="bg-[var(--muted)]/5 border-t border-[var(--border)] cursor-pointer select-none hover:bg-[var(--muted)]/10 transition-colors"
                        onClick={() => setOsvCollapsed(prev => { const next = new Set(prev); if (next.has(svc.name)) next.delete(svc.name); else next.add(svc.name); return next })}
                      >
                        <td colSpan={7} className="px-3 py-2 font-semibold text-[var(--foreground)]">
                          <span className="mr-2 inline-block w-3 text-[var(--muted)] text-xs">{isOsvCollapsed ? '▶' : '▼'}</span>
                          {svc.name}
                          {isOsvCollapsed && (
                            <span className="ml-3 text-xs font-normal text-[var(--muted)]">{svc.rows.length} счетов · сальдо кон.: {svc.totalClosingNet > 0 ? 'Дт ' + formatMoneyInt(svc.totalClosingNet) : svc.totalClosingNet < 0 ? 'Кт ' + formatMoneyInt(-svc.totalClosingNet) : '0'}</span>
                          )}
                        </td>
                      </tr>
                      {/* Строки по счетам */}
                      {!isOsvCollapsed && svc.rows.map(row => (
                        <tr key={`${si}-${row.account}`} className="border-t border-[var(--border)]/50 hover:bg-[var(--muted)]/5">
                          <td className="px-3 py-2 pl-6 text-[var(--muted)]">
                            <span className="font-medium text-[var(--foreground)]">{row.account}</span>
                            {accountName[row.account] ? <span className="ml-2 text-xs text-[var(--muted)]">{accountName[row.account]}</span> : null}
                          </td>
                          <td className="px-3 py-2 text-right text-blue-600 dark:text-blue-400">{row.openingNet > 0 ? formatMoneyInt(row.openingNet) : '—'}</td>
                          <td className="px-3 py-2 text-right text-emerald-600 dark:text-emerald-400">{row.openingNet < 0 ? formatMoneyInt(-row.openingNet) : '—'}</td>
                          <td className="px-3 py-2 text-right">{row.periodDt > 0 ? formatMoneyInt(row.periodDt) : '—'}</td>
                          <td className="px-3 py-2 text-right">{row.periodKt > 0 ? formatMoneyInt(row.periodKt) : '—'}</td>
                          <td className="px-3 py-2 text-right font-medium text-blue-600 dark:text-blue-400">{row.closingNet > 0 ? formatMoneyInt(row.closingNet) : '—'}</td>
                          <td className="px-3 py-2 text-right font-medium text-emerald-600 dark:text-emerald-400">{row.closingNet < 0 ? formatMoneyInt(-row.closingNet) : '—'}</td>
                        </tr>
                      ))}
                      {/* Итого по услуге */}
                      {!isOsvCollapsed && svc.rows.length > 1 && (
                        <tr className="border-t border-[var(--border)] bg-[var(--muted)]/5 font-medium">
                          <td className="px-3 py-2 pl-6 text-[var(--muted)]">Итого по услуге</td>
                          <td className="px-3 py-2 text-right text-blue-600 dark:text-blue-400">{svc.totalOpeningNet > 0 ? formatMoneyInt(svc.totalOpeningNet) : '—'}</td>
                          <td className="px-3 py-2 text-right text-emerald-600 dark:text-emerald-400">{svc.totalOpeningNet < 0 ? formatMoneyInt(-svc.totalOpeningNet) : '—'}</td>
                          <td className="px-3 py-2 text-right">{svc.totalPeriodDt > 0 ? formatMoneyInt(svc.totalPeriodDt) : '—'}</td>
                          <td className="px-3 py-2 text-right">{svc.totalPeriodKt > 0 ? formatMoneyInt(svc.totalPeriodKt) : '—'}</td>
                          <td className="px-3 py-2 text-right font-medium text-blue-600 dark:text-blue-400">{svc.totalClosingNet > 0 ? formatMoneyInt(svc.totalClosingNet) : '—'}</td>
                          <td className="px-3 py-2 text-right font-medium text-emerald-600 dark:text-emerald-400">{svc.totalClosingNet < 0 ? formatMoneyInt(-svc.totalClosingNet) : '—'}</td>
                        </tr>
                      )}
                    </React.Fragment>
                    )
                  })}
                  {/* Итого по клиенту */}
                  {osvData.length > 1 && (() => {
                    const grandOpenNet = osvData.reduce((s, d) => s + d.totalOpeningNet, 0)
                    const grandPeriodDt = osvData.reduce((s, d) => s + d.totalPeriodDt, 0)
                    const grandPeriodKt = osvData.reduce((s, d) => s + d.totalPeriodKt, 0)
                    const grandCloseNet = osvData.reduce((s, d) => s + d.totalClosingNet, 0)
                    return (
                      <tr className="border-t-2 border-[var(--border)] bg-[var(--muted)]/10 font-bold">
                        <td className="px-3 py-2">Итого по клиенту</td>
                        <td className="px-3 py-2 text-right text-blue-600 dark:text-blue-400">{grandOpenNet > 0 ? formatMoneyInt(grandOpenNet) : '—'}</td>
                        <td className="px-3 py-2 text-right text-emerald-600 dark:text-emerald-400">{grandOpenNet < 0 ? formatMoneyInt(-grandOpenNet) : '—'}</td>
                        <td className="px-3 py-2 text-right">{grandPeriodDt > 0 ? formatMoneyInt(grandPeriodDt) : '—'}</td>
                        <td className="px-3 py-2 text-right">{grandPeriodKt > 0 ? formatMoneyInt(grandPeriodKt) : '—'}</td>
                        <td className="px-3 py-2 text-right text-blue-600 dark:text-blue-400">{grandCloseNet > 0 ? formatMoneyInt(grandCloseNet) : '—'}</td>
                        <td className="px-3 py-2 text-right text-emerald-600 dark:text-emerald-400">{grandCloseNet < 0 ? formatMoneyInt(-grandCloseNet) : '—'}</td>
                      </tr>
                    )
                  })()}
                </tbody>
              </table>
            </div>
            </div>)}

            {/* Бухгалтерские проводки в разрезе услуг */}
            {(() => {
              const filteredJournal = journalEntries.filter(e => e.entry_date >= periodFromDate && e.entry_date <= periodToDate)
              const svcOrder = Array.from(new Set(filteredJournal.map(e => e.service_name || '(без услуги)')))
              const bySvc = new Map<string, JournalEntry[]>()
              filteredJournal.forEach(e => {
                const key = e.service_name || '(без услуги)'
                if (!bySvc.has(key)) bySvc.set(key, [])
                bySvc.get(key)!.push(e)
              })
              return (
                <div>
                  <h3 className="mb-2 text-base font-medium text-[var(--foreground)]">Бухгалтерские проводки</h3>
                  <div className="overflow-auto rounded-lg border border-[var(--border)]">
                    <table className="min-w-full text-sm">
                      <thead className="bg-[var(--muted)]/10">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-[var(--muted)]">Операция</th>
                          <th className="px-3 py-2 text-left font-medium text-[var(--muted)]">Дата</th>
                          <th className="px-3 py-2 text-center font-medium text-[var(--muted)]">Дт</th>
                          <th className="px-3 py-2 text-center font-medium text-[var(--muted)]">Кт</th>
                          <th className="px-3 py-2 text-right font-medium text-[var(--muted)]">Сумма</th>
                        </tr>
                      </thead>
                      <tbody>
                        {svcOrder.map(svcName => {
                          const rows = bySvc.get(svcName) ?? []
                          const total = rows.reduce((s, e) => s + Number(e.amount), 0)
                          return (
                            <React.Fragment key={svcName}>
                              <tr
                                className="bg-[var(--muted)]/5 border-t border-[var(--border)] cursor-pointer select-none hover:bg-[var(--muted)]/10 transition-colors"
                                onClick={() => setJournalCollapsed(prev => {
                                  const next = new Set(prev)
                                  if (next.has(svcName)) next.delete(svcName)
                                  else next.add(svcName)
                                  return next
                                })}
                              >
                                <td colSpan={5} className="px-3 py-2 font-semibold text-[var(--foreground)]">
                                  <span className="mr-2 inline-block w-3 text-[var(--muted)] text-xs">
                                    {journalCollapsed.has(svcName) ? '▶' : '▼'}
                                  </span>
                                  {svcName}
                                  {journalCollapsed.has(svcName) && (
                                    <span className="ml-3 text-xs font-normal text-[var(--muted)]">{rows.length} проводок · {formatMoneyInt(total)}</span>
                                  )}
                                </td>
                              </tr>
                              {!journalCollapsed.has(svcName) && rows.map(e => (
                                <tr key={e.id} className="border-t border-[var(--border)]/50 hover:bg-[var(--muted)]/5">
                                  <td className="px-3 py-2 pl-6">{docTypeLabel(e.document_type)}</td>
                                  <td className="px-3 py-2 text-[var(--muted)]">{formatDate(e.entry_date)}</td>
                                  <td className="px-3 py-2 text-center font-mono text-blue-600 dark:text-blue-400">{e.debit_account_code}</td>
                                  <td className="px-3 py-2 text-center font-mono text-emerald-600 dark:text-emerald-400">{e.credit_account_code}</td>
                                  <td className="px-3 py-2 text-right tabular-nums">{formatMoneyInt(e.amount)}</td>
                                </tr>
                              ))}
                              {!journalCollapsed.has(svcName) && rows.length > 1 && (
                                <tr className="border-t border-[var(--border)] bg-[var(--muted)]/5 font-medium">
                                  <td colSpan={4} className="px-3 py-2 pl-6 text-[var(--muted)]">Итого по услуге</td>
                                  <td className="px-3 py-2 text-right tabular-nums">{formatMoneyInt(total)}</td>
                                </tr>
                              )}
                            </React.Fragment>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })()}
          </section>
        )}
      </div>

      <ConfirmDialog
        open={confirm.open}
        title={confirm.action === 'delete' ? 'Удаление' : 'Подтверждение'}
        message={
          confirm.type === 'client' ? 'Сохранить изменения данных клиента?' :
          confirm.action === 'delete' ? 'Удалить запись? Действие необратимо.' :
          'Сохранить изменения?'
        }
        confirmLabel={
          confirm.action === 'delete' ? 'Да, удалить' :
          'Да, сохранить'
        }
        confirmDisabled={confirmSubmitting}
        onConfirm={handleConfirmEdit}
        onCancel={() => !confirmSubmitting && setConfirm({ open: false, type: 'charge', id: 0 })}
      />

      {keepPauseModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-xl">
            <h3 className="mb-1 text-base font-bold text-[var(--foreground)]">Данные о паузе</h3>
            <p className="mb-5 text-sm text-[var(--muted)]">
              У начисления есть заморозка. Сохранить данные о паузе?
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                className="rounded-lg bg-blue-600 px-4 py-3 text-left text-sm font-semibold text-white hover:bg-blue-500 transition-colors"
                onClick={() => { requestChargeUpdate(keepPauseModal.data!); setKeepPauseModal({ open: false, data: null }) }}
              >
                Сохранить паузу
                <span className="block text-xs font-normal opacity-80">Данные о заморозке останутся</span>
              </button>
              <button
                type="button"
                className="rounded-lg border border-[var(--border)] px-4 py-3 text-left text-sm font-medium hover:bg-[var(--muted)]/20 transition-colors"
                onClick={() => { requestChargeUpdate({ ...keepPauseModal.data!, freeze_start: null, freeze_end: null, status: null }); setKeepPauseModal({ open: false, data: null }) }}
              >
                Очистить паузу
                <span className="block text-xs font-normal opacity-60">Заморозка будет сброшена</span>
              </button>
              <button
                type="button"
                className="rounded-lg border border-[var(--border)] px-4 py-3 text-sm font-medium hover:bg-[var(--muted)]/20 transition-colors"
                onClick={() => setKeepPauseModal({ open: false, data: null })}
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {dupSubConfirm.open && (() => {
        const existingCharges = charges.filter(ch =>
          ch.service_name === dupSubConfirm.existingCharge?.service_name &&
          ch.status !== 'cancelled'
        )
        const latestEnd = existingCharges.reduce<string | null>((m, ch) =>
          ch.end_date && (!m || ch.end_date > m) ? ch.end_date : m, null
        )
        const switchStart = latestEnd ? addDays(latestEnd, 1) : null
        const newSvc = services.find(s => s.name === chargeForm.service_name)
        const switchEnd = switchStart ? addDays(switchStart, newSvc?.duration_days ?? 30) : null
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-xl">
              <h3 className="mb-1 text-base font-bold text-[var(--foreground)]">Подписка уже есть</h3>
              <p className="mb-5 text-sm text-[var(--muted)]">
                У клиента уже есть активная подписка «{dupSubConfirm.serviceName}». Как добавить новую?
              </p>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  className="rounded-lg bg-blue-600 px-4 py-3 text-left text-sm font-semibold text-white hover:bg-blue-500 transition-colors"
                  onClick={() => {
                    const start = switchStart ?? dupSubConfirm.originalStart
                    const end = switchEnd ?? dupSubConfirm.originalEnd
                    setDupSubConfirm({ open: false, serviceName: '', existingCharge: null, originalStart: '', originalEnd: '', proceed: null })
                    dupSubConfirm.proceed?.(start, end, 'renewal')
                  }}
                >
                  Переход
                  <span className="block text-xs font-normal opacity-80">
                    {switchStart ? `Начало с ${formatDate(switchStart)}, с учётом окончания текущей` : 'Проверьте дату начала в форме'}
                  </span>
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-[var(--border)] px-4 py-3 text-left text-sm font-medium hover:bg-[var(--muted)]/20 transition-colors"
                  onClick={() => {
                    const { originalStart, originalEnd, proceed } = dupSubConfirm
                    setDupSubConfirm({ open: false, serviceName: '', existingCharge: null, originalStart: '', originalEnd: '', proceed: null })
                    proceed?.(originalStart, originalEnd)
                  }}
                >
                  Добавить отдельно
                  <span className="block text-xs font-normal opacity-60">Параллельная подписка с указанными датами</span>
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-[var(--border)] px-4 py-3 text-sm font-medium hover:bg-[var(--muted)]/20 transition-colors"
                  onClick={() => setDupSubConfirm({ open: false, serviceName: '', existingCharge: null, originalStart: '', originalEnd: '', proceed: null })}
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {cancelDialog.open && cancelDialog.charge && (() => {
        const ch = cancelDialog.charge!
        const totalDays = ch.start_date && ch.end_date
          ? Math.max(1, Math.round((new Date(ch.end_date + 'T12:00:00').getTime() - new Date(ch.start_date + 'T12:00:00').getTime()) / 86400000) + 1)
          : null
        const earnedDays = totalDays && ch.start_date && cancelDialog.date
          ? Math.max(0, Math.min(Math.round((new Date(cancelDialog.date + 'T12:00:00').getTime() - new Date(ch.start_date + 'T12:00:00').getTime()) / 86400000) + 1, totalDays))
          : null
        const earned = (earnedDays !== null && totalDays) ? Math.round(ch.amount * earnedDays / totalDays * 100) / 100 : null
        const unearned = earned !== null ? ch.amount - earned : null
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/50" aria-hidden onClick={cancelDialog.submitting ? undefined : () => setCancelDialog(d => ({ ...d, open: false }))} />
            <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-sm rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-xl">
              <h3 className="text-lg font-semibold text-[var(--foreground)]">Отмена услуги</h3>
              <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                <span className="font-medium">{ch.service_name}</span><br />
                Период: {formatDate(ch.start_date)} — {formatDate(ch.end_date)}
              </p>
              <label className="mt-4 block">
                <span className="mb-1 block text-sm text-[var(--muted)]">Дата отмены</span>
                <input
                  type="date"
                  value={cancelDialog.date}
                  min={ch.start_date || undefined}
                  max={ch.end_date || undefined}
                  onChange={e => setCancelDialog(d => ({ ...d, date: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
                />
              </label>
              {cancelDialog.date && earned !== null && unearned !== null && totalDays && (
                <div className="mt-3 rounded-lg bg-[var(--muted)]/10 p-3 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)]">Оказано ({earnedDays} из {totalDays} дн.)</span>
                    <span>{formatMoney(earned)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)]">Неоказано (к возврату)</span>
                    <span className="text-red-600">{formatMoney(unearned)}</span>
                  </div>
                  <div className="flex justify-between font-medium border-t border-[var(--border)] pt-1">
                    <span>Проводка Дт 98 Кт 62</span>
                    <span>{formatMoney(unearned)}</span>
                  </div>
                </div>
              )}
              <div className="mt-6 flex justify-end gap-3">
                <button type="button" onClick={() => setCancelDialog(d => ({ ...d, open: false }))} disabled={cancelDialog.submitting} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-[var(--border)]/50 disabled:opacity-50">Отмена</button>
                <button type="button" onClick={handleCancelSubmit} disabled={cancelDialog.submitting || !cancelDialog.date} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50">
                  {cancelDialog.submitting ? 'Сохранение…' : 'Подтвердить отмену'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {freezeDialog.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" aria-hidden onClick={() => !confirmSubmitting && setFreezeDialog(f => ({ ...f, open: false }))} />
          <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-sm rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-[var(--foreground)]">
              {freezeDialog.mode === 'pause' ? 'Приостановить' : 'Возобновить'}
            </h3>
            <p className="mt-2 text-sm text-[var(--muted-foreground)]">
              {freezeDialog.mode === 'pause' ? 'Укажите дату начала заморозки.' : 'Укажите дату окончания заморозки. Период услуги будет продлён на число дней заморозки.'}
            </p>
            <label className="mt-4 block">
              <span className="mb-1 block text-sm text-[var(--muted)]">
                {freezeDialog.mode === 'pause' ? 'Дата начала заморозки' : 'Дата окончания заморозки'}
              </span>
              <input
                type="date"
                value={freezeDialog.date}
                onChange={e => setFreezeDialog(f => ({ ...f, date: e.target.value }))}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
              />
            </label>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setFreezeDialog(f => ({ ...f, open: false }))}
                disabled={freezeSubmitting}
                className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-[var(--border)]/50 disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleFreezeSubmit}
                disabled={freezeSubmitting || !freezeDialog.date}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {freezeSubmitting ? 'Сохранение…' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** Понедельник недели для даты */
function getWeekMonday(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  const day = x.getDay()
  const monOffset = day === 0 ? -6 : 1 - day
  x.setDate(x.getDate() + monOffset)
  return x
}

/** Первый понедельник на дату или после неё (аналог SQL first_monday_on_or_after) */
function firstMonAfter(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  const day = x.getDay()
  if (day === 1) return x
  x.setDate(x.getDate() + (day === 0 ? 1 : 8 - day))
  return x
}

function WeeklyPaymentMatrix({ charges, payments, journalEntries }: {
  charges: Charge[]
  payments: Payment[]
  journalEntries: JournalEntry[]
}) {
  const toYMD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const currentMonday = getWeekMonday(today)
  const currentMondayStr = toYMD(currentMonday)
  const scrollRef = React.useRef<HTMLDivElement>(null)

  const activeSvcs = charges.filter(c => c.status !== 'cancelled')

  // svcRec: service → weekKey → amount (from journal_entries weekly_recognition)
  const svcRec = new Map<string, Map<string, number>>()
  journalEntries.filter(e => e.document_type === 'weekly_recognition').forEach(e => {
    if (!svcRec.has(e.service_name)) svcRec.set(e.service_name, new Map())
    const m = svcRec.get(e.service_name)!
    m.set(e.entry_date, (m.get(e.entry_date) ?? 0) + Number(e.amount))
  })

  // svcPaused: service → Set<weekKey> (weeks inside freeze period)
  const svcPaused = new Map<string, Set<string>>()
  activeSvcs.filter(c => c.freeze_start).forEach(c => {
    if (!svcPaused.has(c.service_name)) svcPaused.set(c.service_name, new Set())
    const ps = svcPaused.get(c.service_name)!
    const freezeStartMon = firstMonAfter(new Date(c.freeze_start! + 'T00:00:00'))
    const freezeEndMon = c.freeze_end ? firstMonAfter(new Date(c.freeze_end + 'T00:00:00')) : null
    const cur = new Date(freezeStartMon)
    let guard = 0
    while ((!freezeEndMon || cur < freezeEndMon) && guard < 156) {
      ps.add(toYMD(cur))
      cur.setDate(cur.getDate() + 7)
      guard++
    }
  })

  // svcPlanned: service → weekKey → amount (future weeks not yet recognized, not paused)
  const svcPlanned = new Map<string, Map<string, number>>()
  activeSvcs.forEach(c => {
    const startD = c.start_date ? new Date(c.start_date + 'T00:00:00') : new Date(c.created_at)
    const endD = c.end_date ? new Date(c.end_date + 'T00:00:00') : startD
    const firstMon = firstMonAfter(startD)
    const endMon = getWeekMonday(endD)
    const pausedSet = svcPaused.get(c.service_name) ?? new Set<string>()
    const recMap = svcRec.get(c.service_name) ?? new Map<string, number>()

    // Count total non-freeze weeks for amount_per_week
    let totalWeeks = 0
    const cur = new Date(firstMon)
    while (cur <= endMon) {
      if (!pausedSet.has(toYMD(cur))) totalWeeks++
      cur.setDate(cur.getDate() + 7)
    }
    if (totalWeeks === 0) totalWeeks = 1
    const apw = Number(c.amount) / totalWeeks

    if (!svcPlanned.has(c.service_name)) svcPlanned.set(c.service_name, new Map())
    const pm = svcPlanned.get(c.service_name)!
    const cur2 = new Date(firstMon)
    while (cur2 <= endMon) {
      const wk = toYMD(cur2)
      if (wk > currentMondayStr && !recMap.has(wk) && !pausedSet.has(wk)) {
        pm.set(wk, (pm.get(wk) ?? 0) + apw)
      }
      cur2.setDate(cur2.getDate() + 7)
    }
  })

  // All-time recognized totals per week (for payment distribution)
  const allWeekRecTotal = new Map<string, number>()
  svcRec.forEach(m => m.forEach((amt, wk) => {
    allWeekRecTotal.set(wk, (allWeekRecTotal.get(wk) ?? 0) + amt)
  }))

  // Cumulative payment distribution oldest-first
  const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0)
  let consumed = 0
  const weekStatus = new Map<string, 'paid' | 'partial' | 'unpaid'>()
  const weekPaidAmt = new Map<string, number>()
  Array.from(allWeekRecTotal.keys()).sort().forEach(wk => {
    const total = allWeekRecTotal.get(wk)!
    const paidHere = Math.min(total, Math.max(0, totalPaid - consumed))
    consumed += paidHere
    weekPaidAmt.set(wk, paidHere)
    if (total <= 0) return
    if (paidHere >= total - 0.01) weekStatus.set(wk, 'paid')
    else if (paidHere > 0.01) weekStatus.set(wk, 'partial')
    else weekStatus.set(wk, 'unpaid')
  })

  // Services to display (unique names from active charges)
  const allSvcNames = Array.from(new Set(activeSvcs.map(c => c.service_name)))

  // Build weeks: full range from earliest charge start to latest charge end
  const rangeStart = activeSvcs.reduce((min, c) => {
    const d = c.start_date ? new Date(c.start_date + 'T00:00:00') : new Date(c.created_at)
    return d < min ? d : min
  }, new Date())
  const rangeEnd = activeSvcs.reduce((max, c) => {
    const d = c.end_date ? new Date(c.end_date + 'T00:00:00') : new Date()
    return d > max ? d : max
  }, new Date(0))
  const weeks: string[] = []
  const wCur = new Date(firstMonAfter(rangeStart))
  wCur.setDate(wCur.getDate() - 4 * 7)
  const wEnd = getWeekMonday(rangeEnd)
  wEnd.setDate(wEnd.getDate() + 4 * 7)
  while (wCur <= wEnd) {
    weeks.push(toYMD(wCur))
    wCur.setDate(wCur.getDate() + 7)
  }

  // Auto-scroll to today's column on mount
  const todayIdx = weeks.indexOf(currentMondayStr)
  React.useEffect(() => {
    if (scrollRef.current && todayIdx >= 0) {
      const stickyW = 160
      const colW = 44
      const containerW = scrollRef.current.clientWidth
      scrollRef.current.scrollLeft = Math.max(0, stickyW + todayIdx * colW - (containerW - stickyW) / 2)
    }
  }, [todayIdx])

  const fmtShort = (n: number) => n === 0 ? '—' : String(Math.round(n))
  const dateFmt = (wk: string) => {
    const [, m, d] = wk.split('-').map(Number)
    return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}`
  }

  const BAR_H = 44 // px — высота контейнера бара
  const maxAmt = (() => {
    let m = 0
    allSvcNames.forEach(svc => {
      const recMap = svcRec.get(svc) ?? new Map<string, number>()
      const plannedMap = svcPlanned.get(svc) ?? new Map<string, number>()
      weeks.forEach(wk => { m = Math.max(m, recMap.get(wk) ?? 0, plannedMap.get(wk) ?? 0) })
    })
    return m > 0 ? m : 1
  })()
  const barPct = (amt: number) => Math.max(6, Math.round((amt / maxAmt) * 100))

  if (activeSvcs.length === 0) {
    return <p className="text-sm text-[var(--muted)]">Нет начислений для отображения.</p>
  }

  return (
    <div className="space-y-3">
      {/* Таблица */}
      <div ref={scrollRef} className="overflow-x-auto">
        <table className="text-xs border-collapse" style={{ minWidth: 'max-content' }}>
          <thead>
            <tr>
              <th className="text-left pl-3 pr-4 py-1.5 font-medium text-[var(--muted)] sticky left-0 bg-[var(--background)] z-10 min-w-[130px]">Услуга</th>
              {weeks.map(wk => (
                <th key={wk} className={`text-center px-0.5 py-1.5 font-medium w-11 min-w-[44px] ${wk === currentMondayStr ? 'text-blue-600 dark:text-blue-400' : 'text-[var(--muted)]'}`}>
                  {dateFmt(wk)}
                  {wk === currentMondayStr && <div className="w-full h-0.5 bg-blue-500 rounded mt-0.5" />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allSvcNames.map(svc => {
              const recMap = svcRec.get(svc) ?? new Map<string, number>()
              const plannedMap = svcPlanned.get(svc) ?? new Map<string, number>()
              const pausedSet = svcPaused.get(svc) ?? new Set<string>()
              return (
                <tr key={svc} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="pl-3 pr-4 py-1.5 font-medium text-[var(--foreground)] sticky left-0 bg-[var(--background)] z-10 max-w-[160px] truncate" title={svc}>
                    {svc}
                  </td>
                  {weeks.map(wk => {
                    const recAmt = recMap.get(wk) ?? 0
                    const planAmt = plannedMap.get(wk) ?? 0
                    const isPaused = pausedSet.has(wk) && recAmt === 0 && planAmt === 0
                    const status = weekStatus.get(wk)

                    if (isPaused) return (
                      <td key={wk} className="px-0.5 py-0 align-bottom">
                        <div className="flex items-center justify-center w-9 text-zinc-400 text-xs" style={{ height: BAR_H }} title="Заморозка">⏸</div>
                      </td>
                    )

                    if (recAmt > 0) {
                      const bgCls = status === 'paid'
                        ? 'bg-green-400 dark:bg-green-600'
                        : status === 'partial'
                          ? 'bg-amber-400 dark:bg-amber-500'
                          : 'bg-red-400 dark:bg-red-500'
                      const hint = `Оказано: ${formatMoney(recAmt)}${status === 'partial' ? ` · Оплачено: ${formatMoney(weekPaidAmt.get(wk) ?? 0)}` : ''}`
                      return (
                        <td key={wk} className="px-0.5 py-0 align-bottom">
                          <div className="flex flex-col justify-end" style={{ height: BAR_H }}>
                            <div className={`w-9 rounded-t-sm ${bgCls}`} style={{ height: `${barPct(recAmt)}%` }} title={hint} />
                          </div>
                        </td>
                      )
                    }

                    if (planAmt > 0) return (
                      <td key={wk} className="px-0.5 py-0 align-bottom">
                        <div className="flex flex-col justify-end" style={{ height: BAR_H }}>
                          <div className="w-9 rounded-t-sm bg-sky-200 dark:bg-sky-900/60 border border-dashed border-sky-400 dark:border-sky-600" style={{ height: `${barPct(planAmt)}%` }} title={`Запланировано: ${formatMoney(planAmt)}`} />
                        </div>
                      </td>
                    )

                    return (
                      <td key={wk} className="px-0.5 py-0 align-bottom">
                        <div style={{ height: BAR_H }} />
                      </td>
                    )
                  })}
                </tr>
              )
            })}

            {/* Строка итого */}
            <tr className="border-t-2 border-zinc-300 dark:border-zinc-600">
              <td className="pl-3 pr-4 py-1.5 font-semibold text-[var(--foreground)] sticky left-0 bg-[var(--background)] z-10">Итого, ₽</td>
              {weeks.map(wk => {
                let recTotal = 0
                svcRec.forEach(m => { recTotal += m.get(wk) ?? 0 })
                let planTotal = 0
                svcPlanned.forEach(m => { planTotal += m.get(wk) ?? 0 })
                const status = weekStatus.get(wk)
                const paidAmt = weekPaidAmt.get(wk) ?? 0

                if (recTotal > 0) {
                  const cls = status === 'paid'
                    ? 'text-green-700 dark:text-green-400'
                    : status === 'partial'
                      ? 'text-amber-700 dark:text-amber-400'
                      : 'text-red-700 dark:text-red-400'
                  return (
                    <td key={wk} className={`text-center px-0.5 py-1.5 font-bold ${cls}`} title={`${formatMoney(recTotal)} · оплачено ${formatMoney(paidAmt)}`}>
                      {fmtShort(recTotal)}
                    </td>
                  )
                }
                if (planTotal > 0) return (
                  <td key={wk} className="text-center px-0.5 py-1.5 font-semibold text-sky-500 dark:text-sky-400" title={`Запланировано: ${formatMoney(planTotal)}`}>
                    {fmtShort(planTotal)}
                  </td>
                )
                return <td key={wk} className="text-center px-0.5 py-1.5 text-zinc-300 dark:text-zinc-700">—</td>
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Легенда */}
      <div className="flex flex-wrap gap-3 text-xs text-[var(--muted)]">
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-green-400" />Оплачено</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-red-400" />Не оплачено</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-amber-400" />Частично</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-sky-200 border border-dashed border-sky-400" />Запланировано</span>
        <span className="flex items-center gap-1.5"><span className="text-zinc-400">⏸</span>Заморозка</span>
      </div>
    </div>
  )
}
