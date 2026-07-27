'use client'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md space-y-4 p-8 text-center">
      <h2 className="text-lg font-semibold">문제가 발생했습니다</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        데이터를 불러오는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.
      </p>
      <button onClick={() => reset()} className="rounded bg-blue-600 px-4 py-2 text-sm text-white">
        다시 시도
      </button>
    </div>
  )
}
