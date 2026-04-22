import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export default async function SchedulePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = createServerClient()

  const { data: schedule } = await supabase
    .from('schedules')
    .select('pdf_url')
    .eq('slug', slug)
    .single()

  if (!schedule) notFound()

  if (!schedule.pdf_url) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="max-w-sm text-center">
          <p className="text-sm text-gray-500">The schedule document is not yet available.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen w-screen">
      <iframe src={schedule.pdf_url} className="w-full h-full border-0" title="Travel Schedule" />
    </div>
  )
}
