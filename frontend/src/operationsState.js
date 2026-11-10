import { DEPOSIT_MONTHS } from './storageRules'

const cleanDate = value => (value ? String(value).slice(0, 10) : '')

export function mapOperationsState(raw = {}) {
  return {
    facilities: (raw.facilities || []).map(f => ({
      id: f.id || f.name,
      facilityId: f.facilityId,
      name: f.name || f.id,
      unitCodePrefix: f.unitCodePrefix || '',
      address: f.address || '',
      streetAddress: f.streetAddress || '',
      ward: f.ward || '',
      district: f.district || '',
      city: f.city || '',
      contactPhone: f.contactPhone || '',
      openingHours: f.openingHours || '',
      description: f.description || '',
      status: String(f.status || 'Active').toLowerCase(),
      managerEmail: f.managerEmail || '',
      createdAt: f.createdAt || null,
      depositPercent: Number(f.depositPercent ?? 50),
      depositMonths: Number(f.depositMonths ?? DEPOSIT_MONTHS),
      holdMinutes: Number(f.holdMinutes ?? 15),
      lateFeePerDay: Number(f.lateFeePerDay ?? 50000),
      gracePeriodDays: Number(f.gracePeriodDays ?? 3),
      renewalNoticeDays: Number(f.renewalNoticeDays ?? 30)
    })),
    units: (raw.units || []).map(mapUnit),
    reservations: (raw.reservations || []).map(mapReservation),
    contracts: (raw.contracts || []).map(mapContract),
    payments: (raw.payments || []).map(p => ({
      txn: p.txn,
      resId: p.resId,
      amount: Number(p.amount || 0),
      paymentType: p.paymentType || 'Deposit',
      status: p.status || 'Pending',
      date: cleanDate(p.date),
      facility: p.facility || '',
      customerName: p.customerName || '',
      customerEmail: p.customerEmail || ''
    })),
    staff: (raw.staff || []).map(s => ({
      id: s.id,
      staffId: s.staffId,
      fullName: s.fullName || '',
      email: s.email || '',
      facilityId: s.facilityId || '',
      status: s.status || 'Active'
    })),
    unitTypes: (raw.unitTypes || []).map(t => ({
      id: t.id ?? t.unitTypeId,
      unitTypeId: t.unitTypeId ?? t.id,
      name: t.name ?? t.typeName,
      typeName: t.typeName ?? t.name,
      description: t.description || '',
      isActive: t.isActive ?? true,
      unitCount: Number(t.unitCount ?? t.storageUnitCount ?? 0),
      reservationCount: Number(t.reservationCount ?? 0),
      rateCount: Number(t.rateCount ?? 0)
    })),
    unitSizes: (raw.unitSizes || []).map(s => ({
      id: s.id ?? s.unitSizeId,
      unitSizeId: s.unitSizeId ?? s.id,
      sizeCategoryId: s.sizeCategoryId,
      categoryCode: s.categoryCode || '',
      sizeCode: s.sizeCode || '',
      displayName: s.displayName || '',
      dimensions: s.dimensions,
      volume: Number(s.volume ?? s.areaM2 ?? 0),
      areaM2: Number(s.areaM2 ?? s.volume ?? 0),
      widthM: Number(s.widthM ?? 0),
      lengthM: Number(s.lengthM ?? 0),
      heightM: Number(s.heightM ?? 2.5),
      isActive: s.isActive ?? true,
      unitCount: Number(s.unitCount ?? s.storageUnitCount ?? 0),
      reservationCount: Number(s.reservationCount ?? 0),
      rateCount: Number(s.rateCount ?? 0)
    })),
    rentalRates: (raw.rentalRates || []).map(r => ({
      facilityId: r.facilityId,
      unitTypeId: r.unitTypeId,
      unitType: r.unitType,
      unitSizeId: r.unitSizeId,
      size: r.size,
      price: Number(r.price || 0)
    })),
    priceBands: raw.priceBands || [],
    managers: raw.managers || [],
    staffUsers: raw.staffUsers || [],
    policies: raw.policies || null,
    activity: raw.activity || []
  }
}

/* Từng dòng kho / đặt chỗ / hợp đồng: dùng chung cho /api/operations/state và các API danh sách có phân trang */
export const mapUnit = u => ({
    id: u.id,
    unitId: u.unitId,
    facilityId: u.facilityId,
    facilityDbId: u.facilityDbId,
    type: u.type,
    unitTypeId: u.unitTypeId,
    size: u.size,
    sizeId: u.sizeId,
    sizeM2: Number(u.sizeM2 || 0),
    areaM2: Number(u.areaM2 || u.sizeM2 || 0),
    volumeM3: Number(u.volumeM3 || u.sizeM2 || 0),
    pricePerMonth: Number(u.pricePerMonth || 0),
    floor: u.floor || '',
    zone: u.zone || '',
    locationNote: u.locationNote || '',
    status: u.status || 'AVAILABLE',
    createdAt: u.createdAt || null
  })

export const mapReservation = r => ({
    id: r.id,
    reservationCode: r.reservationCode,
    customerName: r.customerName || 'Khách hàng',
    customerEmail: r.customerEmail || '',
    customerPhone: r.customerPhone || '—',
    facilityId: r.facilityId,
    facilityDbId: r.facilityDbId,
    unitId: r.unitId || null,
    assignedUnitId: r.assignedUnitId || r.unitId || null,
    unitNumbers: Array.isArray(r.unitNumbers) ? r.unitNumbers : (r.unitId ? [r.unitId] : []),
    unitCount: Number(r.unitCount || (Array.isArray(r.unitNumbers) ? r.unitNumbers.length : (r.unitId ? 1 : 0))),
    unitType: r.unitType || '',
    unitTypeId: r.unitTypeId,
    startDate: cleanDate(r.startDate),
    endDate: cleanDate(r.endDate),
    months: Number(r.months || 1),
    depositMonths: Number(r.depositMonths || DEPOSIT_MONTHS),
    appointmentDate: cleanDate(r.appointmentDate || r.startDate),
    appointmentTime: r.appointmentTime || 'Cả ngày', // khung "08:00–10:00" hoặc "Bàn giao online"
    handoverMethod: r.handoverMethod || 'InPerson',
    deposit: Number(r.deposit || 0),
    rentalFee: Number(r.rentalFee || 0),
    // Tiền thuê phải đóng lúc nhận kho (backend: RentPaymentRules)
    paymentPlan: r.paymentPlan || 'Monthly',
    startRentAmount: Number(r.startRentAmount || 0),
    startRentUnpaid: Number(r.startRentUnpaid || 0),
    startRentPaid: Boolean(r.startRentPaid),
    rentOverdue: Number(r.rentOverdue || 0),
    paymentStatus: r.paymentStatus || 'PENDING',
    paymentTxn: r.paymentTxn || null,
    status: r.status || 'PENDING_PAYMENT',
    depositExpiresAt: r.depositExpiresAt || null,
    contractId: r.contractId || null,
    contractStatus: r.contractStatus || (r.isSigned ? 'Signed' : 'Pending Signature'),
    isSigned: Boolean(r.isSigned),
    signedAt: r.signedAt || null,
    createdAt: r.createdAt || null,
    source: r.source || 'live'
  })

export const mapContract = c => ({
    id: c.id,
    contractNumber: c.contractNumber || `HD-${c.id}`,
    reservationId: c.reservationId,
    customerName: c.customerName || 'Khách hàng',
    facilityId: c.facilityId,
    facilityDbId: c.facilityDbId,
    unitId: c.unitId,
    unitNumbers: Array.isArray(c.unitNumbers) ? c.unitNumbers : (c.unitId ? [c.unitId] : []),
    startDate: cleanDate(c.startDate),
    endDate: cleanDate(c.endDate),
    deposit: Number(c.deposit || 0),
    totalFee: Number(c.totalFee || 0),
    status: c.status || 'Active',
    isSigned: Boolean(c.isSigned),
    signedAt: c.signedAt || null,
    signerName: c.signerName || null,
    accessType: c.accessType || 'Smart Lock',
    accessValue: c.accessValue || '—',
    reservationCode: c.reservationCode || '',
    customerEmail: c.customerEmail || '',
    reservationStatus: c.reservationStatus || '',
    createdAt: c.createdAt || null
  })
