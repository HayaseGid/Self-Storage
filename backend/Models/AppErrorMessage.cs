namespace SelfStorageAPI.Models;

public class AppErrorMessage
{
    public string ErrorKey { get; set; } = null!;
    public short HttpStatus { get; set; } = 400;
    public string MessageVi { get; set; } = null!;
}

