# Graph Report - Self-Storage  (2026-11-09)

## Corpus Check
- 257 files · ~271,006 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 43 file(s) not represented in the graph (top: .css 29, (none) 6, .cmd 4)

## Summary
- 3398 nodes · 8597 edges · 154 communities (125 shown, 29 thin omitted)
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 758 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `70b5a83e`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- IFacilityManagementRepository
- App.jsx
- UpsertUnitSizeDTO
- CustomerAccount.jsx
- CancellationToken
- Task
- UnitTypeRepository
- apiGet
- FacilityManagerAccount.jsx
- packing.js
- ContractRenewalsController
- SelfStorageAPI.Interfaces
- useDialog
- IManagerToolsRepository
- FacilityStaffAccount.jsx
- react
- IReadOnlyList
- UnitReturnsController
- ContractSignature
- ReservationCancellationsController
- Reservation
- SelfStorageDbContext
- Facility
- ReservationService.CreateReservationAsync
- CartPage.jsx
- ManagerToolsService.AutoAssignAsync
- SelfStorageAPI.Constants
- List
- HandoverTask
- OperationsStateService.GetStateAsync
- Charge
- CustomerReservationsController.GetMine
- SelfStorageAPI.Models
- HttpGet
- VnPayController
- storageRules.js
- Payment
- EmailVerificationCode
- IActionResult
- UpdateSystemPoliciesDTO
- ReservationUnit
- StaffToolsService.ReportUnitAsync
- AssignTaskDTO
- StorageUnit
- formatVnd
- Node.js Changelog
- RentalPolicy
- User
- Neon
- BookingPage
- UnitSize
- RentalRate
- SelfStorageAPI.Services
- Managed Better Auth: implement login
- Contract
- FacilityUnitSize
- SupportRequest
- frontend/package.json
- SizeCategory
- Lakebase Postgres Branching
- ReservationItem
- UnitAccess
- CreateReservationDTO
- FeePolicy
- http
- UpsertPriceBandDTO
- CreateFacilityDTO
- UnitType
- PaymentCallbackLog
- package.json
- AuthResponseDTO
- PaymentService.ConfirmPaymentAsync
- UpdateFacilityDTO
- Node.js
- HttpPost
- FacilityStaff
- AuthResult
- Neon Functions
- RegisterRequestDTO
- CreateStorageUnitDTO
- JwtOptions
- StaffToolsRepository
- IUserRepository
- FacilityUnitType
- StatusChangeLog
- HandoverService.CompleteHandoverAsync
- StaffToolsResponse
- SelfStorageAPI.csproj
- DateTime
- RentalCalendar.jsx
- UnitReportDTO
- ICollection
- FacilityMap.jsx
- CustomerReservationsController
- AdminService.UpdateUserAsync
- 4.8. Nhóm Vận Hành Cơ Sở & Kho (`OperationsController` - `/api/Operations`)
- 4. Chi Tiết Request & Response Từng Nhóm API
- BusinessClock
- vercel.json
- Neon AI Gateway
- BusinessPanels.jsx
- Postgres Egress Optimizer
- Neon Object Storage
- Client-side reactivity
- Server-side rendering
- UnitReturn.jsx
- neon-functions/SKILL.md
- Function Triggers
- Lakebase Postgres
- Optimistic mutations
- Subscribing to queries
- Dialog.jsx
- customerNoticeData.js
- Defining queries
- ManagerToolsController
- Hướng dẫn chạy thanh toán VNPay (sandbox)
- Semantic Vector Search
- Sentry (errors, logs, and traces)
- Neon Realtime
- ContractRenewalsController.BuildQuote
- Production hardening for Neon Functions
- UserActivityLog
- Mastra agents with Mastra Studio observability
- Shipping native binaries with a Function
- Server-sent events (SSE) on Neon Functions
- Managing Lakebase Search with Drizzle
- Sửa luồng trả kho – mục 2, 5, 6
- AI SDK agents on Neon Functions
- Claimable Neon
- Sửa lỗi P1 – Bàn giao & trả kho
- Full-Text Search with BM25 Ranking
- Setup Flow
- Troubleshooting and Neon-Specific Performance
- Defining live queries
- JwtIdentityMiddleware
- StoreSpace – Web app hoàn chỉnh
- WebSocket Servers
- Hybrid Search
- Gia hạn hợp đồng (customer)
- Trả kho & kiểm kho
- Logs: CLI, Loki, and SDK pagination
- neon/references/function-triggers.md
- parse-env.md
- sdk.md

## God Nodes (most connected - your core abstractions)
1. `Node.js Changelog` - 315 edges
2. `Reservation` - 109 edges
3. `SelfStorageDbContext` - 98 edges
4. `User` - 89 edges
5. `SelfStorageAPI.Models` - 79 edges
6. `SelfStorageAPI.Interfaces` - 75 edges
7. `HandoverTask` - 62 edges
8. `FacilityManagementRepository` - 58 edges
9. `formatVnd()` - 58 edges
10. `IFacilityManagementRepository` - 57 edges

## Surprising Connections (you probably didn't know these)
- ``PUT /api/admin/users/{userId}`` --references--> `UpdateAdminUserDTO`  [INFERRED]
  API_DOCUMENTATION.md → backend/DTOs/AdminDTOs.cs
- ``POST /api/Reservation`` --references--> `CreateReservationDTO`  [INFERRED]
  API_DOCUMENTATION.md → backend/DTOs/TransactionDTOs.cs
- ``POST /api/Handover/complete`` --references--> `CompleteHandoverDTO`  [INFERRED]
  API_DOCUMENTATION.md → backend/DTOs/TransactionDTOs.cs
- ``POST /api/Operations/units`` --references--> `CreateStorageUnitDTO`  [INFERRED]
  API_DOCUMENTATION.md → backend/DTOs/WorkflowDTOs.cs
- ``PUT /api/Operations/units/{unitNumber}`` --references--> `CreateStorageUnitDTO`  [INFERRED]
  API_DOCUMENTATION.md → backend/DTOs/WorkflowDTOs.cs

## Import Cycles
- 2-file cycle: `frontend/src/ContractDocument.jsx -> frontend/src/ContractSignFlow.jsx -> frontend/src/ContractDocument.jsx`

## Communities (154 total, 29 thin omitted)

### Community 0 - "IFacilityManagementRepository"
Cohesion: 0.07
Nodes (4): IFacilityManagementRepository, IFacilityManagementService, OperationsServiceResponse, FacilityManagementService

### Community 1 - "App.jsx"
Cohesion: 0.12
Nodes (37): AuthShell(), BookingDraftNote(), BookingLoginRedirect(), DURATION_PACKAGE_NOTES, facilities, facilityImages, getBookingPath(), getRestoredBookingForm() (+29 more)

### Community 2 - "UpsertUnitSizeDTO"
Cohesion: 0.09
Nodes (15): UnitSizesController, UnitSizeResponse, UpsertUnitSizeDTO, Dimensions, DisplayName, FacilityID, HeightM, IsActive (+7 more)

### Community 3 - "CustomerAccount.jsx"
Cohesion: 0.08
Nodes (56): announceDepositSuccess(), announceRenewalSuccess(), clearContractSignRequest(), confirmAfterDeposit(), CUSTOMER_SECTION_KEY, FOCUS_CONTRACT_KEY, focusContract(), OPEN_SECTION_EVENT (+48 more)

### Community 5 - "Task"
Cohesion: 0.07
Nodes (5): IHandoverRepository, IPaymentRepository, HandoverRepository, PaymentRepository, UnitSizeRepository

### Community 6 - "UnitTypeRepository"
Cohesion: 0.07
Nodes (12): UnitTypesController, UnitTypeResponse, UpsertUnitTypeDTO, Description, FacilityID, IsActive, Name, TypeName (+4 more)

### Community 7 - "apiGet"
Cohesion: 0.10
Nodes (45): Admin(), roleOptions, API_URL, apiDelete(), ApiError, apiGet(), apiPost(), apiPut() (+37 more)

### Community 8 - "FacilityManagerAccount.jsx"
Cohesion: 0.09
Nodes (54): AddStaffModal(), appointmentKey(), Badge(), buildContractGroup(), compareNatural(), CONTRACT_PHASE_MAP, contractPhase(), daysLeft() (+46 more)

### Community 9 - "packing.js"
Cohesion: 0.11
Nodes (44): aisleZones(), autoPack(), buildExtremePoints(), collides(), describeItems(), epKey(), findPosition(), fitsAt() (+36 more)

### Community 10 - "ContractRenewalsController"
Cohesion: 0.13
Nodes (5): ContractRenewalsController, Plan, RenewalRules, RenewContractRequest, ContractRenewalFinalizer

### Community 11 - "SelfStorageAPI.Interfaces"
Cohesion: 0.08
Nodes (3): SelfStorageAPI.DTOs, SelfStorageAPI.Interfaces, SelfStorageAPI.Controllers

### Community 12 - "useDialog"
Cohesion: 0.16
Nodes (28): alertNotCustomer(), CartIcon(), formatMoney(), handleAddToCart(), UnitCard(), UnitDetailPage(), BusinessCatalog(), CatalogModal() (+20 more)

### Community 13 - "IManagerToolsRepository"
Cohesion: 0.13
Nodes (4): IManagerToolsRepository, IManagerToolsService, ManagerToolsResponse, ManagerToolsService

### Community 14 - "FacilityStaffAccount.jsx"
Cohesion: 0.11
Nodes (38): ACCESS_TYPES, addMonths(), AuthFrame(), AWAITING, Badge(), checkHandover(), compressImage(), dayGroup() (+30 more)

### Community 15 - "react"
Cohesion: 0.09
Nodes (49): Choice(), clone(), DepositFields(), NumField(), OverdueFields(), PolicyForm(), RenewalReturnFields(), ReservationFields() (+41 more)

### Community 16 - "IReadOnlyList"
Cohesion: 0.10
Nodes (8): AvailableUnitData, FacilityCatalogData, ICatalogRepository, UnitCatalogData, CatalogServiceResponse, ICatalogService, CatalogRepository, CatalogService

### Community 17 - "UnitReturnsController"
Cohesion: 0.12
Nodes (3): FeeLine, ReturnRules, UnitReturnsController

### Community 18 - "ContractSignature"
Cohesion: 0.05
Nodes (29): 4.6. Nhóm Ký Hợp Đồng Điện Tử (`ContractsController` - `/api/contracts`), `GET /api/contracts/{contractId}/signature`, `POST /api/contracts/{contractId}/signature`, ContractsController, AdminActivityLogResponse, AdminUserResponse, UpdateAdminUserDTO, RoleName (+21 more)

### Community 19 - "ReservationCancellationsController"
Cohesion: 0.08
Nodes (13): CancelQuote, CancelRequest, DepositShare, RefundResult, ReservationCancellationsController, HashSecret, SandboxRefundFallback, TmnCode (+5 more)

### Community 20 - "Reservation"
Cohesion: 0.05
Nodes (37): IReservationHoldRepository, Reservation, AppointmentDate, AppointmentTime, CancelledAt, CancelledByUser, CancelledByUserID, CancelReason (+29 more)

### Community 21 - "SelfStorageDbContext"
Cohesion: 0.06
Nodes (32): SelfStorageDbContext, AppErrorMessages, CancellationRules, Charges, Contracts, ContractSignatures, ContractTypes, EmailVerificationCodes (+24 more)

### Community 22 - "Facility"
Cohesion: 0.06
Nodes (31): Facility, Address, City, ContactPhone, CreatedAt, Description, District, FacilityID (+23 more)

### Community 23 - "ReservationService.CreateReservationAsync"
Cohesion: 0.11
Nodes (6): IReservationRepository, IReservationService, ReservationServiceResponse, ReservationRepository, ReservationService, 5. Các Điểm Mạnh Trong Thiết Kế Của Dự Án

### Community 24 - "CartPage.jsx"
Cohesion: 0.14
Nodes (26): formatDashboardDate(), mapCustomerReservation(), addToCart(), CHECKOUT_LIMIT, clearCart(), getCart(), getCartOrders(), newOrderCode() (+18 more)

### Community 25 - "ManagerToolsService.AutoAssignAsync"
Cohesion: 0.23
Nodes (4): AssignPlan, Candidate, Slot, StaffAssignmentPolicy

### Community 26 - "SelfStorageAPI.Constants"
Cohesion: 0.17
Nodes (6): ReservationStatus, RoleNames, UnitStatus, SelfStorageAPI.Data, SelfStorageAPI.Repositories, SelfStorageAPI.Constants

### Community 28 - "HandoverTask"
Cohesion: 0.08
Nodes (25): HandoverTask, ActualAt, AssignedByID, AssignedByUser, AssignedStaff, AssignedStaffID, ConditionResult, CreatedAt (+17 more)

### Community 29 - "OperationsStateService.GetStateAsync"
Cohesion: 0.18
Nodes (3): IOperationsStateRepository, IOperationsStateService, OperationsStateService

### Community 30 - "Charge"
Cohesion: 0.07
Nodes (29): Charge, Amount, ChargeID, ChargeType, CreatedAt, CreatedByUser, CreatedByUserID, Description (+21 more)

### Community 31 - "CustomerReservationsController.GetMine"
Cohesion: 0.18
Nodes (4): PaymentPlan, RentPaymentsController, OperationsStateRepository, RentPaymentRules

### Community 33 - "HttpGet"
Cohesion: 0.11
Nodes (6): AdminController, CatalogController, FacilityLocationsController, PoliciesController, ReservationController, StorageUnitsController

### Community 34 - "VnPayController"
Cohesion: 0.13
Nodes (6): CreateVnPayRequest, ProcessResult, VnPayController, Configured, HashSecret, TmnCode

### Community 35 - "storageRules.js"
Cohesion: 0.12
Nodes (21): cleanDate(), PriceInput(), ACTIVE_RESERVATION_STATUSES, calculateEndDate(), DEPOSIT_HOLD_MINUTES, DEPOSIT_MONTHS, describeVnd(), EDITABLE_UNIT_STATUSES (+13 more)

### Community 36 - "Payment"
Cohesion: 0.06
Nodes (30): Payment, Amount, CallbackLogs, Charges, ConfirmedAt, CreatedAt, CreatedByUser, CreatedByUserID (+22 more)

### Community 37 - "EmailVerificationCode"
Cohesion: 0.07
Nodes (26): EmailVerificationCode, ClosedAt, CloseReason, CodeHash, CreatedAt, Email, ExpiresAt, FailedAttempts (+18 more)

### Community 39 - "UpdateSystemPoliciesDTO"
Cohesion: 0.08
Nodes (26): CancellationRuleDTO, DaysBeforeStart, RefundPercent, ContractTermDiscountDTO, DiscountPercent, Months, ExtraFeeRuleDTO, Amount (+18 more)

### Community 40 - "ReservationUnit"
Cohesion: 0.08
Nodes (24): ReservationUnit, AssignedAt, AssignedByUser, AssignedByUserID, Charges, Facility, FacilityID, HandedOverAt (+16 more)

### Community 42 - "AssignTaskDTO"
Cohesion: 0.15
Nodes (12): AssignTaskDTO, Notes, ReservationId, ScheduledDate, ScheduledTime, StaffUserId, TaskType, UnitId (+4 more)

### Community 43 - "StorageUnit"
Cohesion: 0.08
Nodes (23): StorageUnit, BasePrice, CreatedAt, Facility, FacilityID, Floor, HandoverTasks, LocationNote (+15 more)

### Community 44 - "formatVnd"
Cohesion: 0.16
Nodes (29): FacilityFloorPlan(), COLORS, esc(), FacilityUnitsMap(), layoutUnits(), SPACING, STATUS_TEXT, ZONE_COLORS (+21 more)

### Community 45 - "Node.js Changelog"
Cohesion: 0.01
Nodes (315): 2009.06.11, Version 0.0.3, 2009.06.13, Version 0.0.4, 2009.06.18, Version 0.0.5, 2009.06.24, Version 0.0.6, 2009.06.30, Version 0.1.0, 2009.07.27, Version 0.1.1, 2009.08.01, Version 0.1.2, 2009.08.06, Version 0.1.3 (+307 more)

### Community 46 - "RentalPolicy"
Cohesion: 0.10
Nodes (20): DatabaseSeeder, CancellationRule, CancellationRuleID, DaysBeforeStart, RefundPercent, RentalPolicy, RentalPolicyID, RentalPolicy (+12 more)

### Community 47 - "User"
Cohesion: 0.08
Nodes (24): User, CreatedAt, Email, EmailVerificationCodes, EmailVerified, FacilityStaffs, FailedLoginCount, FullName (+16 more)

### Community 48 - "Neon"
Cohesion: 0.05
Nodes (36): Auth, 1. Install the Neon CLI, 2. Install the Neon MCP Server, 3. Install Neon Agent Skills, 4. Link Your Project and Get Started, Architecture: How to Use Neon, Backend Primitives, Bootstrap a New Project (+28 more)

### Community 49 - "BookingPage"
Cohesion: 0.15
Nodes (33): ArrowIcon(), BookingPage(), CartRoute(), ChevronIcon(), createSlug(), CustomerPage(), DistrictPicker(), FacilitiesPage() (+25 more)

### Community 50 - "UnitSize"
Cohesion: 0.08
Nodes (21): UnitSize, AreaM2, CreatedAt, CreatedByUser, CreatedByUserID, Dimensions, DisplayName, FacilityUnitSizes (+13 more)

### Community 51 - "RentalRate"
Cohesion: 0.07
Nodes (27): 1. Cấu Hình Chung, 2. Tài Khoản Mẫu Để Test (Mật khẩu chung: `123456`), 3. Bảng Tổng Hợp Nhanh 36 API Endpoints, Tài Liệu API Hệ Thống Self-Storage (`SelfStorageAPI v1`), RentalRate, Facility, FacilityID, FacilityUnitSize (+19 more)

### Community 53 - "Managed Better Auth: implement login"
Cohesion: 0.08
Nodes (23): Auth emails, Cross-subdomain vs bearer JWT, Data API identity, Environment, Managed Better Auth: implement login, Next.js, Organization invitations, Packages (+15 more)

### Community 54 - "Contract"
Cohesion: 0.11
Nodes (17): Contract, ActualEndDate, ContractID, ContractNumber, ContractStatus, CreatedAt, CreatedByUser, CreatedByUserID (+9 more)

### Community 55 - "FacilityUnitSize"
Cohesion: 0.20
Nodes (10): FacilityUnitSize, AddedAt, AddedByUser, AddedByUserID, Facility, FacilityID, IsActive, RentalRates (+2 more)

### Community 56 - "SupportRequest"
Cohesion: 0.11
Nodes (19): SupportRequest, AssignedStaff, AssignedStaffID, Category, Contract, ContractID, CreatedAt, Customer (+11 more)

### Community 57 - "frontend/package.json"
Cohesion: 0.13
Nodes (17): dependencies, react@^18.3.1, react-dom@^18.3.1, devDependencies, vite@^5.4.11, @vitejs/plugin-react@^4.3.4, name, private (+9 more)

### Community 58 - "SizeCategory"
Cohesion: 0.09
Nodes (19): AppErrorMessage, ErrorKey, HttpStatus, MessageVi, SizeCategory, CategoryCode, CategoryName, CodePrefix (+11 more)

### Community 59 - "Lakebase Postgres Branching"
Cohesion: 0.08
Nodes (25): Beta Support Guidance (Mandatory), Branch Type Decision, Branching in CI/CD, CLI usage, Console and API usage, Create a Normal Branch (Preferred for Real-Data Migration Testing), Create a Schema-Only Branch (Beta, Sensitive Data), Example 1: Migration testing with realistic data (+17 more)

### Community 60 - "ReservationItem"
Cohesion: 0.12
Nodes (17): ReservationItem, CreatedAt, DiscountPercent, EffectiveMonthlyPrice, Facility, FacilityID, MonthlyPrice, Quantity (+9 more)

### Community 61 - "UnitAccess"
Cohesion: 0.11
Nodes (17): UnitAccess, AccessID, AccessType, AccessValue, ClosedAt, IssuedAt, IssuedByUser, IssuedByUserID (+9 more)

### Community 62 - "CreateReservationDTO"
Cohesion: 0.20
Nodes (10): CreateReservationDTO, Months, PaymentPlan, StartDate, UnitID, UnitNumber, Units, ReservationUnitItemDTO (+2 more)

### Community 63 - "FeePolicy"
Cohesion: 0.15
Nodes (12): FeePolicy, Charges, CreatedAt, FeeCategory, FeeCode, FeeName, FeePolicyID, IsActive (+4 more)

### Community 64 - "http"
Cohesion: 0.13
Nodes (15): ASPNETCORE_ENVIRONMENT, applicationUrl, commandName, dotnetRunMessages, environmentVariables, launchBrowser, applicationUrl, commandName (+7 more)

### Community 65 - "UpsertPriceBandDTO"
Cohesion: 0.13
Nodes (15): BandInfo, IsSpecial, Locked, Candidate, PriceBandRulesController, UpsertPriceBandDTO, Code, IsActive (+7 more)

### Community 66 - "CreateFacilityDTO"
Cohesion: 0.13
Nodes (15): CreateFacilityDTO, Address, City, ContactPhone, DepositMonths, DepositPercent, Description, District (+7 more)

### Community 67 - "UnitType"
Cohesion: 0.13
Nodes (13): UnitType, CreatedAt, CreatedByUser, CreatedByUserID, Description, FacilityUnitTypes, ImageUrl, IsActive (+5 more)

### Community 68 - "PaymentCallbackLog"
Cohesion: 0.13
Nodes (14): PaymentCallbackLog, CallbackID, Note, OrderCode, Payload, Payment, PaymentID, ProcessResult (+6 more)

### Community 69 - "package.json"
Cohesion: 0.17
Nodes (13): dependencies, dotenv@^18.0.9, @neon/config@^1.9.6, @neon/env@^1.6.6, pg@^8.23.1, name, private, scripts (+5 more)

### Community 70 - "AuthResponseDTO"
Cohesion: 0.22
Nodes (9): AuthResponseDTO, Email, FullName, PhoneNumber, RoleName, Status, Token, TokenExpiresAt (+1 more)

### Community 71 - "PaymentService.ConfirmPaymentAsync"
Cohesion: 0.16
Nodes (11): 4.5. Nhóm Thanh Toán (`PaymentController` - `/api/Payment`), `POST /api/Payment/confirm`, PaymentController, CreatePaymentDTO, Amount, PaymentType, ReservationID, IPaymentService (+3 more)

### Community 72 - "UpdateFacilityDTO"
Cohesion: 0.14
Nodes (14): UpdateFacilityDTO, Address, City, ContactPhone, DepositMonths, DepositPercent, Description, District (+6 more)

### Community 73 - "Node.js"
Cohesion: 0.08
Nodes (23): API documentation, Building Node.js, Collaborator emeriti, Collaborators, Contributing to Node.js, Current and LTS releases, Current project team members, Download (+15 more)

### Community 75 - "FacilityStaff"
Cohesion: 0.20
Nodes (9): FacilityStaff, AssignedDate, AssignmentID, Facility, FacilityID, StaffID, Status, User (+1 more)

### Community 76 - "AuthResult"
Cohesion: 0.17
Nodes (9): LoginRequestDTO, Email, Password, AuthResult, ErrorMessage, IsSuccess, User, IAuthService (+1 more)

### Community 77 - "Neon Functions"
Cohesion: 0.09
Nodes (22): Application instrumentation, Architecture: Where Functions Fit, Availability, Built-in branch logs, Connecting to Postgres, Develop Locally and Deploy, Environment Variables, Function Triggers (+14 more)

### Community 78 - "RegisterRequestDTO"
Cohesion: 0.18
Nodes (11): 4.1. Nhóm Xác Thực (`AuthController` - `/api/Auth`), `POST /api/Auth/login`, `POST /api/Auth/register`, RegisterRequestDTO, DateOfBirth, Email, FullName, Gender (+3 more)

### Community 79 - "CreateStorageUnitDTO"
Cohesion: 0.17
Nodes (12): CreateStorageUnitDTO, BasePrice, FacilityID, Floor, LocationNote, Size, SizeM2, Status (+4 more)

### Community 80 - "JwtOptions"
Cohesion: 0.20
Nodes (8): IJwtTokenService, JwtOptions, AllowLegacyEmailHeader, Audience, ExpiresMinutes, Issuer, Key, JwtTokenService

### Community 83 - "FacilityUnitType"
Cohesion: 0.20
Nodes (10): FacilityUnitType, AddedAt, AddedByUser, AddedByUserID, Facility, FacilityID, IsActive, RentalRates (+2 more)

### Community 84 - "StatusChangeLog"
Cohesion: 0.20
Nodes (10): StatusChangeLog, ChangedAt, ChangedByUser, ChangedByUserID, EntityID, EntityType, LogID, NewStatus (+2 more)

### Community 85 - "HandoverService.CompleteHandoverAsync"
Cohesion: 0.20
Nodes (8): CompleteHandoverDTO, AccessType, AccessValue, Notes, ReservationID, HandoverServiceResponse, IHandoverService, HandoverService

### Community 87 - "SelfStorageAPI.csproj"
Cohesion: 0.22
Nodes (8): net10.0, BCrypt.Net-Next (4.2.0), Microsoft.AspNetCore.Authentication.JwtBearer (10.0.0), Microsoft.AspNetCore.OpenApi (10.0.12), Microsoft.EntityFrameworkCore.Design (10.0.12), Microsoft.EntityFrameworkCore.SqlServer (10.0.12), Npgsql.EntityFrameworkCore.PostgreSQL (10.0.3), Microsoft.NET.Sdk.Web

### Community 88 - "DateTime"
Cohesion: 0.11
Nodes (12): ReturnRequest, IReservationHoldService, PolicyVersionEntry, Config, CreatedAt, CreatedBy, EffectiveFrom, Key (+4 more)

### Community 89 - "RentalCalendar.jsx"
Cohesion: 0.39
Nodes (8): addDays(), buildMonth(), fmt(), keyOf(), RentalCalendar(), sameDay(), startOfDay(), WEEKDAYS

### Community 90 - "UnitReportDTO"
Cohesion: 0.25
Nodes (7): UnitReportDTO, EvidenceImages, Notes, Result, UnitId, UpdateUnitStatusDTO, Status

### Community 91 - "ICollection"
Cohesion: 0.13
Nodes (12): ContractType, ContractTypeID, DiscountRate, IsActive, RentalMonths, Reservations, TypeName, Role (+4 more)

### Community 92 - "FacilityMap.jsx"
Cohesion: 0.33
Nodes (10): FacilitiesMapSection(), FacilityLocationCard(), toMapPoints(), DEFAULT_CENTER, directionsUrl(), esc(), FacilityMap(), loadFacilityLocations() (+2 more)

### Community 93 - "CustomerReservationsController"
Cohesion: 0.22
Nodes (3): CustomerReservationsController, ConfirmMineRequest, ReservationConfirmationsController

### Community 95 - "4.8. Nhóm Vận Hành Cơ Sở & Kho (`OperationsController` - `/api/Operations`)"
Cohesion: 0.07
Nodes (28): 4.8. Nhóm Vận Hành Cơ Sở & Kho (`OperationsController` - `/api/Operations`), `DELETE /api/Operations/facilities/{facilityId}`, `DELETE /api/Operations/facilities/{facilityId}/rates/{unitTypeId}/{unitSizeId}`, `GET /api/Operations/reports`, `GET /api/Operations/state?email=<optional>`, `POST /api/Operations/facilities`, `POST /api/Operations/facilities/{facilityId}/staff`, `POST /api/Operations/reservations/{reservationId}/assign` (+20 more)

### Community 96 - "4. Chi Tiết Request & Response Từng Nhóm API"
Cohesion: 0.11
Nodes (17): 4.10. Nhóm Danh Mục Kích Thước Kho (`UnitSizesController` - `/api/unit-sizes`), 4.2. Nhóm Quản Trị Hệ Thống (`AdminController` - `/api/admin`), 4.3. Nhóm Danh Mục & Tìm Kho (`CatalogController` - `/api/Catalog`), 4.4. Nhóm Đặt Chỗ Thuê Kho (`ReservationController` - `/api/Reservation`), 4.7. Nhóm Bàn Giao Kho (`HandoverController` - `/api/Handover`), 4.9. Nhóm Danh Mục Loại Kho (`UnitTypesController` - `/api/unit-types`), 4. Chi Tiết Request & Response Từng Nhóm API, `GET /api/admin/activity` (+9 more)

### Community 107 - "Neon AI Gateway"
Cohesion: 0.11
Nodes (17): Availability, Build Agents with Mastra (Recommended), Build Agents with the Vercel AI SDK (Recommended), Enabling the gateway: plan and model access, Environment Variables, Further Reading, Generate Embeddings with the AI SDK, Generate Images (+9 more)

### Community 108 - "BusinessPanels.jsx"
Cohesion: 0.25
Nodes (15): BusinessFacilityForm(), BusinessFacilitiesByArea(), BusinessPerformance(), BusinessReportsCenter(), downloadCsv(), money(), OccupancyBar(), percent() (+7 more)

### Community 109 - "Postgres Egress Optimizer"
Cohesion: 0.12
Nodes (16): Application-side aggregation, Check if pg_stat_statements is available, Diagnostic queries, Further Reading, Handle empty stats, High-frequency queries on static data, Interpret the results, JOIN duplication (+8 more)

### Community 110 - "Neon Object Storage"
Cohesion: 0.12
Nodes (15): Architecture: Where Object Storage Fits, Availability, Built-in Branch Logs, CLI Bucket and Object Commands, Environment Variables, Further Reading, Neon Documentation, Neon Infrastructure as Code (`neon.ts`) (+7 more)

### Community 111 - "Client-side reactivity"
Cohesion: 0.12
Nodes (16): Changing query parameters, Client-side reactivity, Contents, Create the collection, Handling errors, initialData, Manage optimistic state, Other frameworks (+8 more)

### Community 112 - "Server-side rendering"
Cohesion: 0.13
Nodes (15): Contents, Create a `DbClient` per router, Define the collection, Examples, Keep row shapes identical, Keep secrets on the server, Open the connection in the browser, Render the initial rows straight away (+7 more)

### Community 113 - "UnitReturn.jsx"
Cohesion: 0.30
Nodes (13): InspectForm(), money(), StaffReturns(), todayIso(), useStaffReturns(), fmtDay(), money(), payReturnFees() (+5 more)

### Community 114 - "neon-functions/SKILL.md"
Cohesion: 0.21
Nodes (6): Authenticating the server, MCP servers on Neon Functions, Option 1 — OAuth via the Better Auth MCP plugin (best for third-party clients), Option 2 — API key or session JWT via self-hosted Better Auth (simplest), Testing, The server

### Community 115 - "Function Triggers"
Cohesion: 0.15
Nodes (13): CLI, Delivery payload, Fields, Function Triggers, Inheritance, Local `neon dev`, Logs, MCP backup (+5 more)

### Community 116 - "Lakebase Postgres"
Cohesion: 0.15
Nodes (13): Autoscaling, Branching, Connection Pooling, Gotchas, Instant Restore, IP Allow Lists, Lakebase Postgres, Lakebase Search (+5 more)

### Community 117 - "Optimistic mutations"
Cohesion: 0.15
Nodes (13): Automatic management of optimistic state, Calling the routes from the frontend, Contents, How optimistic mutations work, Optimistic mutations, Render the app, Returning the `txid` from your backend, Running example (+5 more)

### Community 118 - "Subscribing to queries"
Cohesion: 0.15
Nodes (13): Contents, Debug subscriptions, Fetch from a server function, Fetch from an API endpoint, Getting the query to subscribe to, Handle errors, Listen for changes, Log client diagnostics (+5 more)

### Community 119 - "Dialog.jsx"
Cohesion: 0.21
Nodes (11): CancelReservationModal(), fmtIso(), money(), REASONS, tierLabel(), browserFallback, DialogContext, DialogProvider() (+3 more)

### Community 120 - "customerNoticeData.js"
Cohesion: 0.29
Nodes (12): buildCustomerNotifications(), daysUntil(), isoDay(), money(), readSeen(), seenKey(), stageOf(), TONE_RANK (+4 more)

### Community 121 - "Defining queries"
Cohesion: 0.17
Nodes (12): Authorization, Contents, Defining queries, Exposing an endpoint, Exposing queries, Live authorization, Renewing sealed queries, Sealing authorized queries (+4 more)

### Community 123 - "Hướng dẫn chạy thanh toán VNPay (sandbox)"
Cohesion: 0.17
Nodes (11): Bước 1. Đăng ký tài khoản sandbox (5 phút), Bước 2. Cấu hình cho backend (chọn 1 cách), Bước 3. Chạy lại backend và kiểm tra, Bước 4. Frontend dùng VNPay thật, Bước 5. Thanh toán thử, Cách A (khuyên dùng): biến môi trường Windows, không sửa file nào trong repo, Cách B: sửa `backend/appsettings.Development.json`, nhớ KHÔNG commit file này, Gặp lỗi? (+3 more)

### Community 124 - "Semantic Vector Search"
Cohesion: 0.18
Nodes (11): AI SDK (Recommended), Build the Index, Contents, Create the Extension, OpenAI SDK Alternative, Prepare Embeddings, Query, Semantic Vector Search (+3 more)

### Community 125 - "Sentry (errors, logs, and traces)"
Cohesion: 0.20
Nodes (10): 1. Initialize before anything else, 2. Provide the DSN as a deploy-time secret, 3. Create the request span and catch route errors, 4. Errors are for failures; logs are for the story, 5. Trace the agent itself, Environment variables, Other Node integrations, Sentry error monitoring on Neon Functions (+2 more)

### Community 126 - "Neon Realtime"
Cohesion: 0.20
Nodes (10): Choose the Stack, Core Pattern, Define and Seal Queries, How It Works, More Docs, Neon Realtime, Optimistic Writes, Server-Side Rendering (+2 more)

### Community 127 - "ContractRenewalsController.BuildQuote"
Cohesion: 0.24
Nodes (5): PlanQuote, UnitQuote, Excess, TopUp, Transfer

### Community 128 - "Production hardening for Neon Functions"
Cohesion: 0.22
Nodes (9): Choose the caller shape, Function Triggers only, Limit authenticated application work, Native URL, Preserve existing clients, Production hardening for Neon Functions, Public consumers through a Worker, Reject these (+1 more)

### Community 129 - "UserActivityLog"
Cohesion: 0.22
Nodes (8): UserActivityLog, Action, Details, IPAddress, LogID, Timestamp, User, UserID

### Community 130 - "Mastra agents with Mastra Studio observability"
Cohesion: 0.25
Nodes (8): 1. Define the agent against the Neon AI Gateway, 2. Wire observability to Mastra Studio, 3. Structured output through the gateway, 4. Create the Mastra project + token with the CLI, 5. Pass the creds via `neon.ts` (third-party env), 6. Verify, Further reading, Mastra agents with Mastra Studio observability

### Community 131 - "Shipping native binaries with a Function"
Cohesion: 0.25
Nodes (7): `bundler: "none"`: ship a prebuilt directory, Custom `bundler`: return the file map, `externalPackages`: npm packages with a Node addon, Shipping native binaries with a Function, Size limits, Standalone executables, The runtime a binary lands on

### Community 132 - "Server-sent events (SSE) on Neon Functions"
Cohesion: 0.25
Nodes (7): Caveats, Client, Minimal SSE endpoint (no framework), Push to every client, across isolates, Server-sent events (SSE) on Neon Functions, Wire format (just text), With Hono

### Community 133 - "Managing Lakebase Search with Drizzle"
Cohesion: 0.25
Nodes (8): BM25 Index, Config, Extensions, Generate and Store Embeddings, Managing Lakebase Search with Drizzle, Query, Schema, Tune Per Query

### Community 134 - "Sửa luồng trả kho – mục 2, 5, 6"
Cohesion: 0.25
Nodes (7): Chưa làm (cần chốt luật), File thay đổi, Mục 2 – Hợp đồng quá hạn mà khách không báo trả, Mục 5 – Phân công trả kho, Mục 6 – Kiểm xong chuyển "Bảo trì", Nguyên tắc, Sửa luồng trả kho – mục 2, 5, 6

### Community 135 - "AI SDK agents on Neon Functions"
Cohesion: 0.29
Nodes (7): 1. Declare the gateway and the function, 2. The handler: stream a tool-calling agent, 3. Generate images and persist them, 4. Call it directly from the client (don't proxy the stream), 5. Run and deploy, AI SDK agents on Neon Functions, Further reading

### Community 136 - "Claimable Neon"
Cohesion: 0.29
Nodes (6): Claim, Claimable Neon, If neon claim is missing, Path, With REST, With the CLI

### Community 137 - "Sửa lỗi P1 – Bàn giao & trả kho"
Cohesion: 0.29
Nodes (6): File thay đổi, Lưu ý khi demo, Nguyên tắc, Sửa lỗi P1 – Bàn giao & trả kho, Điều kiện bàn giao (backend kiểm tra theo thứ tự), Điều kiện trả kho (UnitReturnsController)

### Community 138 - "Full-Text Search with BM25 Ranking"
Cohesion: 0.33
Nodes (6): Full-Text Search with BM25 Ranking, Prepare and Index Text, Query and Interpret Scores, Set Parameters at Build Time or Per Query, Set the Candidate Limit, Use Prefilter Selectively

### Community 139 - "Setup Flow"
Cohesion: 0.33
Nodes (6): 1. Select the organization and project, 2. Get the connection string, 3. Pick the connection method and driver, 4. Set up the schema, Setup Flow, When to use pooled vs direct connections

### Community 140 - "Troubleshooting and Neon-Specific Performance"
Cohesion: 0.33
Nodes (6): Choose CLI or MCP, Inspect Neon Cache Behavior Per Query, Interpret Results Safely, Performance Workflow, Pick the Diagnostic, Troubleshooting and Neon-Specific Performance

### Community 142 - "Defining live queries"
Cohesion: 0.33
Nodes (6): Defining live queries, Parameter types, Query parameters, Table requirements, Using a query builder or ORM, Using raw SQL

### Community 145 - "StoreSpace – Web app hoàn chỉnh"
Cohesion: 0.40
Nodes (4): Chạy frontend và backend, Cấu trúc, Font, StoreSpace – Web app hoàn chỉnh

### Community 146 - "WebSocket Servers"
Cohesion: 0.50
Nodes (4): Client must reconnect, Fan-out across isolates (do not skip this), Heartbeat (keep the socket alive), WebSocket Servers

### Community 147 - "Hybrid Search"
Cohesion: 0.50
Nodes (4): Adapt the Hybrid Search, Hybrid Search, Rerank with Jev, RRF Example

### Community 148 - "Gia hạn hợp đồng (customer)"
Cohesion: 0.50
Nodes (3): Backend (chỉ file thêm mới, không sửa code của nhóm), Gia hạn hợp đồng (customer), Luồng

### Community 149 - "Trả kho & kiểm kho"
Cohesion: 0.50
Nodes (3): API (backend/Controllers/UnitReturnsController.cs - file mới), Luồng, Trả kho & kiểm kho

## Knowledge Gaps
- **679 isolated node(s):** `Today`, `Transfer`, `TopUp`, `Excess`, `IsSpecial` (+674 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1592 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **29 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `3. Chi Tiết Trách Nhiệm Của Từng Tầng` connect `Payment` to `RentalRate`, `apiGet`?**
  _High betweenness centrality (0.228) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `Reservation` (e.g. with `DatabaseSeeder.ResetAndSeedFull()` and `ReservationService.CreateReservationAsync()`) actually correct?**
  _`Reservation` has 4 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Today`, `Transfer`, `TopUp` to the rest of the system?**
  _679 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `IFacilityManagementRepository` be split into smaller, more focused modules?**
  _Cohesion score 0.07437518819632641 - nodes in this community are weakly interconnected._
- **Why does `Chặng 1: Frontend gửi API (`frontend/src/api.js`)` connect `apiGet` to `Payment`?**
  _High betweenness centrality (0.227) - this node is a cross-community bridge._
- **Should `App.jsx` be split into smaller, more focused modules?**
  _Cohesion score 0.11707317073170732 - nodes in this community are weakly interconnected._
- **Why does `Chặng 3: Xử lý nghiệp vụ tại Tầng `Services/`` connect `Payment` to `ReservationUnit`, `Reservation`, `Contract`, `HandoverTask`, `UnitAccess`, `Charge`?**
  _High betweenness centrality (0.202) - this node is a cross-community bridge._