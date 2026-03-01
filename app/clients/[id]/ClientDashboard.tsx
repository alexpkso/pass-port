'use client'

import React from 'react'

// ─── Локальные типы (минимальные, только нужные поля) ───────────────────────

type DashCharge = {
  id: number
  service_name: string
  start_date: string | null
  end_date: string | null
  amount: number
  status?: string | null
  freeze_start?: string | null
  freeze_end?: string | null
}

type DashPayment = {
  id: number
  charge_id?: number | null
  amount: number
  payment_date?: string
  created_at: string
  service_name: string
}

type Props = {
  clientName: string
  legalName: string | null
  managerName: string | null
  createdAt: string
  /** Все начисления клиента */
  charges: DashCharge[]
  /** Все платежи клиента, отсортированы по дате DESC (новейшие первыми) */
  payments: DashPayment[]
  onEditClick?: () => void
  editFormSlot?: React.ReactNode
}

// ─── Утилиты ────────────────────────────────────────────────────────────────

const fmt = (d: string | null | undefined) => {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('ru-RU')
}

const fmtMoney = (n: number) =>
  new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(n)) + ' ₽'

function getInitials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map(w => w[0] ?? '')
    .join('')
    .toUpperCase()
}

function getRatingLevel(score: number) {
  if (score < 30) return { label: 'Новый',          icon: '⭐', textCls: 'text-zinc-600 dark:text-zinc-400',   bgCls: 'bg-zinc-100 dark:bg-zinc-800' }
  if (score < 50) return { label: 'Стандарт',       icon: '🥉', textCls: 'text-amber-700 dark:text-amber-400', bgCls: 'bg-amber-50 dark:bg-amber-950/40' }
  if (score < 70) return { label: 'Надёжный',       icon: '🥈', textCls: 'text-slate-600 dark:text-slate-300', bgCls: 'bg-slate-100 dark:bg-slate-700/50' }
  if (score < 85) return { label: 'VIP',             icon: '🥇', textCls: 'text-yellow-700 dark:text-yellow-400', bgCls: 'bg-yellow-50 dark:bg-yellow-950/40' }
  return                  { label: 'Стратегический', icon: '💎', textCls: 'text-blue-600 dark:text-blue-400',   bgCls: 'bg-blue-50 dark:bg-blue-950/40' }
}

function scoreColor(score: number) {
  if (score < 30) return '#71717a'
  if (score < 50) return '#b45309'
  if (score < 70) return '#64748b'
  if (score < 85) return '#ca8a04'
  return '#2563eb'
}

// ─── Вспомогательные компоненты ─────────────────────────────────────────────


function StatCard({ icon, label, value, sub, valueClass }: {
  icon: string; label: string; value: string; sub?: string; valueClass?: string
}) {
  return (
    <div className="flex flex-1 flex-col gap-1 px-4 py-3">
      <p className="text-xl leading-none">{icon}</p>
      <p className="mt-1 text-xs text-[var(--muted)]">{label}</p>
      <p className={`text-base font-semibold leading-tight ${valueClass ?? 'text-[var(--foreground)]'}`}>{value}</p>
      {sub && <p className="text-xs text-[var(--muted)]">{sub}</p>}
    </div>
  )
}

function BlockBar({ label, value, max, colorCls }: {
  label: string; value: number; max: number; colorCls: string
}) {
  const pct = Math.min(100, max > 0 ? (value / max) * 100 : 0)
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-[var(--muted)]">{label}</span>
        <span className="font-medium tabular-nums text-[var(--foreground)]">{Math.round(value)}/{max}</span>
      </div>
      <div className="h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-700">
        <div className={`h-1.5 rounded-full transition-all ${colorCls}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// ─── Главный компонент ───────────────────────────────────────────────────────

export default function ClientDashboard({ clientName, legalName, managerName, createdAt, charges, payments, onEditClick, editFormSlot }: Props) {
  const [ratingHint, setRatingHint] = React.useState(false)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr = today.toISOString().slice(0, 10)

  // ── LTV (сумма всех оплат) ──────────────────────────────────────────────
  const ltv = payments.reduce((s, p) => s + Number(p.amount), 0)

  // ── Активные начисления ─────────────────────────────────────────────────
  const activeCharges = charges.filter(c => {
    if (c.status === 'cancelled') return false
    if (c.status === 'paused') return false
    return !c.end_date || c.end_date >= todayStr
  })

  // ── MRR — ежемесячный доход от активных услуг ───────────────────────────
  const mrr = activeCharges.reduce((sum, c) => {
    const start = c.start_date ? new Date(c.start_date) : today
    const end   = c.end_date   ? new Date(c.end_date)   : today
    const days  = Math.max(1, (end.getTime() - start.getTime()) / 86_400_000)
    return sum + Number(c.amount) / Math.max(1, days / 30)
  }, 0)

  // ── Срок работы ─────────────────────────────────────────────────────────
  const tenureMs     = today.getTime() - new Date(createdAt).getTime()
  const tenureMonths = tenureMs / (86_400_000 * 30)
  const tenureLabel  =
    tenureMonths < 1  ? 'менее месяца' :
    tenureMonths < 12 ? `${Math.round(tenureMonths)} мес.` :
                        `${(tenureMonths / 12).toFixed(1).replace(/\.0$/, '')} лет`

  // ── Текущий долг ────────────────────────────────────────────────────────
  const totalCharged  = charges
    .filter(c => c.status !== 'cancelled')
    .reduce((s, c) => s + Number(c.amount), 0)
  const currentDebt = Math.max(0, totalCharged - ltv)

  // ── Просрочки: ожидаемая дата = start_date связанного начисления ─────────
  // payments[0] — самый новый (desc sort), поэтому paymentOverdueDays[i] ↔ payments[i]
  const paymentOverdueDays: number[] = payments.map(p => {
    const payDate = p.payment_date ?? p.created_at.slice(0, 10)
    if (!p.charge_id) return 0
    const charge = charges.find(c => c.id === p.charge_id)
    if (!charge?.start_date) return 0
    const diff = Math.floor(
      (new Date(payDate).getTime() - new Date(charge.start_date).getTime()) / 86_400_000
    )
    return Math.max(0, diff)
  })

  const avgOverdueDays =
    paymentOverdueDays.length > 0
      ? paymentOverdueDays.reduce((s, d) => s + d, 0) / paymentOverdueDays.length
      : 0

  // ── Рейтинг: Блок 1 — Финансовая ценность (макс 35) ────────────────────
  const ltvMonths   = mrr > 0 ? ltv / mrr : 0
  const ltvScore    = Math.min(25, (ltvMonths / 12) * 25)
  const volumeBonus = mrr >= 40_000 ? 10 : mrr >= 25_000 ? 5 : 0
  const block1      = Math.min(35, ltvScore + volumeBonus)

  // ── Блок 2 — Надёжность платежей (макс 30) ──────────────────────────────
  const onTimeCount      = paymentOverdueDays.filter(d => d === 0).length
  const punctualityScore = payments.length > 0 ? (onTimeCount / payments.length) * 20 : 0
  const latePenalty      = Math.min(10, avgOverdueDays * 1.5)
  const debtPenalty      = Math.min(10, mrr > 0 ? (currentDebt / mrr) * 30 : 0)
  const block2           = Math.max(0, punctualityScore - latePenalty - debtPenalty)

  // ── Блок 3 — Стабильность (макс 35) ─────────────────────────────────────
  const tenureScore  = Math.min(20, (tenureMonths / 36) * 20)
  const completedN   = charges.filter(c => c.end_date && c.end_date < todayStr && c.status !== 'cancelled').length
  const renewalBonus = Math.min(10, completedN * 3)
  // последние 8 платежей (уже desc → первые 8 = самые свежие)
  const last8Overdues    = paymentOverdueDays.slice(0, 8)
  const consistencyBonus = last8Overdues.length >= 8 && last8Overdues.every(d => d === 0) ? 5 : 0
  const hasPause         = charges.some(c => c.freeze_start || c.status === 'paused')
  const pausePenalty     = hasPause ? 5 : 0
  const block3           = Math.max(0, tenureScore + renewalBonus + consistencyBonus - pausePenalty)

  // ── Итоговый балл ────────────────────────────────────────────────────────
  const score = Math.min(100, Math.round(block1 + block2 + block3))
  const level = getRatingLevel(score)
  const col   = scoreColor(score)

  // Круговой SVG прогресс
  const R  = 42
  const C  = 2 * Math.PI * R
  const filled = C * (score / 100)

  // Последние 6 платежей
  const last6 = payments.slice(0, 6)

  // Сортировка начислений: активные первыми, потом по дате начала desc
  const chargesSorted = [...charges].sort((a, b) => {
    const aActive = a.status !== 'cancelled' && (!a.end_date || a.end_date >= todayStr) ? 0 : 1
    const bActive = b.status !== 'cancelled' && (!b.end_date || b.end_date >= todayStr) ? 0 : 1
    if (aActive !== bActive) return aActive - bActive
    return (b.start_date ?? '').localeCompare(a.start_date ?? '')
  })

  return (
    <div className="space-y-4 mb-4">

      {/* ── 1. Шапка ─────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-5 relative">
          {/* Аватар */}
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-xl font-bold select-none">
            {getInitials(clientName)}
          </div>
          {/* Текст */}
          <div className="flex-1 min-w-0 pr-16">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xl font-semibold text-[var(--foreground)] truncate">{clientName}</span>
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${level.bgCls} ${level.textCls}`}>
                {level.icon} {level.label}
              </span>
            </div>
            {legalName && <p className="mt-0.5 text-sm text-[var(--muted)] truncate">{legalName}</p>}
            <div className="mt-1.5 flex flex-wrap gap-4 text-sm text-[var(--muted)]">
              {managerName && <span>👤 {managerName}</span>}
              <span>📅 С {fmt(createdAt)}</span>
              <span>🕐 {tenureLabel}</span>
            </div>
          </div>
          {onEditClick && (
            <button
              onClick={onEditClick}
              className="absolute top-0 right-0 text-xs font-medium text-blue-500 hover:text-blue-400 transition-colors"
            >
              изменить
            </button>
          )}
        </div>
      </div>

      {/* Форма редактирования — прямо под шапкой */}
      {editFormSlot}

      {/* ── 2 + 3. Рейтинг + Стат-карточки ──────────────────────────────── */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">

        {/* Рейтинг */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm lg:w-72 shrink-0">
          <p className="mb-4 text-sm font-medium text-[var(--muted)]">Рейтинг клиента</p>
          <div className="flex items-center gap-5">
            {/* Круговой прогресс */}
            <svg width="96" height="96" viewBox="0 0 100 100" className="shrink-0" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="50" cy="50" r={R} fill="none" stroke="currentColor" strokeWidth="10"
                className="text-zinc-200 dark:text-zinc-700" />
              <circle cx="50" cy="50" r={R} fill="none" stroke={col} strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={`${filled} ${C - filled}`} />
              <text
                x="50" y="50" textAnchor="middle" dominantBaseline="central"
                fill={col} fontSize="22" fontWeight="bold"
                style={{ transform: 'rotate(90deg)', transformOrigin: '50px 50px' }}
              >
                {score}
              </text>
            </svg>
            {/* Блоки */}
            <div className="flex-1 space-y-3 min-w-0">
              <BlockBar label="Финансы"     value={block1} max={35} colorCls="bg-blue-500" />
              <BlockBar label="Надёжность"  value={block2} max={30} colorCls="bg-emerald-500" />
              <BlockBar label="Стабильность" value={block3} max={35} colorCls="bg-purple-500" />
            </div>
          </div>
          <button
            onClick={() => setRatingHint(v => !v)}
            className="mt-4 text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition-colors flex items-center gap-1"
          >
            <span>{ratingHint ? '▲' : '▼'}</span>
            <span>Как считается рейтинг</span>
          </button>
          {ratingHint && (
            <p className="mt-2 text-xs text-[var(--muted)] leading-relaxed">
              Финансы: LTV + объём MRR.<br />
              Надёжность: своевременность платежей, долг.<br />
              Стабильность: срок, продления, паузы.
            </p>
          )}
        </div>

        {/* Метрики — единый блок */}
        <div className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm overflow-hidden">
          <div className="flex divide-x divide-[var(--border)]">
            <StatCard icon="💰" label="LTV" value={fmtMoney(ltv)} sub="сумма всех оплат" />
            <StatCard icon="📅" label="MRR" value={fmtMoney(mrr)} sub="активные услуги/мес" />
            <StatCard icon="🕐" label="Срок работы" value={tenureLabel} />
            <StatCard
              icon="⚡"
              label="Средняя просрочка"
              value={avgOverdueDays < 1 ? '0 дн.' : `${Math.round(avgOverdueDays)} дн.`}
              valueClass={
                avgOverdueDays >= 14 ? 'text-red-600 dark:text-red-400' :
                avgOverdueDays >= 5  ? 'text-amber-600 dark:text-amber-400' :
                'text-emerald-600 dark:text-emerald-400'
              }
            />
            <StatCard
              icon="🧾"
              label="Задолженность"
              value={currentDebt < 1 ? 'Нет ✓' : fmtMoney(currentDebt)}
              valueClass={currentDebt > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}
            />
          </div>
        </div>
      </div>

      {/* ── 4 + 5. Услуги + История платежей ─────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

        {/* Список услуг */}
        {(() => {
          const activeOnly = chargesSorted.filter(c =>
            c.status !== 'cancelled' &&
            c.status !== 'paused' &&
            (!c.start_date || c.start_date <= todayStr) &&
            (!c.end_date || c.end_date >= todayStr)
          )
          return (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
          <p className="mb-3 text-sm font-medium text-[var(--muted)]">Активные услуги</p>
          {activeOnly.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">Нет активных услуг</p>
          ) : (
            <div className="space-y-1.5">
              {activeOnly.map(c => {
                const isActive = true
                return (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-3 rounded-lg bg-[var(--muted)]/5 px-3 py-2.5 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-[var(--foreground)]">{c.service_name}</p>
                      <p className="text-xs text-[var(--muted)]">{fmt(c.start_date)} – {fmt(c.end_date)}</p>
                    </div>
                    <span className="tabular-nums text-[var(--foreground)]">{fmtMoney(Number(c.amount))}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
          )
        })()}

        {/* История платежей */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
          <p className="mb-3 text-sm font-medium text-[var(--muted)]">Последние платежи</p>
          {last6.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">Нет платежей</p>
          ) : (
            <div className="space-y-1.5">
              {last6.map((p, i) => {
                const overdue  = paymentOverdueDays[i] ?? 0
                const payDate  = p.payment_date ?? p.created_at.slice(0, 10)
                return (
                  <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg bg-[var(--muted)]/5 px-3 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-[var(--foreground)]">{fmt(payDate)}</span>
                      <span className="ml-2 text-xs text-[var(--muted)] truncate">{p.service_name}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="tabular-nums text-[var(--foreground)]">{fmtMoney(Number(p.amount))}</span>
                      {overdue === 0
                        ? <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Вовремя ✓</span>
                        : <span className="text-xs font-medium text-amber-600 dark:text-amber-400">+{overdue} дн. ⚠️</span>
                      }
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
