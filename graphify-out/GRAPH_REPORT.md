# Graph Report - Self-Storage  (2026-11-08)

## Corpus Check
- 268 files · ~271,293 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 43 file(s) not represented in the graph (top: .css 29, (none) 6, .cmd 4)

## Summary
- 2551 nodes · 7706 edges · 107 communities (84 shown, 23 thin omitted)
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 704 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13
- Community 14
- Community 15
- Community 16
- Community 17
- Community 18
- Community 19
- Community 20
- Community 21
- Community 22
- Community 23
- Community 24
- Community 25
- Community 26
- Community 27
- Community 28
- Community 29
- Community 30
- Community 31
- Community 32
- Community 33
- Community 34
- Community 35
- Community 36
- Community 37
- Community 38
- Community 39
- Community 40
- Community 41
- Community 42
- Community 43
- Community 44
- Community 45
- Community 46
- Community 47
- Community 48
- Community 49
- Community 50
- Community 51
- Community 52
- Community 53
- Community 54
- Community 55
- Community 56
- Community 57
- Community 58
- Community 59
- Community 60
- Community 61
- Community 62
- Community 63
- Community 64
- Community 65
- Community 66
- Community 67
- Community 68
- Community 69
- Community 70
- Community 71
- Community 72
- Community 73
- Community 74
- Community 75
- Community 76
- Community 77
- Community 78
- Community 79
- Community 80
- Community 81
- Community 82
- Community 83
- Community 84
- Community 85
- Community 86
- Community 87
- Community 88
- Community 89
- Community 90
- Community 91
- Community 92
- Community 93
- Community 94
- Community 95
- Community 96
- Community 98
- Community 101

## God Nodes (most connected - your core abstractions)
1. `Reservation` - 107 edges
2. `SelfStorageDbContext` - 98 edges
3. `User` - 88 edges
4. `SelfStorageAPI.Models` - 79 edges
5. `SelfStorageAPI.Interfaces` - 75 edges
6. `HandoverTask` - 61 edges
7. `FacilityManagementRepository` - 58 edges
8. `formatVnd()` - 58 edges
9. `IFacilityManagementRepository` - 57 edges
10. `Facility` - 56 edges

## Surprising Connections (you probably didn't know these)
- `BookingPage()` --calls--> `calculateEndDate()`  [EXTRACTED]
  frontend/src/App.jsx → frontend/src/storageRules.js
- `AdminController` --references--> `IAdminService`  [EXTRACTED]
  backend/Controllers/AdminController.cs → backend/Interfaces/IAdminService.cs
- `AuthController` --references--> `SelfStorageDbContext`  [EXTRACTED]
  backend/Controllers/AuthController.cs → backend/Data/SelfStorageDbContext.cs
- `AuthController` --references--> `IAuthService`  [EXTRACTED]
  backend/Controllers/AuthController.cs → backend/Interfaces/IAuthService.cs
- `AuthController` --references--> `IJwtTokenService`  [EXTRACTED]
  backend/Controllers/AuthController.cs → backend/Interfaces/IJwtTokenService.cs

## Import Cycles
- 2-file cycle: `frontend/src/ContractDocument.jsx -> frontend/src/ContractSignFlow.jsx -> frontend/src/ContractDocument.jsx`

## Communities (107 total, 23 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.07
Nodes (8): AssignFacilityStaffDTO, StaffEmail, AssignReservationDTO, UnitNumber, IFacilityManagementRepository, IFacilityManagementService, OperationsServiceResponse, FacilityManagementService

### Community 1 - "Community 1"
Cohesion: 0.08
Nodes (77): alertNotCustomer(), ArrowIcon(), AuthShell(), BookingDraftNote(), BookingLoginRedirect(), BookingPage(), CartIcon(), CartRoute() (+69 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (36): UnitSizesController, UnitSizeResponse, UpsertUnitSizeDTO, Dimensions, DisplayName, FacilityID, HeightM, IsActive (+28 more)

### Community 3 - "Community 3"
Cohesion: 0.09
Nodes (58): announceDepositSuccess(), announceRenewalSuccess(), clearContractSignRequest(), confirmAfterDeposit(), CUSTOMER_SECTION_KEY, FOCUS_CONTRACT_KEY, focusContract(), OPEN_SECTION_EVENT (+50 more)

### Community 5 - "Community 5"
Cohesion: 0.06
Nodes (6): PoliciesController, PriceBandsController, IAdminRepository, AdminRepository, StaffToolsRepository, UnitSizeRepository

### Community 6 - "Community 6"
Cohesion: 0.07
Nodes (12): UnitTypesController, UnitTypeResponse, UpsertUnitTypeDTO, Description, FacilityID, IsActive, Name, TypeName (+4 more)

### Community 7 - "Community 7"
Cohesion: 0.08
Nodes (48): Admin(), roleOptions, API_URL, apiDelete(), ApiError, apiGet(), apiPut(), apiRequest() (+40 more)

### Community 8 - "Community 8"
Cohesion: 0.09
Nodes (53): AddStaffModal(), appointmentKey(), Badge(), buildContractGroup(), compareNatural(), CONTRACT_PHASE_MAP, contractPhase(), daysLeft() (+45 more)

### Community 9 - "Community 9"
Cohesion: 0.11
Nodes (44): aisleZones(), autoPack(), buildExtremePoints(), collides(), describeItems(), epKey(), findPosition(), fitsAt() (+36 more)

### Community 10 - "Community 10"
Cohesion: 0.10
Nodes (9): ContractRenewalsController, Plan, PlanQuote, RenewalRules, RenewContractRequest, UnitQuote, Excess, TopUp (+1 more)

### Community 11 - "Community 11"
Cohesion: 0.11
Nodes (3): SelfStorageAPI.DTOs, SelfStorageAPI.Interfaces, SelfStorageAPI.Controllers

### Community 12 - "Community 12"
Cohesion: 0.12
Nodes (37): BusinessCatalog(), CatalogModal(), Field(), fmtArea(), suggestedSizeLetter(), UnitSizeForm(), UnitTypeForm(), BusinessFacilityForm() (+29 more)

### Community 13 - "Community 13"
Cohesion: 0.15
Nodes (4): IManagerToolsRepository, IManagerToolsService, ManagerToolsResponse, ManagerToolsService

### Community 14 - "Community 14"
Cohesion: 0.11
Nodes (38): ACCESS_TYPES, addMonths(), AuthFrame(), AWAITING, Badge(), checkHandover(), compressImage(), dayGroup() (+30 more)

### Community 15 - "Community 15"
Cohesion: 0.11
Nodes (37): BusinessPolicyEditor(), Choice(), clone(), DepositFields(), NumField(), OverdueFields(), PolicyForm(), RenewalReturnFields() (+29 more)

### Community 16 - "Community 16"
Cohesion: 0.10
Nodes (8): AvailableUnitData, FacilityCatalogData, ICatalogRepository, UnitCatalogData, CatalogServiceResponse, ICatalogService, CatalogRepository, CatalogService

### Community 17 - "Community 17"
Cohesion: 0.13
Nodes (4): FeeLine, ReturnRequest, ReturnRules, UnitReturnsController

### Community 18 - "Community 18"
Cohesion: 0.09
Nodes (16): AdminActivityLogResponse, AdminUserResponse, UpdateAdminUserDTO, RoleName, Status, AdminServiceResponse, IAdminService, UserActivityLog (+8 more)

### Community 19 - "Community 19"
Cohesion: 0.10
Nodes (8): CancelQuote, CancelRequest, DepositShare, RefundResult, ReservationCancellationsController, HashSecret, SandboxRefundFallback, TmnCode

### Community 20 - "Community 20"
Cohesion: 0.06
Nodes (35): Reservation, AppointmentDate, AppointmentTime, CancelledAt, CancelledByUser, CancelledByUserID, CancelReason, Charges (+27 more)

### Community 21 - "Community 21"
Cohesion: 0.06
Nodes (32): SelfStorageDbContext, AppErrorMessages, CancellationRules, Charges, Contracts, ContractSignatures, ContractTypes, EmailVerificationCodes (+24 more)

### Community 22 - "Community 22"
Cohesion: 0.06
Nodes (31): Facility, Address, City, ContactPhone, CreatedAt, Description, District, FacilityID (+23 more)

### Community 23 - "Community 23"
Cohesion: 0.12
Nodes (5): IReservationRepository, IReservationService, ReservationServiceResponse, ReservationRepository, ReservationService

### Community 24 - "Community 24"
Cohesion: 0.13
Nodes (30): addToCart(), CART_LIMIT, CHECKOUT_LIMIT, clearCart(), getCart(), getCartOrders(), isInCart(), newOrderCode() (+22 more)

### Community 25 - "Community 25"
Cohesion: 0.18
Nodes (4): AssignPlan, Candidate, Slot, StaffAssignmentPolicy

### Community 26 - "Community 26"
Cohesion: 0.18
Nodes (6): ReservationStatus, RoleNames, UnitStatus, SelfStorageAPI.Data, SelfStorageAPI.Repositories, SelfStorageAPI.Constants

### Community 28 - "Community 28"
Cohesion: 0.07
Nodes (25): HandoverTask, ActualAt, AssignedByID, AssignedByUser, AssignedStaff, AssignedStaffID, ConditionResult, CreatedAt (+17 more)

### Community 29 - "Community 29"
Cohesion: 0.10
Nodes (7): IOperationsStateRepository, IOperationsStateService, IReservationHoldRepository, IReservationHoldService, ReservationHoldRepository, OperationsStateService, ReservationHoldService

### Community 30 - "Community 30"
Cohesion: 0.07
Nodes (29): Charge, Amount, ChargeID, ChargeType, CreatedAt, CreatedByUser, CreatedByUserID, Description (+21 more)

### Community 31 - "Community 31"
Cohesion: 0.15
Nodes (5): PaymentPlan, CustomerReservationsController, RentPaymentsController, OperationsStateRepository, RentPaymentRules

### Community 33 - "Community 33"
Cohesion: 0.09
Nodes (7): AdminController, CatalogController, FacilityLocationsController, HandoverController, PaymentController, ReservationController, StorageUnitsController

### Community 34 - "Community 34"
Cohesion: 0.13
Nodes (6): CreateVnPayRequest, ProcessResult, VnPayController, Configured, HashSecret, TmnCode

### Community 35 - "Community 35"
Cohesion: 0.11
Nodes (22): cleanDate(), PriceInput(), ACTIVE_RESERVATION_STATUSES, calculateEndDate(), DEPOSIT_HOLD_MINUTES, DEPOSIT_MONTHS, describeVnd(), EDITABLE_UNIT_STATUSES (+14 more)

### Community 36 - "Community 36"
Cohesion: 0.08
Nodes (25): Payment, Amount, CallbackLogs, Charges, ConfirmedAt, CreatedAt, CreatedByUser, CreatedByUserID (+17 more)

### Community 37 - "Community 37"
Cohesion: 0.07
Nodes (26): EmailVerificationCode, ClosedAt, CloseReason, CodeHash, CreatedAt, Email, ExpiresAt, FailedAttempts (+18 more)

### Community 38 - "Community 38"
Cohesion: 0.18
Nodes (5): OperationsController, UpdateRentalRateDTO, BasePrice, UnitSizeID, UnitTypeID

### Community 39 - "Community 39"
Cohesion: 0.08
Nodes (26): CancellationRuleDTO, DaysBeforeStart, RefundPercent, ContractTermDiscountDTO, DiscountPercent, Months, ExtraFeeRuleDTO, Amount (+18 more)

### Community 40 - "Community 40"
Cohesion: 0.08
Nodes (24): ReservationUnit, AssignedAt, AssignedByUser, AssignedByUserID, Charges, Facility, FacilityID, HandedOverAt (+16 more)

### Community 42 - "Community 42"
Cohesion: 0.11
Nodes (13): ManagerToolsController, AssignTaskDTO, Notes, ReservationId, ScheduledDate, ScheduledTime, StaffUserId, TaskType (+5 more)

### Community 43 - "Community 43"
Cohesion: 0.08
Nodes (23): StorageUnit, BasePrice, CreatedAt, Facility, FacilityID, Floor, HandoverTasks, LocationNote (+15 more)

### Community 44 - "Community 44"
Cohesion: 0.19
Nodes (21): FacilityFloorPlan(), loadLeaflet(), COLORS, esc(), FacilityUnitsMap(), layoutUnits(), SPACING, STATUS_TEXT (+13 more)

### Community 45 - "Community 45"
Cohesion: 0.16
Nodes (9): ContractsController, ContractSignatureStatusResponse, CreateContractSignatureRequest, AcceptedTerms, SignatureImage, TermsVersion, SaveContractSignatureResult, IContractSignatureService (+1 more)

### Community 46 - "Community 46"
Cohesion: 0.10
Nodes (19): CancellationRule, CancellationRuleID, DaysBeforeStart, RefundPercent, RentalPolicy, RentalPolicyID, RentalPolicy, CancellationRules (+11 more)

### Community 47 - "Community 47"
Cohesion: 0.08
Nodes (24): User, CreatedAt, Email, EmailVerificationCodes, EmailVerified, FacilityStaffs, FailedLoginCount, FullName (+16 more)

### Community 48 - "Community 48"
Cohesion: 0.24
Nodes (20): BusinessPriceBands(), EMPTY, money(), PriceBandForm(), STANDARD_GROUPS, ManagerPriceTable(), money(), area() (+12 more)

### Community 49 - "Community 49"
Cohesion: 0.21
Nodes (20): ContractDetailModal(), contractStage(), money(), STAGE_LABEL, ContractDocument(), contractUnits(), fmtIso(), fmtTime() (+12 more)

### Community 51 - "Community 51"
Cohesion: 0.11
Nodes (16): RentalRate, Facility, FacilityID, FacilityUnitSize, FacilityUnitType, MonthlyPrice, RentalRateID, ReservationItems (+8 more)

### Community 54 - "Community 54"
Cohesion: 0.11
Nodes (17): Contract, ActualEndDate, ContractID, ContractNumber, ContractStatus, CreatedAt, CreatedByUser, CreatedByUserID (+9 more)

### Community 55 - "Community 55"
Cohesion: 0.11
Nodes (17): ContractType, ContractTypeID, DiscountRate, IsActive, RentalMonths, Reservations, TypeName, FacilityUnitSize (+9 more)

### Community 56 - "Community 56"
Cohesion: 0.11
Nodes (19): SupportRequest, AssignedStaff, AssignedStaffID, Category, Contract, ContractID, CreatedAt, Customer (+11 more)

### Community 57 - "Community 57"
Cohesion: 0.13
Nodes (17): dependencies, react@^18.3.1, react-dom@^18.3.1, devDependencies, vite@^5.4.11, @vitejs/plugin-react@^4.3.4, name, private (+9 more)

### Community 58 - "Community 58"
Cohesion: 0.12
Nodes (15): SizeCategory, CategoryCode, CategoryName, CodePrefix, IsActive, MaxMonthlyPrice, MaxVolumeM3, MinMonthlyPrice (+7 more)

### Community 59 - "Community 59"
Cohesion: 0.12
Nodes (13): AppErrorMessage, ErrorKey, HttpStatus, MessageVi, ContractSignature, Contract, ContractID, SignatureImage (+5 more)

### Community 60 - "Community 60"
Cohesion: 0.12
Nodes (17): ReservationItem, CreatedAt, DiscountPercent, EffectiveMonthlyPrice, Facility, FacilityID, MonthlyPrice, Quantity (+9 more)

### Community 61 - "Community 61"
Cohesion: 0.12
Nodes (17): UnitAccess, AccessID, AccessType, AccessValue, ClosedAt, IssuedAt, IssuedByUser, IssuedByUserID (+9 more)

### Community 62 - "Community 62"
Cohesion: 0.13
Nodes (15): CompleteHandoverDTO, AccessType, AccessValue, Notes, ReservationID, CreateReservationDTO, Months, PaymentPlan (+7 more)

### Community 63 - "Community 63"
Cohesion: 0.14
Nodes (12): FeePolicy, Charges, CreatedAt, FeeCategory, FeeCode, FeeName, FeePolicyID, IsActive (+4 more)

### Community 64 - "Community 64"
Cohesion: 0.13
Nodes (15): ASPNETCORE_ENVIRONMENT, applicationUrl, commandName, dotnetRunMessages, environmentVariables, launchBrowser, applicationUrl, commandName (+7 more)

### Community 65 - "Community 65"
Cohesion: 0.26
Nodes (5): BandInfo, IsSpecial, Locked, Candidate, PriceBandRulesController

### Community 66 - "Community 66"
Cohesion: 0.13
Nodes (15): CreateFacilityDTO, Address, City, ContactPhone, DepositMonths, DepositPercent, Description, District (+7 more)

### Community 67 - "Community 67"
Cohesion: 0.14
Nodes (13): UnitType, CreatedAt, CreatedByUser, CreatedByUserID, Description, FacilityUnitTypes, ImageUrl, IsActive (+5 more)

### Community 68 - "Community 68"
Cohesion: 0.13
Nodes (14): PaymentCallbackLog, CallbackID, Note, OrderCode, Payload, Payment, PaymentID, ProcessResult (+6 more)

### Community 69 - "Community 69"
Cohesion: 0.17
Nodes (13): dependencies, dotenv@^18.0.9, @neon/config@^1.9.6, @neon/env@^1.6.6, pg@^8.23.1, name, private, scripts (+5 more)

### Community 70 - "Community 70"
Cohesion: 0.16
Nodes (11): AuthResponseDTO, Email, FullName, PhoneNumber, RoleName, Status, Token, TokenExpiresAt (+3 more)

### Community 71 - "Community 71"
Cohesion: 0.22
Nodes (8): CreatePaymentDTO, Amount, PaymentType, ReservationID, IPaymentService, PaymentResultDTO, PaymentServiceResponse, PaymentService

### Community 72 - "Community 72"
Cohesion: 0.14
Nodes (14): UpdateFacilityDTO, Address, City, ContactPhone, DepositMonths, DepositPercent, Description, District (+6 more)

### Community 75 - "Community 75"
Cohesion: 0.19
Nodes (10): DatabaseSeeder, FacilityStaff, AssignedDate, AssignmentID, Facility, FacilityID, StaffID, Status (+2 more)

### Community 76 - "Community 76"
Cohesion: 0.19
Nodes (6): AuthResult, ErrorMessage, IsSuccess, User, IAuthService, AuthService

### Community 77 - "Community 77"
Cohesion: 0.29
Nodes (9): ContractCard(), daysFromToday(), money(), parseVnDate(), STATUS_TONE, ContractModal(), formatSignedAt(), SignaturePad() (+1 more)

### Community 78 - "Community 78"
Cohesion: 0.17
Nodes (11): LoginRequestDTO, Email, Password, RegisterRequestDTO, DateOfBirth, Email, FullName, Gender (+3 more)

### Community 79 - "Community 79"
Cohesion: 0.17
Nodes (12): CreateStorageUnitDTO, BasePrice, FacilityID, Floor, LocationNote, Size, SizeM2, Status (+4 more)

### Community 80 - "Community 80"
Cohesion: 0.20
Nodes (7): JwtIdentityMiddleware, JwtOptions, AllowLegacyEmailHeader, Audience, ExpiresMinutes, Issuer, Key

### Community 81 - "Community 81"
Cohesion: 0.20
Nodes (10): UpsertPriceBandDTO, Code, IsActive, MaxArea, MaxPrice, MinArea, MinPrice, Name (+2 more)

### Community 83 - "Community 83"
Cohesion: 0.20
Nodes (10): FacilityUnitType, AddedAt, AddedByUser, AddedByUserID, Facility, FacilityID, IsActive, RentalRates (+2 more)

### Community 84 - "Community 84"
Cohesion: 0.20
Nodes (10): StatusChangeLog, ChangedAt, ChangedByUser, ChangedByUserID, EntityID, EntityType, LogID, NewStatus (+2 more)

### Community 85 - "Community 85"
Cohesion: 0.25
Nodes (3): HandoverServiceResponse, IHandoverService, HandoverService

### Community 87 - "Community 87"
Cohesion: 0.22
Nodes (8): net10.0, BCrypt.Net-Next (4.2.0), Microsoft.AspNetCore.Authentication.JwtBearer (10.0.0), Microsoft.AspNetCore.OpenApi (10.0.12), Microsoft.EntityFrameworkCore.Design (10.0.12), Microsoft.EntityFrameworkCore.SqlServer (10.0.12), Npgsql.EntityFrameworkCore.PostgreSQL (10.0.3), Microsoft.NET.Sdk.Web

### Community 88 - "Community 88"
Cohesion: 0.22
Nodes (9): PolicyVersionEntry, Config, CreatedAt, CreatedBy, EffectiveFrom, Key, Note, Status (+1 more)

### Community 89 - "Community 89"
Cohesion: 0.39
Nodes (8): addDays(), buildMonth(), fmt(), keyOf(), RentalCalendar(), sameDay(), startOfDay(), WEEKDAYS

### Community 90 - "Community 90"
Cohesion: 0.25
Nodes (7): UnitReportDTO, EvidenceImages, Notes, Result, UnitId, UpdateUnitStatusDTO, Status

### Community 91 - "Community 91"
Cohesion: 0.29
Nodes (5): Role, Description, RoleID, RoleName, Users

### Community 92 - "Community 92"
Cohesion: 0.43
Nodes (7): FacilityLocationCard(), DEFAULT_CENTER, directionsUrl(), esc(), FacilityMap(), loadFacilityLocations(), useFacilityLocations()

### Community 94 - "Community 94"
Cohesion: 0.29
Nodes (5): UpdatePolicyGroupDTO, Config, EffectiveFrom, Note, Value

### Community 95 - "Community 95"
Cohesion: 0.29
Nodes (7): UpdateRentalPolicyDTO, DepositMonths, DepositPercent, GracePeriodDays, HoldMinutes, LateFeePerDay, RenewalNoticeDays

## Knowledge Gaps
- **679 isolated node(s):** `Today`, `Transfer`, `TopUp`, `Excess`, `IsSpecial` (+674 more)
  These have ≤1 connection - possible missing edges. (Counts symbols only; 896 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **23 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SelfStorageDbContext` connect `Community 21` to `Community 2`, `Community 4`, `Community 5`, `Community 6`, `Community 10`, `Community 16`, `Community 17`, `Community 18`, `Community 19`, `Community 20`, `Community 22`, `Community 23`, `Community 26`, `Community 27`, `Community 28`, `Community 29`, `Community 30`, `Community 31`, `Community 33`, `Community 34`, `Community 36`, `Community 37`, `Community 40`, `Community 43`, `Community 45`, `Community 46`, `Community 47`, `Community 50`, `Community 51`, `Community 53`, `Community 54`, `Community 55`, `Community 56`, `Community 58`, `Community 59`, `Community 60`, `Community 61`, `Community 63`, `Community 65`, `Community 67`, `Community 68`, `Community 74`, `Community 75`, `Community 82`, `Community 83`, `Community 84`, `Community 91`, `Community 93`, `Community 96`?**
  _High betweenness centrality (0.066) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `Reservation` (e.g. with `DatabaseSeeder.ResetAndSeedFull()` and `ReservationService.CreateReservationAsync()`) actually correct?**
  _`Reservation` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Today`, `Transfer`, `TopUp` to the rest of the system?**
  _679 weakly-connected nodes found - possible missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.07377295995182175 - nodes in this community are weakly interconnected._
- **Why does `HandoverTask` connect `Community 28` to `Community 32`, `Community 5`, `Community 27`, `Community 41`, `Community 40`, `Community 75`, `Community 43`, `Community 13`, `Community 47`, `Community 17`, `Community 20`, `Community 21`, `Community 22`, `Community 56`, `Community 25`, `Community 59`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.0824074074074074 - nodes in this community are weakly interconnected._
- **Why does `Facility` connect `Community 22` to `Community 0`, `Community 32`, `Community 4`, `Community 40`, `Community 75`, `Community 43`, `Community 46`, `Community 47`, `Community 60`, `Community 83`, `Community 51`, `Community 21`, `Community 20`, `Community 55`, `Community 56`, `Community 25`, `Community 59`, `Community 28`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._