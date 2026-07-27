'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])
  if (!mounted) return null

  const isDark = theme === 'dark'

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="rounded border border-gray-300 px-3 py-1 text-sm dark:border-gray-600"
      aria-label="다크모드 전환"
    >
      {isDark ? '☀️ 라이트 모드' : '🌙 다크 모드'}
    </button>
  )
}
