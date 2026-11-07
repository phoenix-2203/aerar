// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// USDC v2.2 (FiatToken) surface the escrow needs.
interface IUSDCEscrow {
    function DOMAIN_SEPARATOR() external view returns (bytes32);
    function authorizationState(address authorizer, bytes32 nonce) external view returns (bool);
    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes memory signature
    ) external;
    function transfer(address to, uint256 value) external returns (bool);
}

/// @title AerarEscrow
/// @notice Refunds for x402 purchases that weren't delivered. A shop that opts in names its escrow as the x402
/// `payTo`. Payments then land here, not with the shop, and wait a short delivery window:
///   - delivered: Aerar confirms (or the window passes) and anyone can release the money to the shop;
///   - not delivered: Aerar refunds it to the payer within the window, with the reason's hash on-chain.
/// The shop is fixed when the escrow is created, so a payer (or a Vault's payee list) that approves this escrow has
/// approved exactly one shop. Neither Aerar nor the shop can send the money anywhere else: only back to the payer or
/// on to the shop. The shop can always refund a payment itself.
/// @dev Works with standard x402 `exact` settlement: a facilitator submits USDC `transferWithAuthorization` with
/// `to = this escrow`, then anyone calls `record` with the same authorization to attribute the funds (the escrow
/// re-checks the payer's signature over that exact transfer). `record` can also settle the authorization itself.
contract AerarEscrow {
    bytes32 internal constant TRANSFER_WITH_AUTHORIZATION_TYPEHASH =
        keccak256("TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)");
    bytes4 internal constant ERC1271_MAGIC = 0x1626ba7e;
    uint64 public constant MIN_WINDOW = 5 minutes;
    uint64 public constant MAX_WINDOW = 7 days;

    enum State {
        None,
        Held,
        Released,
        Refunded
    }

    struct Hold {
        address payer;
        uint128 value;
        uint64 releaseAfter;
        State state;
    }

    IUSDCEscrow public immutable usdc;
    /// Who gets paid when a payment is released. Fixed for the life of the escrow.
    address public immutable shop;
    /// Who judges delivery (Aerar's operator key). Fixed: the shop can't swap in a judge of its own.
    address public immutable arbiter;
    /// How long a payment waits for a delivery verdict before it can be released to the shop.
    uint64 public immutable window;

    mapping(bytes32 => Hold) public holds; // keccak256(payer, nonce) => hold
    uint256 public held; // total currently held

    event Recorded(bytes32 indexed id, address indexed payer, uint256 value, uint64 releaseAfter);
    event Released(bytes32 indexed id, address indexed shop, uint256 value, bool early);
    event Refunded(bytes32 indexed id, address indexed payer, uint256 value, bytes32 reason, address by);

    error BadWindow();
    error NotPaidToEscrow();
    error BadSignature();
    error AlreadyRecorded();
    error NotHeld();
    error TooEarly();
    error WindowClosed();
    error NotAllowed();

    constructor(IUSDCEscrow usdc_, address shop_, address arbiter_, uint64 window_) {
        if (window_ < MIN_WINDOW || window_ > MAX_WINDOW || shop_ == address(0) || arbiter_ == address(0)) revert BadWindow();
        usdc = usdc_;
        shop = shop_;
        arbiter = arbiter_;
        window = window_;
    }

    function holdId(address payer, bytes32 nonce) public pure returns (bytes32) {
        return keccak256(abi.encode(payer, nonce));
    }

    /// Attribute one x402 payment to its payer and start its delivery window. Anyone can call it with the payer's
    /// authorization. If the facilitator hasn't settled it yet, the escrow settles it itself.
    function record(
        address payer,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes calldata signature
    ) external returns (bytes32 id) {
        id = holdId(payer, nonce);
        if (holds[id].state != State.None) revert AlreadyRecorded();
        if (value == 0 || value > type(uint128).max) revert NotPaidToEscrow();
        if (usdc.authorizationState(payer, nonce)) {
            // Already settled (normal x402 flow): only count it if the payer really signed this exact transfer to us.
            bytes32 digest = keccak256(
                abi.encodePacked(
                    "\x19\x01",
                    usdc.DOMAIN_SEPARATOR(),
                    keccak256(abi.encode(TRANSFER_WITH_AUTHORIZATION_TYPEHASH, payer, address(this), value, validAfter, validBefore, nonce))
                )
            );
            if (!_validSignature(payer, digest, signature)) revert BadSignature();
        } else {
            usdc.transferWithAuthorization(payer, address(this), value, validAfter, validBefore, nonce, signature);
        }
        uint64 releaseAfter = uint64(block.timestamp) + window;
        holds[id] = Hold(payer, uint128(value), releaseAfter, State.Held);
        held += value;
        emit Recorded(id, payer, value, releaseAfter);
    }

    /// Delivery confirmed by Aerar: pay the shop now instead of waiting for the window.
    function confirm(bytes32 id) external {
        if (msg.sender != arbiter) revert NotAllowed();
        _release(id, true);
    }

    /// The window passed without a refund: anyone can pay the shop.
    function release(bytes32 id) external {
        if (holds[id].state != State.Held) revert NotHeld();
        if (block.timestamp < holds[id].releaseAfter) revert TooEarly();
        _release(id, false);
    }

    /// Not delivered: send the money back to the payer. Aerar can do it within the window; the shop at any time
    /// before release. `reason` is a hash of the evidence (e.g. the delivery check), kept on-chain.
    function refund(bytes32 id, bytes32 reason) external {
        Hold storage h = holds[id];
        if (h.state != State.Held) revert NotHeld();
        if (msg.sender == arbiter) {
            if (block.timestamp >= h.releaseAfter) revert WindowClosed();
        } else if (msg.sender != shop) revert NotAllowed();
        h.state = State.Refunded;
        held -= h.value;
        require(usdc.transfer(h.payer, h.value), "transfer failed");
        emit Refunded(id, h.payer, h.value, reason, msg.sender);
    }

    function _release(bytes32 id, bool early) internal {
        Hold storage h = holds[id];
        if (h.state != State.Held) revert NotHeld();
        h.state = State.Released;
        held -= h.value;
        require(usdc.transfer(shop, h.value), "transfer failed");
        emit Released(id, shop, h.value, early);
    }

    function _validSignature(address signer, bytes32 digest, bytes calldata sig) internal view returns (bool) {
        if (signer.code.length == 0) {
            if (sig.length != 65) return false;
            bytes32 r = bytes32(sig[0:32]);
            bytes32 s = bytes32(sig[32:64]);
            uint8 v = uint8(sig[64]);
            return ecrecover(digest, v, r, s) == signer;
        }
        (bool ok, bytes memory ret) = signer.staticcall(abi.encodeWithSelector(ERC1271_MAGIC, digest, sig));
        return ok && ret.length == 32 && abi.decode(ret, (bytes4)) == ERC1271_MAGIC;
    }
}

/// @title AerarEscrowFactory
/// @notice One escrow per (shop, arbiter, window). A shop creates its own; the address is deterministic, so payers can
/// check that an x402 `payTo` really is the escrow for the shop they meant to pay.
contract AerarEscrowFactory {
    IUSDCEscrow public immutable usdc;
    mapping(address => mapping(address => address)) public escrowOf; // shop => arbiter => escrow

    event EscrowCreated(address indexed shop, address indexed arbiter, address escrow, uint64 window);

    constructor(IUSDCEscrow usdc_) {
        usdc = usdc_;
    }

    function create(address arbiter, uint64 window) external returns (AerarEscrow e) {
        require(escrowOf[msg.sender][arbiter] == address(0), "escrow exists");
        e = new AerarEscrow{salt: keccak256(abi.encode(msg.sender, arbiter))}(usdc, msg.sender, arbiter, window);
        escrowOf[msg.sender][arbiter] = address(e);
        emit EscrowCreated(msg.sender, arbiter, address(e), window);
    }
}
