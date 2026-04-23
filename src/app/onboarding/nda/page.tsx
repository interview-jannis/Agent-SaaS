import ContractStep from '@/components/ContractStep'

export default function NdaPage() {
  return (
    <ContractStep
      type="nda"
      step={{ current: 2, total: 3, label: 'Non-Disclosure Agreement' }}
      nextHref="/onboarding/partnership"
      nextLabel="Sign & Continue →"
      collectIdentity
    />
  )
}
