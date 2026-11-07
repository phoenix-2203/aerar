// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AerarVault, AerarVaultFactory, IUSDC} from "../src/AerarVault.sol";
import {MockUSDC} from "./MockUSDC.sol";

interface Vm {
    function warp(uint256) external;
    function prank(address) external;
    function startPrank(address) external;
    function stopPrank() external;
    function expectRevert(bytes4) external;
    function expectRevert(bytes calldata) external;
}

contract AerarVaultTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    MockUSDC usdc;
    AerarVaultFactory factory;
    AerarVault vault;
    address constant OWNER = address(0xA11CE);
    address constant AERAR = address(0xAE7A7);
    address constant SHOP = address(0x5409);
    address constant ATTACKER = address(0xBAD);
    address constant FACILITATOR = address(0xFAC);
    bytes32 constant TASK = keccak256("tsk_research");
    bytes constant SIG = abi.encode(keccak256("tsk_research")); // 32 bytes: never mistaken for an ECDSA signature

    function setUp() public {
        vm.warp(1_800_000_000);
        usdc = new MockUSDC();
        factory = new AerarVaultFactory(IUSDC(address(usdc)));
        vm.prank(OWNER);
        vault = factory.create(AERAR);
        usdc.mint(address(vault), 5_000_000); // $5
        address[] memory payees = new address[](1);
        payees[0] = SHOP;
        vm.prank(OWNER);
        vault.setMandate(TASK, payees, 1_000_000, 2_000_000, 1 days, uint64(block.timestamp + 7 days)); // $1 each, $2/day
    }

    function _authorize(address to, uint256 value, bytes32 nonce) internal returns (bytes32) {
        vm.prank(AERAR);
        return vault.authorize(TASK, to, value, 0, block.timestamp + 5 minutes, nonce);
    }

    function _settle(address to, uint256 value, bytes32 nonce) internal {
        vm.prank(FACILITATOR);
        usdc.transferWithAuthorization(address(vault), to, value, 0, block.timestamp + 5 minutes, nonce, SIG);
    }

    function _eq(uint256 a, uint256 b, string memory m) internal pure {
        require(a == b, m);
    }

    function test_factoryMakesOneVaultPerOwner() public {
        require(factory.vaultOf(OWNER) == address(vault), "registered");
        require(vault.owner() == OWNER && vault.operator() == AERAR, "roles");
        vm.prank(OWNER);
        vm.expectRevert(bytes("vault exists"));
        factory.create(AERAR);
    }

    function test_paysInsideTheMandate() public {
        _authorize(SHOP, 250_000, bytes32(uint256(1)));
        _settle(SHOP, 250_000, bytes32(uint256(1)));
        _eq(usdc.balanceOf(SHOP), 250_000, "shop paid");
        _eq(usdc.balanceOf(address(vault)), 4_750_000, "vault debited");
        (uint256 left,) = vault.remaining(TASK);
        _eq(left, 1_750_000, "period left");
    }

    function test_facilitatorCantChangePayeeOrAmount() public {
        _authorize(SHOP, 250_000, bytes32(uint256(1)));
        vm.prank(FACILITATOR);
        vm.expectRevert(bytes("invalid signature"));
        usdc.transferWithAuthorization(address(vault), ATTACKER, 250_000, 0, block.timestamp + 5 minutes, bytes32(uint256(1)), SIG);
        vm.prank(FACILITATOR);
        vm.expectRevert(bytes("invalid signature"));
        usdc.transferWithAuthorization(address(vault), SHOP, 900_000, 0, block.timestamp + 5 minutes, bytes32(uint256(1)), SIG);
    }

    function test_settlesOnlyOnce() public {
        _authorize(SHOP, 100_000, bytes32(uint256(7)));
        _settle(SHOP, 100_000, bytes32(uint256(7)));
        vm.prank(FACILITATOR);
        vm.expectRevert(bytes("used"));
        usdc.transferWithAuthorization(address(vault), SHOP, 100_000, 0, block.timestamp + 5 minutes, bytes32(uint256(7)), SIG);
    }

    function test_aerarCantPayAnUnlistedPayee() public {
        vm.prank(AERAR);
        vm.expectRevert(AerarVault.PayeeNotAllowed.selector);
        vault.authorize(TASK, ATTACKER, 100_000, 0, block.timestamp + 5 minutes, bytes32(uint256(1)));
    }

    function test_perPaymentAndPeriodLimits() public {
        vm.prank(AERAR);
        vm.expectRevert(AerarVault.OverPerPaymentLimit.selector);
        vault.authorize(TASK, SHOP, 1_000_001, 0, block.timestamp + 5 minutes, bytes32(uint256(1)));
        _authorize(SHOP, 1_000_000, bytes32(uint256(2)));
        _authorize(SHOP, 1_000_000, bytes32(uint256(3)));
        vm.prank(AERAR);
        vm.expectRevert(AerarVault.OverPeriodLimit.selector);
        vault.authorize(TASK, SHOP, 1, 0, block.timestamp + 5 minutes, bytes32(uint256(4)));
        vm.warp(block.timestamp + 1 days);
        _authorize(SHOP, 1_000_000, bytes32(uint256(5))); // new day, new allowance
    }

    function test_onlyTheOperatorAuthorizes() public {
        vm.prank(ATTACKER);
        vm.expectRevert(AerarVault.NotOperator.selector);
        vault.authorize(TASK, SHOP, 1, 0, block.timestamp + 5 minutes, bytes32(uint256(1)));
    }

    function test_aerarCantChangeLimitsOrWithdraw() public {
        address[] memory p = new address[](1);
        p[0] = ATTACKER;
        vm.startPrank(AERAR);
        vm.expectRevert(AerarVault.NotOwner.selector);
        vault.setMandate(TASK, p, 5_000_000, 5_000_000, 1 days, uint64(block.timestamp + 1 days));
        vm.expectRevert(AerarVault.NotOwner.selector);
        vault.withdraw(AERAR, 1);
        vm.expectRevert(AerarVault.NotOwner.selector);
        vault.setOperator(ATTACKER);
        vm.stopPrank();
    }

    function test_revokeKillsPendingApprovals() public {
        _authorize(SHOP, 100_000, bytes32(uint256(1)));
        vm.prank(OWNER);
        vault.revoke(TASK);
        vm.prank(FACILITATOR);
        vm.expectRevert(bytes("invalid signature"));
        usdc.transferWithAuthorization(address(vault), SHOP, 100_000, 0, block.timestamp + 5 minutes, bytes32(uint256(1)), SIG);
        vm.prank(AERAR);
        vm.expectRevert(AerarVault.NoMandate.selector);
        vault.authorize(TASK, SHOP, 1, 0, block.timestamp + 5 minutes, bytes32(uint256(2)));
    }

    function test_pauseStopsEverything() public {
        _authorize(SHOP, 100_000, bytes32(uint256(1)));
        vm.prank(OWNER);
        vault.setPaused(true);
        vm.prank(FACILITATOR);
        vm.expectRevert(bytes("invalid signature"));
        usdc.transferWithAuthorization(address(vault), SHOP, 100_000, 0, block.timestamp + 5 minutes, bytes32(uint256(1)), SIG);
    }

    function test_expiredMandate() public {
        vm.warp(block.timestamp + 8 days);
        vm.prank(AERAR);
        vm.expectRevert(AerarVault.MandateExpired.selector);
        vault.authorize(TASK, SHOP, 1, 0, block.timestamp + 5 minutes, bytes32(uint256(1)));
    }

    function test_approvalWindowIsShort() public {
        vm.prank(AERAR);
        vm.expectRevert(AerarVault.BadValidity.selector);
        vault.authorize(TASK, SHOP, 1, 0, block.timestamp + 1 hours, bytes32(uint256(1)));
    }

    function test_unusedApprovalCanBeReleased() public {
        bytes32 d = _authorize(SHOP, 600_000, bytes32(uint256(1)));
        vm.expectRevert(AerarVault.NotReleasable.selector);
        vault.release(d); // still valid
        vm.warp(block.timestamp + 6 minutes);
        vault.release(d);
        (uint256 left,) = vault.remaining(TASK);
        _eq(left, 2_000_000, "budget back");
    }

    function test_settledApprovalCantBeReleased() public {
        bytes32 d = _authorize(SHOP, 600_000, bytes32(uint256(1)));
        _settle(SHOP, 600_000, bytes32(uint256(1)));
        vm.warp(block.timestamp + 6 minutes);
        vm.expectRevert(AerarVault.NotReleasable.selector);
        vault.release(d);
    }

    function test_ownerWithdraws() public {
        vm.prank(OWNER);
        vault.withdraw(OWNER, 5_000_000);
        _eq(usdc.balanceOf(OWNER), 5_000_000, "withdrawn");
    }
}
