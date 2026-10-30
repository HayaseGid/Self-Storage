namespace SelfStorageAPI.Models;

public class ContractSignature
{
    public int ContractID { get; set; }
    public int UserID { get; set; }
    public string SignerName { get; set; } = null!;
    public string SignatureImage { get; set; } = null!;
    public string TermsVersion { get; set; } = null!;
    public DateTimeOffset SignedAt { get; set; }

    public Contract Contract { get; set; } = null!;
    public User User { get; set; } = null!;
}
