import QuoteDocument from '@/components/QuoteDocument'

export const dynamic = 'force-dynamic'

export default async function QuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ preview?: string; member?: string }>
}) {
  const { slug } = await params
  const { preview, member } = await searchParams
  return <QuoteDocument slug={slug} mode="quotation" preview={!!preview} filterMemberId={member} />
}
