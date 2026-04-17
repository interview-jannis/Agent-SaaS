import { createServerClient } from '@/lib/supabase-server'
import ProductForm from '@/components/admin/ProductForm'

export const dynamic = 'force-dynamic'

export default async function NewProductPage() {
  const supabase = createServerClient()
  const { data: categories } = await supabase
    .from('product_categories')
    .select('id, name')
    .order('name')

  return <ProductForm categories={categories ?? []} />
}
