# Graph Report - Self-Storage  (2026-11-10)

## Corpus Check
- 295 files · ~309,630 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 48 file(s) not represented in the graph (top: .css 34, (none) 6, .cmd 4)

## Summary
- 3022 nodes · 9698 edges · 113 communities (89 shown, 24 thin omitted)
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 879 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Cart, Booking & Reservations
- Facility Manager Portal
- Facility Staff Operations
- Facility Manager Portal
- Contracts & Signatures
- Module Cluster 5
- Business Operations & Pricing
- VNPay & Financial Transactions
- Module Cluster 8
- Facility Staff Operations
- Module Cluster 10
- Facility Manager Portal
- Contracts & Signatures
- Module Cluster 13
- Facility Manager Portal
- Contracts & Signatures
- Late Fees & Overdue Charges
- Facility Manager Portal
- Cart, Booking & Reservations
- Storage Unit Returns & Inspection
- Storage Unit Returns & Inspection
- Admin & User Management
- Facility Manager Portal
- Contracts & Signatures
- Contracts & Signatures
- Late Fees & Overdue Charges
- Module Cluster 26
- Module Cluster 27
- Facility Staff Operations
- Facility Staff Operations
- Contracts & Signatures
- Cart, Booking & Reservations
- Contracts & Signatures
- Storage Unit Returns & Inspection
- Facility Manager Portal
- Late Fees & Overdue Charges
- Late Fees & Overdue Charges
- VNPay & Financial Transactions
- Facility Manager Portal
- Storage Unit Returns & Inspection
- Module Cluster 40
- VNPay & Financial Transactions
- Contracts & Signatures
- Module Cluster 43
- Module Cluster 44
- Contracts & Signatures
- Business Operations & Pricing
- Storage Unit Returns & Inspection
- Late Fees & Overdue Charges
- Facility Staff Operations
- Storage Unit Returns & Inspection
- Module Cluster 51
- Module Cluster 52
- Cart, Booking & Reservations
- Late Fees & Overdue Charges
- Facility Staff Operations
- Contracts & Signatures
- Contracts & Signatures
- Facility Staff Operations
- Contracts & Signatures
- Module Cluster 60
- Database Entities & EF Core
- Module Cluster 62
- Cart, Booking & Reservations
- Cart, Booking & Reservations
- Module Cluster 65
- Cart, Booking & Reservations
- Late Fees & Overdue Charges
- VNPay & Financial Transactions
- Storage Unit Returns & Inspection
- Cart, Booking & Reservations
- Module Cluster 71
- Late Fees & Overdue Charges
- Module Cluster 73
- VNPay & Financial Transactions
- Module Cluster 75
- Storage Unit Returns & Inspection
- Module Cluster 77
- Facility Staff Operations
- Module Cluster 79
- Facility Manager Portal
- Module Cluster 81
- Module Cluster 82
- Cart, Booking & Reservations
- Facility Staff Operations
- Module Cluster 85
- Module Cluster 86
- Late Fees & Overdue Charges
- Module Cluster 88
- Module Cluster 89
- Module Cluster 90
- Storage Unit Returns & Inspection
- Module Cluster 92
- Facility Staff Operations
- Facility Staff Operations
- Facility Staff Operations
- Module Cluster 96
- Module Cluster 97
- Cart, Booking & Reservations
- Storage Unit Returns & Inspection
- Facility Manager Portal
- Cart, Booking & Reservations
- Late Fees & Overdue Charges
- Late Fees & Overdue Charges
- Module Cluster 107

## God Nodes (most connected - your core abstractions)
1. `Reservation` - 132 edges
2. `SelfStorageDbContext` - 100 edges
3. `User` - 98 edges
4. `SelfStorageAPI.Models` - 88 edges
5. `SelfStorageAPI.Interfaces` - 86 edges
6. `SelfStorageAPI.DTOs` - 67 edges
7. `Charge` - 61 edges
8. `HandoverTask` - 61 edges
9. `formatVnd()` - 60 edges
10. `apiGet()` - 59 edges

## Surprising Connections (you probably didn't know these)
- `BookingPage()` --calls--> `calculateEndDate()`  [EXTRACTED]
  frontend/src/App.jsx → frontend/src/storageRules.js
- `byTime()` --calls--> `parseTime()`  [EXTRACTED]
  frontend/src/opsLists.js → frontend/src/listKit.jsx
- `AuthController` --references--> `SelfStorageDbContext`  [EXTRACTED]
  backend/Controllers/AuthController.cs → backend/Data/SelfStorageDbContext.cs
- `AuthController` --references--> `IAuthService`  [EXTRACTED]
  backend/Controllers/AuthController.cs → backend/Interfaces/IAuthService.cs
- `AuthController` --references--> `IJwtTokenService`  [EXTRACTED]
  backend/Controllers/AuthController.cs → backend/Interfaces/IJwtTokenService.cs

## Import Cycles
- 2-file cycle: `frontend/src/ContractDocument.jsx -> frontend/src/ContractSignFlow.jsx -> frontend/src/ContractDocument.jsx`

## Communities (113 total, 24 thin omitted)

### Community 0 - "Cart, Booking & Reservations"
Cohesion: 0.07
Nodes (98): alertNotCustomer(), ArrowIcon(), AuthShell(), BookingDraftNote(), BookingLoginRedirect(), BookingPage(), CartIcon(), CartRoute() (+90 more)

### Community 1 - "Facility Manager Portal"
Cohesion: 0.04
Nodes (3): IManagerToolsRepository, FacilityManagementRepository, ManagerToolsRepository

### Community 2 - "Facility Staff Operations"
Cohesion: 0.07
Nodes (4): IFacilityManagementRepository, IFacilityManagementService, OperationsServiceResponse, FacilityManagementService

### Community 3 - "Facility Manager Portal"
Cohesion: 0.07
Nodes (83): Admin(), roleOptions, MyStoragePage(), DataGrid(), AddStaffModal(), appointmentKey(), Badge(), buildContractGroup() (+75 more)

### Community 4 - "Contracts & Signatures"
Cohesion: 0.07
Nodes (78): clearContractSignRequest(), confirmAfterDeposit(), CUSTOMER_SECTION_KEY, FOCUS_CONTRACT_KEY, focusContract(), OPEN_SECTION_EVENT, openCustomerSection(), peekContractSignRequest() (+70 more)

### Community 5 - "Module Cluster 5"
Cohesion: 0.07
Nodes (66): FacilityFloorPlan(), loadLeaflet(), COLORS, esc(), FacilityUnitsMap(), layoutUnits(), SPACING, STATUS_TEXT (+58 more)

### Community 6 - "Business Operations & Pricing"
Cohesion: 0.08
Nodes (60): apiGet(), apiPut(), BusinessLiveDashboard(), BusinessOperations(), BusinessPolicyEditor(), Choice(), clone(), DepositFields() (+52 more)

### Community 7 - "VNPay & Financial Transactions"
Cohesion: 0.05
Nodes (6): AdminController, IAdminService, ILateFeeRepository, HasActiveTransaction, AdminRepository, StaffToolsRepository

### Community 8 - "Module Cluster 8"
Cohesion: 0.07
Nodes (16): UnitSizesController, UnitSizeResponse, UpsertUnitSizeDTO, Dimensions, DisplayName, FacilityID, HeightM, IsActive (+8 more)

### Community 9 - "Facility Staff Operations"
Cohesion: 0.07
Nodes (56): ACCESS_TYPES, addMonths(), AuthFrame(), AWAITING, Badge(), checkHandover(), compressImage(), dayGroup() (+48 more)

### Community 10 - "Module Cluster 10"
Cohesion: 0.07
Nodes (12): UnitTypesController, UnitTypeResponse, UpsertUnitTypeDTO, Description, FacilityID, IsActive, Name, TypeName (+4 more)

### Community 11 - "Facility Manager Portal"
Cohesion: 0.09
Nodes (5): ManagerToolsController, OperationsController, PoliciesController, PriceBandsController, ReservationController

### Community 12 - "Contracts & Signatures"
Cohesion: 0.08
Nodes (49): ContractDetailModal(), contractStage(), money(), STAGE_LABEL, ContractDocument(), contractUnits(), fmtIso(), fmtTime() (+41 more)

### Community 13 - "Module Cluster 13"
Cohesion: 0.07
Nodes (19): PagedResult, PageQuery, FacilityId, IsPaged, Keyword, Page, PageSize, Q (+11 more)

### Community 14 - "Facility Manager Portal"
Cohesion: 0.09
Nodes (3): SelfStorageAPI.DTOs, SelfStorageAPI.Interfaces, SelfStorageAPI.Controllers

### Community 15 - "Contracts & Signatures"
Cohesion: 0.09
Nodes (10): ContractRenewalsController, Plan, PlanQuote, RenewalRules, RenewContractRequest, UnitQuote, Excess, TopUp (+2 more)

### Community 16 - "Late Fees & Overdue Charges"
Cohesion: 0.12
Nodes (6): WaiveLateFeeDTO, Reason, ILateFeeService, LateFeeResponse, ReturnDebtResult, LateFeeService

### Community 17 - "Facility Manager Portal"
Cohesion: 0.10
Nodes (4): IReturnInspectionRepository, HasActiveTransaction, ReturnInspectionRepository, HasActiveTransaction

### Community 18 - "Cart, Booking & Reservations"
Cohesion: 0.11
Nodes (38): announceDepositSuccess(), announceRenewalSuccess(), addToCart(), cancelHeldReservations(), CART_FIELDS, CART_LIMIT, CHECKOUT_LIMIT, clearCart() (+30 more)

### Community 19 - "Storage Unit Returns & Inspection"
Cohesion: 0.11
Nodes (40): browserFallback, DialogContext, DialogProvider(), DialogView(), TONE_ICONS, TONE_TITLES, useDialog(), compressImage() (+32 more)

### Community 20 - "Storage Unit Returns & Inspection"
Cohesion: 0.11
Nodes (4): CompleteRequest, FeeLine, ReturnRules, UnitReturnsController

### Community 21 - "Admin & User Management"
Cohesion: 0.10
Nodes (16): AdminActivityLogResponse, AdminUserResponse, UpdateAdminUserDTO, RoleName, Status, IAdminRepository, AdminServiceResponse, UserActivityLog (+8 more)

### Community 22 - "Facility Manager Portal"
Cohesion: 0.16
Nodes (4): IManagerToolsService, ManagerToolsResponse, AssignPlan, ManagerToolsService

### Community 23 - "Contracts & Signatures"
Cohesion: 0.15
Nodes (6): ReservationStatus, RoleNames, UnitStatus, SelfStorageAPI.Data, SelfStorageAPI.Repositories, SelfStorageAPI.Constants

### Community 24 - "Contracts & Signatures"
Cohesion: 0.10
Nodes (7): AvailableUnitData, FacilityCatalogData, ICatalogRepository, UnitCatalogData, IReservationHoldService, CatalogRepository, CatalogService

### Community 25 - "Late Fees & Overdue Charges"
Cohesion: 0.05
Nodes (35): Reservation, AppointmentDate, AppointmentTime, CancelledAt, CancelledByUser, CancelledByUserID, CancelReason, Charges (+27 more)

### Community 26 - "Module Cluster 26"
Cohesion: 0.06
Nodes (31): Facility, Address, City, ContactPhone, CreatedAt, Description, District, FacilityID (+23 more)

### Community 27 - "Module Cluster 27"
Cohesion: 0.11
Nodes (32): API_URL, apiDelete(), ApiError, apiRequest(), codeForStatus(), getCurrentUser(), getErrorMessage(), isUsefulMessage() (+24 more)

### Community 29 - "Facility Staff Operations"
Cohesion: 0.06
Nodes (32): SelfStorageDbContext, AppErrorMessages, CancellationRules, Charges, Contracts, ContractSignatures, ContractTypes, EmailVerificationCodes (+24 more)

### Community 30 - "Contracts & Signatures"
Cohesion: 0.06
Nodes (33): ReturnInspectionRow, ConditionResult, ConfirmDeadline, ContractNumber, CustomerEmail, CustomerID, CustomerImageCount, CustomerImages (+25 more)

### Community 31 - "Cart, Booking & Reservations"
Cohesion: 0.12
Nodes (5): IReservationRepository, IReservationService, ReservationServiceResponse, ReservationRepository, ReservationService

### Community 32 - "Contracts & Signatures"
Cohesion: 0.09
Nodes (18): ContractsController, ContractSignatureStatusResponse, CreateContractSignatureRequest, AcceptedTerms, SignatureImage, TermsVersion, SaveContractSignatureResult, IContractSignatureService (+10 more)

### Community 33 - "Storage Unit Returns & Inspection"
Cohesion: 0.06
Nodes (29): Charge, Amount, ChargeID, ChargeType, CreatedAt, CreatedByUser, CreatedByUserID, Description (+21 more)

### Community 34 - "Facility Manager Portal"
Cohesion: 0.07
Nodes (25): HandoverTask, ActualAt, AssignedByID, AssignedByUser, AssignedStaff, AssignedStaffID, ConditionResult, CreatedAt (+17 more)

### Community 35 - "Late Fees & Overdue Charges"
Cohesion: 0.13
Nodes (6): CreateVnPayRequest, ProcessResult, VnPayController, Configured, HashSecret, TmnCode

### Community 37 - "VNPay & Financial Transactions"
Cohesion: 0.08
Nodes (19): PaymentController, CreatePaymentDTO, Amount, PaymentType, ReservationID, CreateReservationDTO, Months, PaymentPlan (+11 more)

### Community 38 - "Facility Manager Portal"
Cohesion: 0.20
Nodes (4): ReturnRequest, Candidate, Slot, StaffAssignmentPolicy

### Community 39 - "Storage Unit Returns & Inspection"
Cohesion: 0.08
Nodes (25): Payment, Amount, CallbackLogs, Charges, ConfirmedAt, CreatedAt, CreatedByUser, CreatedByUserID (+17 more)

### Community 40 - "Module Cluster 40"
Cohesion: 0.07
Nodes (26): EmailVerificationCode, ClosedAt, CloseReason, CodeHash, CreatedAt, Email, ExpiresAt, FailedAttempts (+18 more)

### Community 41 - "VNPay & Financial Transactions"
Cohesion: 0.13
Nodes (6): CancelRequest, RefundResult, ReservationCancellationsController, HashSecret, SandboxRefundFallback, TmnCode

### Community 42 - "Contracts & Signatures"
Cohesion: 0.08
Nodes (26): CancellationRuleDTO, DaysBeforeStart, RefundPercent, ContractTermDiscountDTO, DiscountPercent, Months, ExtraFeeRuleDTO, Amount (+18 more)

### Community 43 - "Module Cluster 43"
Cohesion: 0.09
Nodes (19): CancellationRule, CancellationRuleID, DaysBeforeStart, RefundPercent, RentalPolicy, RentalPolicyID, RentalPolicy, CancellationRules (+11 more)

### Community 44 - "Module Cluster 44"
Cohesion: 0.18
Nodes (23): addDaysISO(), addMonthsISO(), clearSimulatedDate(), DEMO_DATE_STORAGE_KEY, formatDateVN(), formatISODate(), getRealTodayISO(), getSimulatedDateISO() (+15 more)

### Community 45 - "Contracts & Signatures"
Cohesion: 0.17
Nodes (4): PaymentPlan, CustomerReservationsController, RentPaymentsController, RentPaymentRules

### Community 46 - "Business Operations & Pricing"
Cohesion: 0.13
Nodes (15): BandInfo, IsSpecial, Locked, Candidate, PriceBandRulesController, UpsertPriceBandDTO, Code, IsActive (+7 more)

### Community 48 - "Late Fees & Overdue Charges"
Cohesion: 0.08
Nodes (24): ReservationUnit, AssignedAt, AssignedByUser, AssignedByUserID, Charges, Facility, FacilityID, HandedOverAt (+16 more)

### Community 49 - "Facility Staff Operations"
Cohesion: 0.08
Nodes (24): User, CreatedAt, Email, EmailVerificationCodes, EmailVerified, FacilityStaffs, FailedLoginCount, FullName (+16 more)

### Community 51 - "Module Cluster 51"
Cohesion: 0.09
Nodes (21): UnitSize, AreaM2, CreatedAt, CreatedByUser, CreatedByUserID, Dimensions, DisplayName, FacilityUnitSizes (+13 more)

### Community 52 - "Module Cluster 52"
Cohesion: 0.09
Nodes (23): FacilityUnitType, AddedAt, AddedByUser, AddedByUserID, Facility, FacilityID, IsActive, RentalRates (+15 more)

### Community 53 - "Cart, Booking & Reservations"
Cohesion: 0.09
Nodes (23): StorageUnit, BasePrice, CreatedAt, Facility, FacilityID, Floor, HandoverTasks, LocationNote (+15 more)

### Community 54 - "Late Fees & Overdue Charges"
Cohesion: 0.12
Nodes (10): UpdatePolicyGroupDTO, Config, EffectiveFrom, Note, Value, LateFeeRules, Policy, PeriodLabel (+2 more)

### Community 57 - "Contracts & Signatures"
Cohesion: 0.13
Nodes (13): DatabaseSeeder, ContractType, ContractTypeID, DiscountRate, IsActive, RentalMonths, Reservations, TypeName (+5 more)

### Community 58 - "Facility Staff Operations"
Cohesion: 0.11
Nodes (17): Contract, ActualEndDate, ContractID, ContractNumber, ContractStatus, CreatedAt, CreatedByUser, CreatedByUserID (+9 more)

### Community 59 - "Contracts & Signatures"
Cohesion: 0.11
Nodes (19): SupportRequest, AssignedStaff, AssignedStaffID, Category, Contract, ContractID, CreatedAt, Customer (+11 more)

### Community 60 - "Module Cluster 60"
Cohesion: 0.13
Nodes (16): dependencies, react@^18.3.1, react-dom@^18.3.1, devDependencies, vite@^5.4.11, @vitejs/plugin-react@^4.3.4, name, private (+8 more)

### Community 61 - "Database Entities & EF Core"
Cohesion: 0.12
Nodes (14): AppErrorMessage, ErrorKey, HttpStatus, MessageVi, StatusChangeLog, ChangedAt, ChangedByUser, ChangedByUserID (+6 more)

### Community 62 - "Module Cluster 62"
Cohesion: 0.12
Nodes (15): SizeCategory, CategoryCode, CategoryName, CodePrefix, IsActive, MaxMonthlyPrice, MaxVolumeM3, MinMonthlyPrice (+7 more)

### Community 63 - "Cart, Booking & Reservations"
Cohesion: 0.12
Nodes (17): ReservationItem, CreatedAt, DiscountPercent, EffectiveMonthlyPrice, Facility, FacilityID, MonthlyPrice, Quantity (+9 more)

### Community 64 - "Cart, Booking & Reservations"
Cohesion: 0.12
Nodes (17): UnitAccess, AccessID, AccessType, AccessValue, ClosedAt, IssuedAt, IssuedByUser, IssuedByUserID (+9 more)

### Community 65 - "Module Cluster 65"
Cohesion: 0.27
Nodes (14): BusinessFacilityForm(), BusinessFacilitiesByArea(), BusinessPerformance(), BusinessReportsCenter(), downloadCsv(), money(), OccupancyBar(), percent() (+6 more)

### Community 66 - "Cart, Booking & Reservations"
Cohesion: 0.15
Nodes (9): HandoverController, CompleteHandoverDTO, AccessType, AccessValue, Notes, ReservationID, HandoverServiceResponse, IHandoverService (+1 more)

### Community 67 - "Late Fees & Overdue Charges"
Cohesion: 0.14
Nodes (12): FeePolicy, Charges, CreatedAt, FeeCategory, FeeCode, FeeName, FeePolicyID, IsActive (+4 more)

### Community 69 - "Storage Unit Returns & Inspection"
Cohesion: 0.17
Nodes (5): NewReturnInspection, NewReturnInspectionFee, InspectionFeeInput, InspectionRecordResult, Rules

### Community 70 - "Cart, Booking & Reservations"
Cohesion: 0.12
Nodes (16): RentalRate, Facility, FacilityID, FacilityUnitSize, FacilityUnitType, MonthlyPrice, RentalRateID, ReservationItems (+8 more)

### Community 71 - "Module Cluster 71"
Cohesion: 0.13
Nodes (15): ASPNETCORE_ENVIRONMENT, applicationUrl, commandName, dotnetRunMessages, environmentVariables, launchBrowser, applicationUrl, commandName (+7 more)

### Community 72 - "Late Fees & Overdue Charges"
Cohesion: 0.19
Nodes (3): FacilityLocationsController, LateFeesController, StorageUnitsController

### Community 73 - "Module Cluster 73"
Cohesion: 0.13
Nodes (15): CreateFacilityDTO, Address, City, ContactPhone, DepositMonths, DepositPercent, Description, District (+7 more)

### Community 74 - "VNPay & Financial Transactions"
Cohesion: 0.13
Nodes (14): PaymentCallbackLog, CallbackID, Note, OrderCode, Payload, Payment, PaymentID, ProcessResult (+6 more)

### Community 75 - "Module Cluster 75"
Cohesion: 0.17
Nodes (13): dependencies, dotenv@^18.0.9, @neon/config@^1.9.6, @neon/env@^1.6.6, pg@^8.23.1, name, private, scripts (+5 more)

### Community 76 - "Storage Unit Returns & Inspection"
Cohesion: 0.18
Nodes (9): DisputeInspectionDTO, Images, Reason, ResolveInspectionDTO, Fees, Notes, ResolveInspectionFeeDTO, FeeId (+1 more)

### Community 77 - "Module Cluster 77"
Cohesion: 0.14
Nodes (14): UpdateFacilityDTO, Address, City, ContactPhone, DepositMonths, DepositPercent, Description, District (+6 more)

### Community 79 - "Module Cluster 79"
Cohesion: 0.19
Nodes (6): AuthResult, ErrorMessage, IsSuccess, User, IAuthService, AuthService

### Community 80 - "Facility Manager Portal"
Cohesion: 0.15
Nodes (12): AssignTaskDTO, Notes, ReservationId, ScheduledDate, ScheduledTime, StaffUserId, TaskType, UnitId (+4 more)

### Community 81 - "Module Cluster 81"
Cohesion: 0.17
Nodes (11): LoginRequestDTO, Email, Password, RegisterRequestDTO, DateOfBirth, Email, FullName, Gender (+3 more)

### Community 82 - "Module Cluster 82"
Cohesion: 0.17
Nodes (12): CreateStorageUnitDTO, BasePrice, FacilityID, Floor, LocationNote, Size, SizeM2, Status (+4 more)

### Community 83 - "Cart, Booking & Reservations"
Cohesion: 0.24
Nodes (3): IReservationHoldRepository, ReservationHoldRepository, ReservationHoldService

### Community 86 - "Module Cluster 86"
Cohesion: 0.20
Nodes (8): IJwtTokenService, JwtOptions, AllowLegacyEmailHeader, Audience, ExpiresMinutes, Issuer, Key, JwtTokenService

### Community 88 - "Module Cluster 88"
Cohesion: 0.24
Nodes (3): BusinessClock, Today, JwtIdentityMiddleware

### Community 89 - "Module Cluster 89"
Cohesion: 0.20
Nodes (10): FacilityUnitSize, AddedAt, AddedByUser, AddedByUserID, Facility, FacilityID, IsActive, RentalRates (+2 more)

### Community 90 - "Module Cluster 90"
Cohesion: 0.28
Nodes (3): CatalogController, CatalogServiceResponse, ICatalogService

### Community 92 - "Module Cluster 92"
Cohesion: 0.22
Nodes (9): AuthResponseDTO, Email, FullName, PhoneNumber, RoleName, Status, Token, TokenExpiresAt (+1 more)

### Community 93 - "Facility Staff Operations"
Cohesion: 0.22
Nodes (7): UnitReportDTO, EvidenceImages, Notes, Result, UnitId, UpdateUnitStatusDTO, Status

### Community 94 - "Facility Staff Operations"
Cohesion: 0.22
Nodes (8): AssignFacilityStaffDTO, StaffEmail, AssignReservationDTO, UnitNumber, UpdateRentalRateDTO, BasePrice, UnitSizeID, UnitTypeID

### Community 95 - "Facility Staff Operations"
Cohesion: 0.22
Nodes (9): FacilityStaff, AssignedDate, AssignmentID, Facility, FacilityID, StaffID, Status, User (+1 more)

### Community 96 - "Module Cluster 96"
Cohesion: 0.22
Nodes (8): net10.0, BCrypt.Net-Next (4.2.0), Microsoft.AspNetCore.Authentication.JwtBearer (10.0.0), Microsoft.AspNetCore.OpenApi (10.0.12), Microsoft.EntityFrameworkCore.Design (10.0.12), Microsoft.EntityFrameworkCore.SqlServer (10.0.12), Npgsql.EntityFrameworkCore.PostgreSQL (10.0.3), Microsoft.NET.Sdk.Web

### Community 97 - "Module Cluster 97"
Cohesion: 0.22
Nodes (9): PolicyVersionEntry, Config, CreatedAt, CreatedBy, EffectiveFrom, Key, Note, Status (+1 more)

### Community 99 - "Storage Unit Returns & Inspection"
Cohesion: 0.25
Nodes (8): ReturnInspectionFeeRow, Description, FeeCode, FeeID, FeePolicyID, FinalAmount, InspectionID, ProposedAmount

### Community 100 - "Facility Manager Portal"
Cohesion: 0.32
Nodes (6): Chevron(), GROUPS, HINTS, ICONS, ManagerNav(), useManagerBadges()

### Community 102 - "Late Fees & Overdue Charges"
Cohesion: 0.29
Nodes (7): UpdateRentalPolicyDTO, DepositMonths, DepositPercent, GracePeriodDays, HoldMinutes, LateFeePerDay, RenewalNoticeDays

## Knowledge Gaps
- **743 isolated node(s):** `Today`, `Transfer`, `TopUp`, `Excess`, `IsSpecial` (+738 more)
  These have ≤1 connection - possible missing edges. (Counts symbols only; 1002 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **24 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SelfStorageDbContext` connect `Facility Staff Operations` to `Facility Manager Portal`, `VNPay & Financial Transactions`, `Module Cluster 8`, `Module Cluster 10`, `Module Cluster 13`, `Contracts & Signatures`, `Facility Manager Portal`, `Storage Unit Returns & Inspection`, `Admin & User Management`, `Contracts & Signatures`, `Contracts & Signatures`, `Late Fees & Overdue Charges`, `Module Cluster 26`, `Cart, Booking & Reservations`, `Contracts & Signatures`, `Storage Unit Returns & Inspection`, `Facility Manager Portal`, `Late Fees & Overdue Charges`, `Storage Unit Returns & Inspection`, `Module Cluster 40`, `VNPay & Financial Transactions`, `Module Cluster 43`, `Contracts & Signatures`, `Business Operations & Pricing`, `Late Fees & Overdue Charges`, `Facility Staff Operations`, `Module Cluster 51`, `Module Cluster 52`, `Cart, Booking & Reservations`, `Contracts & Signatures`, `Contracts & Signatures`, `Facility Staff Operations`, `Contracts & Signatures`, `Database Entities & EF Core`, `Module Cluster 62`, `Cart, Booking & Reservations`, `Cart, Booking & Reservations`, `Late Fees & Overdue Charges`, `VNPay & Financial Transactions`, `Cart, Booking & Reservations`, `Late Fees & Overdue Charges`, `VNPay & Financial Transactions`, `Facility Staff Operations`, `Cart, Booking & Reservations`, `Module Cluster 85`, `Late Fees & Overdue Charges`, `Module Cluster 89`, `Facility Staff Operations`, `Cart, Booking & Reservations`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `Reservation` (e.g. with `DatabaseSeeder.ResetAndSeedFull()` and `ReservationService.CreateReservationAsync()`) actually correct?**
  _`Reservation` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Today`, `Transfer`, `TopUp` to the rest of the system?**
  _743 weakly-connected nodes found - possible missing edges._
- **Should `Cart, Booking & Reservations` be split into smaller, more focused modules?**
  _Cohesion score 0.06590739357729648 - nodes in this community are weakly interconnected._
- **Why does `Reservation` connect `Late Fees & Overdue Charges` to `Facility Manager Portal`, `VNPay & Financial Transactions`, `Module Cluster 13`, `Contracts & Signatures`, `Late Fees & Overdue Charges`, `Facility Manager Portal`, `Storage Unit Returns & Inspection`, `Facility Manager Portal`, `Module Cluster 26`, `Facility Staff Operations`, `Facility Staff Operations`, `Cart, Booking & Reservations`, `Storage Unit Returns & Inspection`, `Facility Manager Portal`, `Late Fees & Overdue Charges`, `Facility Manager Portal`, `Storage Unit Returns & Inspection`, `VNPay & Financial Transactions`, `Contracts & Signatures`, `Late Fees & Overdue Charges`, `Facility Staff Operations`, `Storage Unit Returns & Inspection`, `Late Fees & Overdue Charges`, `Facility Staff Operations`, `Contracts & Signatures`, `Contracts & Signatures`, `Facility Staff Operations`, `Database Entities & EF Core`, `Cart, Booking & Reservations`, `Cart, Booking & Reservations`, `VNPay & Financial Transactions`, `Storage Unit Returns & Inspection`, `Cart, Booking & Reservations`, `Late Fees & Overdue Charges`, `Cart, Booking & Reservations`, `Late Fees & Overdue Charges`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **Should `Facility Manager Portal` be split into smaller, more focused modules?**
  _Cohesion score 0.04122861265718408 - nodes in this community are weakly interconnected._
- **Why does `Contract` connect `Facility Staff Operations` to `Contracts & Signatures`, `Facility Manager Portal`, `Cart, Booking & Reservations`, `Late Fees & Overdue Charges`, `Facility Manager Portal`, `Contracts & Signatures`, `Module Cluster 13`, `Contracts & Signatures`, `Facility Staff Operations`, `Database Entities & EF Core`, `Facility Staff Operations`, `Contracts & Signatures`, `Contracts & Signatures`, `Facility Staff Operations`, `Facility Staff Operations`, `Late Fees & Overdue Charges`, `Cart, Booking & Reservations`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._