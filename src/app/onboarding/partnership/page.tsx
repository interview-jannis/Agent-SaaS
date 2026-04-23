import ContractStep from '@/components/ContractStep'

export default function PartnershipPage() {
  return (
    <ContractStep
      type="partnership"
      step={{ current: 3, total: 3, label: 'Partnership Agreement' }}
      nextHref="/onboarding/waiting"
      nextLabel="Sign & Submit"
      isFinal
    />
  )
}
