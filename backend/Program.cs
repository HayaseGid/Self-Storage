using Microsoft.EntityFrameworkCore;
using SelfStorageAPI.Data;

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
builder.Services.AddScoped<SelfStorageAPI.Interfaces.IUserRepository, SelfStorageAPI.Repositories.UserRepository>();
builder.Services.AddScoped<SelfStorageAPI.Interfaces.IAuthService, SelfStorageAPI.Services.AuthService>();
builder.Services.AddScoped<SelfStorageAPI.Interfaces.IContractSignatureService, SelfStorageAPI.Services.ContractSignatureService>();

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

app.MapControllers();

app.Run();
