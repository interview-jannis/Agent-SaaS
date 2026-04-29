import QuoteDocument from '@/components/QuoteDocument'

export const dynamic = 'force-dynamic'

export default async function InvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ preview?: string }>
}) {
  const { slug } = await params
  const { preview } = await searchParams
  return <QuoteDocument slug={slug} mode="invoice" preview={!!preview} />
}
