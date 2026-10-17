using System.ComponentModel.DataAnnotations;

namespace SelfStorageAPI.DTOs
{
    public class CreateReservationDTO
    {
        [Range(1, int.MaxValue)]
        public int UnitID { get; set; }
        [Required]
        public string UnitNumber { get; set; } = string.Empty;
        [Required]
        public DateTime StartDate { get; set; }
        [Required]
        public int Months { get; set; }
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
