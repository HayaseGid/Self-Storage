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

AppContext.SetSwitch("Npgsql.EnableLegacyTimestampBehavior", true);

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


void TryLoadEnv(string path)
{
    if (File.Exists(path))
    {
        foreach (var line in File.ReadAllLines(path))
        {
            var trimmed = line.Trim();
            if (string.IsNullOrWhiteSpace(trimmed) || trimmed.StartsWith("#")) continue;
            var idx = trimmed.IndexOf('=');
            if (idx > 0)
            {
                var key = trimmed.Substring(0, idx).Trim();
                var val = trimmed.Substring(idx + 1).Trim().Trim('"', '\'');
                if (string.IsNullOrEmpty(Environment.GetEnvironmentVariable(key)))
                {
                    Environment.SetEnvironmentVariable(key, val);
                }
            }
        }
    }
}

TryLoadEnv(Path.Combine(builder.Environment.ContentRootPath, "..", ".env.local"));
TryLoadEnv(Path.Combine(builder.Environment.ContentRootPath, "..", ".env"));
TryLoadEnv(Path.Combine(builder.Environment.ContentRootPath, ".env.local"));
TryLoadEnv(Path.Combine(builder.Environment.ContentRootPath, ".env"));

var connectionString = Environment.GetEnvironmentVariable("DATABASE_URL")
    ?? builder.Configuration.GetConnectionString("DefaultConnection")
    ?? "";

bool isPostgres = connectionString.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase) ||
                  connectionString.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase) ||
                  connectionString.Contains("Host=", StringComparison.OrdinalIgnoreCase);

string FormatNpgsqlConnectionString(string connStr)
{
    if (connStr.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase) ||
        connStr.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase))
    {
        var uri = new Uri(connStr);
        var userInfo = uri.UserInfo.Split(':');
        var username = userInfo.Length > 0 ? Uri.UnescapeDataString(userInfo[0]) : "";
        var password = userInfo.Length > 1 ? Uri.UnescapeDataString(userInfo[1]) : "";
        var port = uri.Port > 0 ? uri.Port : 5432;
        var database = uri.AbsolutePath.TrimStart('/');
        return $"Host={uri.Host};Port={port};Database={database};Username={username};Password={password};SSL Mode=Require;Trust Server Certificate=true";
    }
    return connStr;
}

builder.Services.AddDbContext<SelfStorageDbContext>(options =>
{
    if (isPostgres)
    {
        options.UseNpgsql(FormatNpgsqlConnectionString(connectionString));
    }
    else
    {
        options.UseSqlServer(connectionString);
    }
});

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

using (var scope = app.Services.CreateScope())
{
    var dbContext = scope.ServiceProvider.GetRequiredService<SelfStorageDbContext>();
    if (dbContext.Database.ProviderName?.Contains("Npgsql", StringComparison.OrdinalIgnoreCase) == true)
    {
        dbContext.Database.EnsureCreated();
        DatabaseSeeder.SeedIfEmpty(dbContext);
    }
}

app.Run();
