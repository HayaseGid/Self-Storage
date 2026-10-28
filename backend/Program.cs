using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using SelfStorageAPI.Data;
using SelfStorageAPI.Interfaces;
using SelfStorageAPI.Middleware;
using SelfStorageAPI.Repositories;
using SelfStorageAPI.Services;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddControllers();
builder.Services.AddOpenApi();
// Configure CORS to allow frontend connections
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend",
        policy =>
        {
            policy.AllowAnyOrigin() // Cho phép tất cả origin để dễ test (Trong thực tế nên đổi thành localhost:5500)
                  .AllowAnyHeader()
                  .AllowAnyMethod();
        });
});

builder.Services.AddDbContext<SelfStorageDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

// Register Repositories and Services
builder.Services.AddScoped<IUserRepository, UserRepository>();
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<IContractSignatureService, ContractSignatureService>();
builder.Services.AddScoped<IUnitSizeRepository, UnitSizeRepository>();
builder.Services.AddScoped<IUnitSizeService, UnitSizeService>();
builder.Services.AddScoped<IUnitTypeRepository, UnitTypeRepository>();
builder.Services.AddScoped<IUnitTypeService, UnitTypeService>();
builder.Services.AddScoped<IPaymentRepository, PaymentRepository>();
builder.Services.AddScoped<IPaymentService, PaymentService>();
builder.Services.AddScoped<IReservationRepository, ReservationRepository>();
builder.Services.AddScoped<IReservationService, ReservationService>();
builder.Services.AddScoped<IHandoverRepository, HandoverRepository>();
builder.Services.AddScoped<IHandoverService, HandoverService>();
builder.Services.AddScoped<IReservationHoldRepository, ReservationHoldRepository>();
builder.Services.AddScoped<IReservationHoldService, ReservationHoldService>();
builder.Services.AddScoped<IAdminRepository, AdminRepository>();
builder.Services.AddScoped<IAdminService, AdminService>();
builder.Services.AddScoped<ICatalogRepository, CatalogRepository>();
builder.Services.AddScoped<ICatalogService, CatalogService>();
builder.Services.AddScoped<IOperationsStateRepository, OperationsStateRepository>();
builder.Services.AddScoped<IOperationsStateService, OperationsStateService>();
builder.Services.AddScoped<IFacilityManagementRepository, FacilityManagementRepository>();
builder.Services.AddScoped<IFacilityManagementService, FacilityManagementService>();

// JWT authentication
var jwtSection = builder.Configuration.GetSection(JwtOptions.SectionName);
builder.Services.Configure<JwtOptions>(jwtSection);
var jwtOptions = jwtSection.Get<JwtOptions>() ?? new JwtOptions();
if (string.IsNullOrWhiteSpace(jwtOptions.Key) || Encoding.UTF8.GetByteCount(jwtOptions.Key) < 32)
    throw new InvalidOperationException("Cấu hình Jwt:Key bắt buộc và phải dài tối thiểu 32 ký tự.");

builder.Services.AddScoped<IJwtTokenService, JwtTokenService>();
builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.MapInboundClaims = false;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwtOptions.Issuer,
            ValidateAudience = true,
            ValidAudience = jwtOptions.Audience,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtOptions.Key)),
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromMinutes(1),
            NameClaimType = ClaimTypes.Name,
            RoleClaimType = ClaimTypes.Role
        };
    });
builder.Services.AddAuthorization();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}

// Allow frontend requests, including the demo identity header.
app.UseCors("AllowFrontend");

// Xác thực JWT, sau đó gán email trong token vào X-User-Email cho các controller hiện có.
app.UseAuthentication();
app.UseMiddleware<JwtIdentityMiddleware>();
app.UseAuthorization();

app.MapControllers();

app.Run();
