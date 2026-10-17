namespace SelfStorageAPI.DTOs;

public class AuthResult
{
    public bool IsSuccess { get; set; }
    public string? ErrorMessage { get; set; }
    public AuthResponseDTO? User { get; set; }
}
