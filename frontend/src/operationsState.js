import { syncPoliciesFromBackend } from './policies'

export function mapOperationsState(data) {
  if (data?.policies) {
    syncPoliciesFromBackend(data.policies)
  }

  const facilities = (data.facilities || []).map(facility => ({
    ...facility,
    id: facility.name,
    depositMonths: Number(facility.depositMonths ?? facility.depositPercent ?? 2),
    depositPercent: Number(facility.depositMonths ?? facility.depositPercent ?? 2),
    status: String(facility.status || '').toLowerCase()
  }))
  const facilityNames = new Map(facilities.map(facility => [facility.facilityId, facility.name]))
  const reservations = (data.reservations || []).map(reservation => {
    const status = {
      PENDING_PAYMENT: 'PENDING_PAYMENT',
      PENDING_APPROVAL: 'PENDING_APPROVAL',
      CONFIRMED: 'CONFIRMED',
      HANDED_OVER: 'HANDED_OVER',
      COMPLETED: 'COMPLETED',
      CANCELLED: 'CANCELLED',
      EXPIRED: 'EXPIRED'
    }[reservation.status] || reservation.status
    const startDate = String(reservation.startDate || '').slice(0, 10)
    const endDate = String(reservation.endDate || '').slice(0, 10)
    return {
      ...reservation,
      facilityId: facilityNames.get(reservation.facilityId) || reservation.facilityId,
      assignedUnitId: reservation.assignedUnitId || reservation.unitId || null,
      unitNumbers: Array.isArray(reservation.unitNumbers) && reservation.unitNumbers.length
        ? reservation.unitNumbers
        : reservation.assignedUnitId || reservation.unitId
          ? [reservation.assignedUnitId || reservation.unitId]
          : [],
      startDate,
      endDate,
      appointmentDate: String(reservation.appointmentDate || startDate).slice(0, 10),
      paymentStatus: reservation.paymentStatus === 'PAID' ? 'PAID' : 'PENDING',
      status,
      source: 'live'
    }
  })
  const reservationsById = new Map(reservations.map(reservation => [reservation.id, reservation]))

  return {
    facilities,
    units: (data.units || []).map(unit => ({
      ...unit,
      facilityId: facilityNames.get(unit.facilityDbId) || unit.facilityId,
      size: unit.size,
      status: unit.status
    })),
    reservations,
    contracts: (data.contracts || []).map(contract => ({
      ...contract,
      customerName: contract.customerName || reservationsById.get(contract.reservationId)?.customerName || '—',
      facilityId: contract.facilityId || reservationsById.get(contract.reservationId)?.facilityId || '',
      unitNumbers: Array.isArray(contract.unitNumbers) && contract.unitNumbers.length
        ? contract.unitNumbers
        : contract.unitId
          ? String(contract.unitId).split(',').map(s => s.trim()).filter(Boolean)
          : [],
      handedOverBy: ''
    })),
    payments: data.payments || [],
    staff: data.staff || [],
    managers: data.managers || [],
    staffUsers: data.staffUsers || [],
    unitTypes: data.unitTypes || [],
    unitSizes: data.unitSizes || [],
    rentalRates: data.rentalRates || [],
    policies: data.policies || null,
    activity: data.activity || []
  }
}
