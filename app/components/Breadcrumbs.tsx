'use client'

import Link from 'next/link'

export type Crumb = { href: string; label: string }

type Props = { items: Crumb[] }

export default function Breadcrumbs({ items }: Props) {
  if (items.length === 0) return null
  return (
    <nav aria-label="Хлебные крошки" className="text-sm">
      <ol className="flex flex-wrap items-center gap-1.5 text-[var(--muted)]">
        {items.map((item, i) => (
          <li key={item.href} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden="true">/</span>}
            {i === items.length - 1 ? (
              <span className="text-[var(--foreground)] font-medium">{item.label}</span>
            ) : (
              <Link href={item.href} className="hover:text-[var(--foreground)] transition-colors">
                {item.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}
