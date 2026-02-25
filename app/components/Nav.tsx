'use client'

import Link from 'next/link'
import { useState } from 'react'

const links = [
  { href: '/', label: 'Главная' },
  { href: '/clients', label: 'Клиенты' },
  { href: '/employees', label: 'Сотрудники' },
  { href: '/services', label: 'Услуги' },
  { href: '/reports', label: 'Отчёты' },
  { href: '/about', label: 'О сервисе' },
]

export default function Nav() {
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--card)]/95 backdrop-blur supports-[backdrop-filter]:bg-[var(--card)]/80">
      <div className="mx-auto flex max-w-[84rem] items-center justify-between px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="text-sm font-medium uppercase tracking-widest text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
        >
          Pass-Port
        </Link>

        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--foreground)] hover:bg-[var(--border)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
            aria-label="Меню"
            aria-expanded={open}
          >
            {open ? (
              <span className="text-xl leading-none">×</span>
            ) : (
              <span className="flex flex-col gap-1">
                <span className="block h-0.5 w-5 bg-current" />
                <span className="block h-0.5 w-5 bg-current" />
                <span className="block h-0.5 w-5 bg-current" />
              </span>
            )}
          </button>

          {open && (
            <>
              <div className="fixed inset-0 z-10" aria-hidden="true" onClick={() => setOpen(false)} />
              <nav
                className="absolute right-0 top-full mt-1 w-48 rounded-lg border border-[var(--border)] bg-[var(--card)] py-2 shadow-lg z-20"
                role="navigation"
              >
                {links.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="block px-4 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--border)]/50"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
