export function mapOperationsState(data) {
  const facilities = (data.facilities || []).map(facility => ({
    ...facility,
    id: facility.name,
    status: String(facility.status || '').toLowerCase()
  }))
  const facilityNames = new Map(facilities.map(facility => [facility.facilityId, facility.name]))
  const reservations = (data.reservations || []).map(reservation => {
    const status = {
      PENDING_PAYMENT: 'PENDING_PAYMENT',
      PENDING_APPROVAL: 'PENDING_APPROVAL',
      CONFIRMED: 'CONFIRMED',
      HANDED_OVER: 'HANDED_OVER',
      CANCELLED: 'CANCELLED',
      EXPIRED: 'EXPIRED'
    }[reservation.status] || reservation.status
    const startDate = String(reservation.startDate || '').slice(0, 10)
    const endDate = String(reservation.endDate || '').slice(0, 10)
    return {
      ...reservation,
      facilityId: facilityNames.get(reservation.facilityId) || reservation.facilityId,
      assignedUnitId: reservation.assignedUnitId || null,
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
      customerName: reservationsById.get(contract.reservationId)?.customerName || '—',
      facilityId: reservationsById.get(contract.reservationId)?.facilityId || '',
      handedOverBy: ''
    })),
    payments: data.payments || [],
    staff: data.staff || [],
    managers: data.managers || [],
    staffUsers: data.staffUsers || [],
    unitTypes: data.unitTypes || [],
    unitSizes: data.unitSizes || [],
    rentalRates: data.rentalRates || [],
    activity: data.activity || []
  }
}
