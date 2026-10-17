using SelfStorageAPI.DTOs;
using SelfStorageAPI.Interfaces;
using SelfStorageAPI.Models;

namespace SelfStorageAPI.Services;

public class AuthService : IAuthService
{
    private readonly IUserRepository _userRepository;

    public AuthService(IUserRepository userRepository)
    {
        _userRepository = userRepository;
    }

    public async Task<AuthResult> LoginAsync(LoginRequestDTO request)
    {
        var user = await _userRepository.GetUserByEmailAsync(request.Email);

        if (user == null || user.PasswordHash != request.Password)
        {
            return new AuthResult { IsSuccess = false, ErrorMessage = "Email hoặc mật khẩu không đúng." };
        }

        if (user.Status != "Active")
        {
            return new AuthResult { IsSuccess = false, ErrorMessage = "Tài khoản chưa được kích hoạt hoặc đã bị khóa." };
        }

        return new AuthResult
        {
            IsSuccess = true,
            User = new AuthResponseDTO
            {
                UserID = user.UserID,
                FullName = user.FullName,
                Email = user.Email!,
                RoleName = user.Role.RoleName,
                Status = user.Status
            }
        };
    }

    public async Task<AuthResult> RegisterAsync(RegisterRequestDTO request)
    {
        if (await _userRepository.EmailExistsAsync(request.Email))
        {
            return new AuthResult { IsSuccess = false, ErrorMessage = "Email này đã được sử dụng." };
        }

        var role = await _userRepository.GetRoleByNameAsync(request.RoleName);
        if (role == null)
        {
            return new AuthResult { IsSuccess = false, ErrorMessage = "Role không hợp lệ." };
        }

        var isCustomer = request.RoleName == "Storage Customer";

        var newUser = new User
        {
            Username = request.Email,
            Email = request.Email,
            FullName = request.FullName,
            PasswordHash = request.Password, 
            RoleID = role.RoleID,
            Status = isCustomer ? "Active" : "Pending Approval"
        };

        await _userRepository.AddUserAsync(newUser);
        await _userRepository.SaveChangesAsync();

        return new AuthResult 
        { 
            IsSuccess = true, 
            ErrorMessage = isCustomer ? "Tạo tài khoản thành công." : "Đã gửi yêu cầu tài khoản, chờ Admin duyệt." 
        };
    }
}
