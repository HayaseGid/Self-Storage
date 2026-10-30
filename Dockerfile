# Build stage
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY ["backend/SelfStorageAPI.csproj", "backend/"]
RUN dotnet restore "backend/SelfStorageAPI.csproj"
COPY backend/ backend/
WORKDIR "/src/backend"
RUN dotnet publish "SelfStorageAPI.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Runtime stage
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
COPY --from=build /app/publish .

ENV ASPNETCORE_ENVIRONMENT=Production
EXPOSE 8080

ENTRYPOINT ["dotnet", "SelfStorageAPI.dll"]

