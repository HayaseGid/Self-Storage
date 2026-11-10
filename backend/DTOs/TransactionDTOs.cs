using System.ComponentModel.DataAnnotations;

namespace SelfStorageAPI.DTOs
{
    public class ReservationUnitItemDTO
    {
        public int UnitID { get; set; }
        public string UnitNumber { get; set; } = string.Empty;
    }

    public class CreateReservationDTO
    {
        public int UnitID { get; set; }
        public string UnitNumber { get; set; } = string.Empty;
        public List<ReservationUnitItemDTO>? Units { get; set; }
        [Required]
        public DateTime StartDate { get; set; }
        [Required]
        public int Months { get; set; }
        /// <summary>Hình thức trả tiền thuê: "Monthly" hoặc "Upfront" (bắt buộc).</summary>
        public string? PaymentPlan { get; set; }
        /// <summary>Cách nhận kho: "InPerson" (mặc định) hoặc "Online".</summary>
        public string? HandoverMethod { get; set; }
        /// <summary>Khung giờ nhận kho khi nhận trực tiếp: "08:00" | "10:00" | "12:00" | "14:00" (khung 2 tiếng).</summary>
        public string? AppointmentSlot { get; set; }
    }

    public class CreatePaymentDTO
    {
        [Required]
        public int ReservationID { get; set; }
        [Required]
        public decimal Amount { get; set; }
        [Required]
        public string PaymentType { get; set; } = string.Empty;
    }

    public class CompleteHandoverDTO
    {
        [Required]
        public int ReservationID { get; set; }
        [Required]
        public string AccessType { get; set; } = string.Empty;
        [Required]
        public string AccessValue { get; set; } = string.Empty;
        public string Notes { get; set; } = string.Empty;
    }
}
