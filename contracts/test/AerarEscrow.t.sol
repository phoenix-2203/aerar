// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AerarEscrow, AerarEscrowFactory, IUSDCEscrow} from "../src/AerarEscrow.sol";
import {AerarVault, AerarVaultFactory, IUSDC} from "../src/AerarVault.sol";
import {MockUSDC} from "./MockUSDC.sol";

interface Vm {
    function warp(uint256) external;
    function prank(address) external;
    function expectRevert(bytes4) external;
    function expectRevert(bytes calldata) external;
    function sign(uint256, bytes32) external returns (uint8, bytes32, bytes32);
    function addr(uint256) external returns (address);
}

contract AerarEscrowTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    bytes32 constant TYPEHASH =
        keccak256("TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)");
    MockUSDC usdc;
    AerarEscrowFactory factory;
    AerarEscrow escrow;
    address constant SHOP = address(0x5409);
    address constant AERAR = address(0xAE7A7);
    address constant ATTACKER = address(0xBAD);
    address constant FACILITATOR = address(0xFAC);
    uint256 constant PAYER_KEY = 0xA11CE;
    address payer;

    function setUp() public {
        vm.warp(1_800_000_000);
        usdc = new MockUSDC();
        factory = new AerarEscrowFactory(IUSDCEscrow(address(usdc)));
        escrow = factory.create(SHOP, AERAR, 1 hours);
        payer = vm.addr(PAYER_KEY);
        usdc.mint(payer, 5_000_000); // $5
    }

    function _sig(address from, address to, uint256 value, uint256 vb, bytes32 nonce) internal returns (bytes memory) {
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", usdc.DOMAIN_SEPARATOR(), keccak256(abi.encode(TYPEHASH, from, to, value, 0, vb, nonce)))
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(PAYER_KEY, digest);
        return abi.encodePacked(r, s, v);
    }

    function _pay(uint256 value, bytes32 nonce) internal returns (bytes32 id) {
        uint256 vb = block.timestamp + 5 minutes;
        bytes memory sig = _sig(payer, address(escrow), value, vb, nonce);
        // Normal x402: the facilitator settles to the escrow, then the payment is recorded.
        vm.prank(FACILITATOR);
        usdc.transferWithAuthorization(payer, address(escrow), value, 0, vb, nonce, sig);
        id = escrow.record(payer, value, 0, vb, nonce, sig);
    }

    function _eq(uint256 a, uint256 b, string memory m) internal pure {
        require(a == b, m);
    }

    function test_holdsAPaymentSettledByTheFacilitator() public {
        bytes32 id = _pay(1_000_000, keccak256("n1"));
        (address p, uint128 value, uint64 releaseAfter, AerarEscrow.State st) = escrow.holds(id);
        require(p == payer && st == AerarEscrow.State.Held, "held for the payer");
        _eq(value, 1_000_000, "amount");
        _eq(releaseAfter, block.timestamp + 1 hours, "window");
        _eq(usdc.balanceOf(SHOP), 0, "shop not paid yet");
        _eq(escrow.held(), 1_000_000, "held total");
    }

    function test_recordCanSettleItself() public {
        uint256 vb = block.timestamp + 5 minutes;
        bytes memory sig = _sig(payer, address(escrow), 500_000, vb, keccak256("n2"));
        escrow.record(payer, 500_000, 0, vb, keccak256("n2"), sig);
        _eq(usdc.balanceOf(address(escrow)), 500_000, "escrow received it");
    }

    function test_cantClaimMoreThanWasSigned() public {
        uint256 vb = block.timestamp + 5 minutes;
        bytes memory sig = _sig(payer, address(escrow), 100_000, vb, keccak256("n3"));
        vm.prank(FACILITATOR);
        usdc.transferWithAuthorization(payer, address(escrow), 100_000, 0, vb, keccak256("n3"), sig);
        vm.expectRevert(AerarEscrow.BadSignature.selector);
        escrow.record(payer, 3_000_000, 0, vb, keccak256("n3"), sig);
    }

    function test_cantRecordTwice() public {
        uint256 vb = block.timestamp + 5 minutes;
        bytes memory sig = _sig(payer, address(escrow), 100_000, vb, keccak256("n4"));
        escrow.record(payer, 100_000, 0, vb, keccak256("n4"), sig);
        vm.expectRevert(AerarEscrow.AlreadyRecorded.selector);
        escrow.record(payer, 100_000, 0, vb, keccak256("n4"), sig);
    }

    function test_aerarRefundsWhatWasntDelivered() public {
        bytes32 id = _pay(1_000_000, keccak256("n5"));
        vm.prank(AERAR);
        escrow.refund(id, keccak256("EMPTY_DELIVERY"));
        _eq(usdc.balanceOf(payer), 5_000_000, "payer has all of it back");
        _eq(usdc.balanceOf(SHOP), 0, "shop got nothing");
        vm.expectRevert(AerarEscrow.NotHeld.selector);
        escrow.release(id);
    }

    function test_aerarCantRefundAfterTheWindow() public {
        bytes32 id = _pay(1_000_000, keccak256("n6"));
        vm.warp(block.timestamp + 1 hours);
        vm.prank(AERAR);
        vm.expectRevert(AerarEscrow.WindowClosed.selector);
        escrow.refund(id, bytes32(0));
        vm.prank(ATTACKER);
        escrow.release(id); // anyone can release once the window has passed
        _eq(usdc.balanceOf(SHOP), 1_000_000, "shop paid");
    }

    function test_noReleaseBeforeTheWindowUnlessAerarConfirms() public {
        bytes32 id = _pay(1_000_000, keccak256("n7"));
        vm.expectRevert(AerarEscrow.TooEarly.selector);
        escrow.release(id);
        vm.prank(ATTACKER);
        vm.expectRevert(AerarEscrow.NotAllowed.selector);
        escrow.confirm(id);
        vm.prank(AERAR);
        escrow.confirm(id);
        _eq(usdc.balanceOf(SHOP), 1_000_000, "delivered: shop paid at once");
    }

    function test_onlyAerarOrTheShopCanRefund() public {
        bytes32 id = _pay(1_000_000, keccak256("n8"));
        vm.prank(ATTACKER);
        vm.expectRevert(AerarEscrow.NotAllowed.selector);
        escrow.refund(id, bytes32(0));
        vm.warp(block.timestamp + 2 hours); // the shop can still refund after the window, until it's released
        vm.prank(SHOP);
        escrow.refund(id, keccak256("goodwill"));
        _eq(usdc.balanceOf(payer), 5_000_000, "refunded by the shop");
    }

    function test_vaultPaysThroughTheEscrowAndGetsRefunded() public {
        AerarVaultFactory vf = new AerarVaultFactory(IUSDC(address(usdc)));
        vm.prank(payer);
        AerarVault vault = vf.create(AERAR);
        usdc.mint(address(vault), 2_000_000);
        address[] memory payees = new address[](1);
        payees[0] = address(escrow); // the owner approves "this shop, with refunds"
        vm.prank(payer);
        vault.setMandate(keccak256("tsk"), payees, 1_000_000, 2_000_000, 1 days, uint64(block.timestamp + 7 days));
        uint256 vb = block.timestamp + 5 minutes;
        vm.prank(AERAR);
        vault.authorize(keccak256("tsk"), address(escrow), 1_000_000, 0, vb, keccak256("v1"));
        bytes memory vsig = abi.encode(keccak256("any")); // the Vault approves the digest via ERC-1271
        vm.prank(FACILITATOR);
        usdc.transferWithAuthorization(address(vault), address(escrow), 1_000_000, 0, vb, keccak256("v1"), vsig);
        bytes32 id = escrow.record(address(vault), 1_000_000, 0, vb, keccak256("v1"), vsig);
        vm.prank(AERAR);
        escrow.refund(id, keccak256("NOT_DELIVERED"));
        _eq(usdc.balanceOf(address(vault)), 2_000_000, "the money is back in the owner's Vault");
    }

    function test_factoryMakesOneEscrowPerShopJudgeAndWindow() public {
        vm.prank(ATTACKER);
        vm.expectRevert(bytes("escrow exists"));
        factory.create(SHOP, AERAR, 1 hours);
        require(factory.escrowOf(factory.key(SHOP, AERAR, 1 hours)) == address(escrow), "lookup");
        require(escrow.shop() == SHOP && escrow.arbiter() == AERAR && escrow.window() == 1 hours, "fixed shop, judge and window");
        vm.expectRevert(AerarEscrow.BadWindow.selector);
        factory.create(SHOP, AERAR, 1 minutes);
        // Someone else creating an escrow "for" the shop with their own judge gets a different address the shop never advertises.
        AerarEscrow other = factory.create(SHOP, ATTACKER, 1 hours);
        require(address(other) != address(escrow), "different escrow");
    }
}
