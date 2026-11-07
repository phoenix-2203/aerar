// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// USDC v2.2 (FiatToken) surface the Vault needs.
interface IUSDC {
    function DOMAIN_SEPARATOR() external view returns (bytes32);
    function authorizationState(address authorizer, bytes32 nonce) external view returns (bool);
    function transfer(address to, uint256 value) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

/// @title AerarVault
/// @notice A USDC wallet owned by one person. Aerar (the operator) can only move money out of it through x402,
/// and only inside limits the owner set on-chain: who can be paid, how much per payment, how much per period,
/// until when. Aerar cannot change those limits, withdraw, or pay anyone else. The owner can pause, revoke a
/// mandate, change the operator, or withdraw at any time.
/// @dev x402 settles with USDC's `transferWithAuthorization(..., bytes signature)`, which accepts ERC-1271
/// signatures from contract wallets. The operator first calls `authorize`, which checks the mandate, books the
/// spend, and computes the exact EIP-3009 digest (payee, amount, validity window, nonce) itself. `isValidSignature`
/// then approves that digest and nothing else, so the facilitator can settle exactly what the mandate allowed.
contract AerarVault {
    bytes32 internal constant TRANSFER_WITH_AUTHORIZATION_TYPEHASH =
        keccak256("TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)");
    bytes4 internal constant ERC1271_MAGIC = 0x1626ba7e;
    bytes4 internal constant ERC1271_INVALID = 0xffffffff;
    /// An approved payment must settle within this window, so an unused approval can't linger.
    uint256 public constant MAX_VALIDITY = 15 minutes;

    struct Mandate {
        uint128 maxPerPayment; // USDC base units (6 decimals)
        uint128 periodLimit;
        uint64 period; // seconds; the limit resets every period
        uint64 expiresAt;
        uint64 periodStart;
        bool active;
        uint128 spentInPeriod;
        uint128 spentTotal;
    }

    struct Approval {
        bytes32 mandateId;
        uint128 value;
        uint64 validBefore;
        uint64 periodStart; // the period the spend was booked in
        bytes32 nonce;
    }

    address public immutable owner;
    IUSDC public immutable usdc;
    address public operator;
    bool public paused;

    mapping(bytes32 => Mandate) public mandates;
    mapping(bytes32 => mapping(address => bool)) public payeeAllowed;
    mapping(bytes32 => Approval) public approvals; // EIP-3009 digest => approval

    event MandateSet(bytes32 indexed id, uint128 maxPerPayment, uint128 periodLimit, uint64 period, uint64 expiresAt);
    event PayeeSet(bytes32 indexed id, address indexed payee, bool allowed);
    event MandateRevoked(bytes32 indexed id);
    event PaymentAuthorized(bytes32 indexed id, address indexed payee, uint256 value, bytes32 digest, bytes32 nonce);
    event ApprovalReleased(bytes32 indexed id, bytes32 digest, uint256 value);
    event OperatorChanged(address indexed operator);
    event Paused(bool paused);
    event Withdrawn(address indexed to, uint256 value);

    error NotOwner();
    error NotOperator();
    error VaultPaused();
    error NoMandate();
    error MandateExpired();
    error PayeeNotAllowed();
    error OverPerPaymentLimit();
    error OverPeriodLimit();
    error BadValidity();
    error AlreadyApproved();
    error NotReleasable();
    error BadMandate();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address owner_, address operator_, IUSDC usdc_) {
        owner = owner_;
        operator = operator_;
        usdc = usdc_;
        emit OperatorChanged(operator_);
    }

    // ---------------------------------------------------------------- owner

    /// Create or replace a mandate (one per Aerar task). Spend so far in the current period is kept.
    function setMandate(
        bytes32 id,
        address[] calldata payees,
        uint128 maxPerPayment,
        uint128 periodLimit,
        uint64 period,
        uint64 expiresAt
    ) external onlyOwner {
        if (id == bytes32(0) || maxPerPayment == 0 || maxPerPayment > periodLimit || period == 0 || expiresAt <= block.timestamp)
            revert BadMandate();
        Mandate storage m = mandates[id];
        m.maxPerPayment = maxPerPayment;
        m.periodLimit = periodLimit;
        m.period = period;
        m.expiresAt = expiresAt;
        m.active = true;
        if (m.periodStart == 0) m.periodStart = uint64(block.timestamp);
        emit MandateSet(id, maxPerPayment, periodLimit, period, expiresAt);
        for (uint256 i; i < payees.length; ++i) {
            payeeAllowed[id][payees[i]] = true;
            emit PayeeSet(id, payees[i], true);
        }
    }

    function setPayee(bytes32 id, address payee, bool allowed) external onlyOwner {
        payeeAllowed[id][payee] = allowed;
        emit PayeeSet(id, payee, allowed);
    }

    /// Stops a mandate at once, including approvals that haven't settled yet.
    function revoke(bytes32 id) external onlyOwner {
        mandates[id].active = false;
        emit MandateRevoked(id);
    }

    /// Stops every mandate at once, including approvals that haven't settled yet.
    function setPaused(bool p) external onlyOwner {
        paused = p;
        emit Paused(p);
    }

    function setOperator(address op) external onlyOwner {
        operator = op;
        emit OperatorChanged(op);
    }

    function withdraw(address to, uint256 value) external onlyOwner {
        require(usdc.transfer(to, value), "transfer failed");
        emit Withdrawn(to, value);
    }

    // ------------------------------------------------------------- operator

    /// Book one x402 payment against a mandate and approve exactly its EIP-3009 authorization.
    function authorize(
        bytes32 id,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce
    ) external returns (bytes32 digest) {
        if (msg.sender != operator) revert NotOperator();
        if (paused) revert VaultPaused();
        Mandate storage m = mandates[id];
        if (!m.active) revert NoMandate();
        if (block.timestamp >= m.expiresAt) revert MandateExpired();
        if (!payeeAllowed[id][to]) revert PayeeNotAllowed();
        if (value == 0 || value > m.maxPerPayment) revert OverPerPaymentLimit();
        if (validBefore <= block.timestamp || validBefore > block.timestamp + MAX_VALIDITY || validAfter >= validBefore)
            revert BadValidity();
        if (block.timestamp >= uint256(m.periodStart) + m.period) {
            m.periodStart = uint64(block.timestamp);
            m.spentInPeriod = 0;
        }
        if (uint256(m.spentInPeriod) + value > m.periodLimit) revert OverPeriodLimit();

        digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                usdc.DOMAIN_SEPARATOR(),
                keccak256(abi.encode(TRANSFER_WITH_AUTHORIZATION_TYPEHASH, address(this), to, value, validAfter, validBefore, nonce))
            )
        );
        if (approvals[digest].mandateId != bytes32(0)) revert AlreadyApproved();
        m.spentInPeriod += uint128(value);
        m.spentTotal += uint128(value);
        approvals[digest] = Approval(id, uint128(value), uint64(validBefore), m.periodStart, nonce);
        emit PaymentAuthorized(id, to, value, digest, nonce);
    }

    /// Give back the budget of an approval that expired without settling. Anyone can call it.
    function release(bytes32 digest) external {
        Approval memory a = approvals[digest];
        if (a.mandateId == bytes32(0) || block.timestamp < a.validBefore || usdc.authorizationState(address(this), a.nonce))
            revert NotReleasable();
        delete approvals[digest];
        Mandate storage m = mandates[a.mandateId];
        if (m.periodStart == a.periodStart) m.spentInPeriod -= a.value;
        m.spentTotal -= a.value;
        emit ApprovalReleased(a.mandateId, digest, a.value);
    }

    // -------------------------------------------------------------- ERC-1271

    function isValidSignature(bytes32 digest, bytes calldata) external view returns (bytes4) {
        Approval storage a = approvals[digest];
        if (a.mandateId == bytes32(0) || paused) return ERC1271_INVALID;
        Mandate storage m = mandates[a.mandateId];
        if (!m.active || block.timestamp >= m.expiresAt || block.timestamp >= a.validBefore) return ERC1271_INVALID;
        return ERC1271_MAGIC;
    }

    // ----------------------------------------------------------------- views

    function remaining(bytes32 id) external view returns (uint256 inPeriod, uint256 balance) {
        Mandate storage m = mandates[id];
        uint256 spent = block.timestamp >= uint256(m.periodStart) + m.period ? 0 : m.spentInPeriod;
        inPeriod = m.periodLimit > spent ? m.periodLimit - spent : 0;
        balance = usdc.balanceOf(address(this));
    }
}

/// @title AerarVaultFactory
/// @notice Anyone can create their own Vault; one per wallet. The caller becomes its only owner.
contract AerarVaultFactory {
    IUSDC public immutable usdc;
    mapping(address => address) public vaultOf;

    event VaultCreated(address indexed owner, address indexed vault, address operator);

    constructor(IUSDC usdc_) {
        usdc = usdc_;
    }

    function create(address operator) external returns (AerarVault vault) {
        require(vaultOf[msg.sender] == address(0), "vault exists");
        vault = new AerarVault{salt: bytes32(uint256(uint160(msg.sender)))}(msg.sender, operator, usdc);
        vaultOf[msg.sender] = address(vault);
        emit VaultCreated(msg.sender, address(vault), operator);
    }
}
