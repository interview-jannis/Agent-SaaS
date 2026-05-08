import { redirect } from 'next/navigation'

export default function HomeReviewRedirect() {
  redirect('/agent/product/review')
}
