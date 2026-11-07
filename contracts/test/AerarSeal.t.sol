// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AerarSeal} from "../src/AerarSeal.sol";

interface Vm2 {
    function prank(address) external;
    function expectRevert(bytes4) external;
    function warp(uint256) external;
}

contract AerarSealTest {
    Vm2 constant vm = Vm2(address(uint160(uint256(keccak256("hevm cheat code")))));
    AerarSeal s;
    address constant AERAR = address(0xAE7A7);
    address constant OTHER = address(0xBAD);
    bytes32 constant WS = keccak256("org_demo");

    function setUp() public {
        s = new AerarSeal();
        vm.warp(1_800_000_000);
    }

    function test_sealsAndReadsBack() public {
        vm.prank(AERAR);
        s.seal(WS, 41, keccak256("head41"), 41);
        AerarSeal.Seal memory x = s.latest(AERAR, WS);
        require(x.head == keccak256("head41") && x.seq == 41 && x.entries == 41 && x.sealedAt == 1_800_000_000, "stored");
        require(s.count(AERAR, WS) == 1, "count");
    }

    function test_onlyNewerSeals() public {
        vm.prank(AERAR);
        s.seal(WS, 41, keccak256("a"), 41);
        vm.prank(AERAR);
        vm.expectRevert(AerarSeal.NotNewer.selector);
        s.seal(WS, 41, keccak256("rewritten"), 41);
        vm.prank(AERAR);
        s.seal(WS, 90, keccak256("b"), 90);
        require(s.count(AERAR, WS) == 2, "two");
        require(s.at(AERAR, WS, 0).head == keccak256("a"), "first kept");
    }

    function test_someoneElsesSealsAreSeparate() public {
        vm.prank(OTHER);
        s.seal(WS, 1000, keccak256("fake"), 1000);
        require(s.count(AERAR, WS) == 0, "aerar has none");
    }
}
