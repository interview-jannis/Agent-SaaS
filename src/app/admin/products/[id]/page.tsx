import { createServerClient } from '@/lib/supabase-server'
import ProductForm, { FormState, ImageItem, VariantItem } from '@/components/admin/ProductForm'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServerClient()

  const [{ data: product }, { data: categories }, { data: images }, { data: variants }] = await Promise.all([
    supabase.from('products').select('*').eq('id', id).single(),
    supabase.from('product_categories').select('id, name').order('sort_order').order('name'),
    supabase.from('product_images').select('*').eq('product_id', id).order('order'),
    supabase.from('product_variants').select('*').eq('product_id', id).order('sort_order'),
  ])

  if (!product) notFound()

  const initialForm: FormState = {
    name: product.name,
    category_id: product.category_id ?? '',
    subcategory_id: product.subcategory_id ?? '',
    description: product.description ?? '',
    base_price: String(product.base_price),
    price_currency: (product.price_currency as FormState['price_currency']) ?? 'KRW',
    duration_value: product.duration_value ? String(product.duration_value) : '',
    duration_unit: (product.duration_unit as FormState['duration_unit']) ?? 'hours',
    partner_name: product.partner_name ?? '',
    location_address: product.location_address ?? '',
    contact_channels: product.contact_channels ?? [],
    has_prayer_room: product.has_prayer_room ?? false,
    dietary_type: (product.dietary_type as FormState['dietary_type']) ?? 'none',
    has_female_doctor: product.has_female_doctor ?? false,
    is_active: product.is_active ?? true,
  }

  const initialImages: ImageItem[] = (images ?? []).map((img) => ({
    id: img.id,
    url: img.image_url,
    is_primary: img.is_primary,
    order: img.order,
  }))

  const initialVariants: VariantItem[] = (variants ?? []).map((v) => ({
    id: v.id,
    variant_label: v.variant_label ?? '',
    base_price: String(v.base_price ?? ''),
    price_currency: (v.price_currency as 'KRW' | 'USD') ?? 'KRW',
    is_active: v.is_active ?? true,
  }))

  return (
    <ProductForm
      productId={product.id}
      productNumber={product.product_number}
      categories={categories ?? []}
      initial={{ form: initialForm, images: initialImages, variants: initialVariants }}
    />
  )
}
