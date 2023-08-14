import { expect } from "chai";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ethers } from "hardhat";
import { Reverter } from "@/test/helpers/reverter";
import { wei } from "@/scripts/utils/utils";
import { ERC1967Proxy, ERC20Mock, IDexeToken, Swapper } from "@ethers-v5";

const hardhat = require("hardhat");

describe("Swapper", () => {
  const reverter = new Reverter();

  let OWNER: SignerWithAddress;
  let SECOND: SignerWithAddress;
  let THIRD: SignerWithAddress;

  let swapper: Swapper;
  let oldDexe: IDexeToken;
  let newDexe: ERC20Mock;

  function wei(amount: number) {
    return ethers.utils.parseEther(amount.toString());
  }

  before(async () => {
    [OWNER, SECOND, THIRD] = await ethers.getSigners();

    const Swapper = await ethers.getContractFactory("Swapper");
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    swapper = await Swapper.deploy();
    oldDexe = await ethers.getContractAt("IDexeToken", "0x039cb485212f996a9dbb85a9a75d898f94d38da6");

    const REAL_OWNER: SignerWithAddress = await ethers.getImpersonatedSigner(
      "0x006ea495758b7ea9a05c7e1d5dac965009b22ccf"
    );
    await OWNER.sendTransaction({
      to: REAL_OWNER.address,
      value: ethers.utils.parseEther("1.0"),
    });
    await oldDexe.connect(REAL_OWNER).addMinters([OWNER.address, swapper.address]);

    newDexe = await ERC20Mock.deploy("New Dexe", "NDEXE", 18);
    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  describe("dexe", () => {
    it("owner could mint dexe", async () => {
      expect(await oldDexe.balanceOf(OWNER.address)).to.equal(0);
      await oldDexe.connect(OWNER).mint(OWNER.address, 123);
      expect(await oldDexe.balanceOf(OWNER.address)).to.equal(123);
    });

    it("owner could burn dexe", async () => {
      await oldDexe.connect(OWNER).mint(OWNER.address, 123);
      expect(await oldDexe.balanceOf(OWNER.address)).to.equal(123);
      await oldDexe.connect(OWNER).burn(OWNER.address, 23);
      expect(await oldDexe.balanceOf(OWNER.address)).to.equal(100);
    });

    it("dexe cant be overburnt ", async () => {
      expect(await oldDexe.balanceOf(OWNER.address)).to.equal(0);
      await expect(oldDexe.connect(OWNER).burn(OWNER.address, 1)).to.be.revertedWith(
        "BEP20: burn amount exceeds balance"
      );
    });
  });

  describe("swapping logic", () => {
    beforeEach(async () => {
      await newDexe.connect(OWNER).mint(swapper.address, wei(10 ** 9));
      await oldDexe.connect(OWNER).mint(SECOND.address, wei(2));
      swapper.__Swapper_init(oldDexe.address, newDexe.address);
    });

    it("could swap", async () => {
      expect(await newDexe.balanceOf(SECOND.address)).to.equal(0);
      expect(await newDexe.balanceOf(swapper.address)).to.equal(wei(10 ** 9));
      expect(await oldDexe.balanceOf(SECOND.address)).to.equal(wei(2));
      await swapper.connect(SECOND).swap(wei(1));
      expect(await newDexe.balanceOf(SECOND.address)).to.equal(wei(1));
      expect(await newDexe.balanceOf(swapper.address)).to.equal(wei(10 ** 9 - 1));
      expect(await oldDexe.balanceOf(SECOND.address)).to.equal(wei(1));
    });

    it("could swap all", async () => {
      expect(await newDexe.balanceOf(SECOND.address)).to.equal(0);
      expect(await newDexe.balanceOf(swapper.address)).to.equal(wei(10 ** 9));
      expect(await oldDexe.balanceOf(SECOND.address)).to.equal(wei(2));
      await swapper.connect(SECOND).swapAll();
      expect(await newDexe.balanceOf(SECOND.address)).to.equal(wei(2));
      expect(await newDexe.balanceOf(swapper.address)).to.equal(wei(10 ** 9 - 2));
      expect(await oldDexe.balanceOf(SECOND.address)).to.equal(wei(0));
    });

    it("cant swap more than old dexe balance", async () => {
      await expect(swapper.connect(SECOND).swap(wei(3))).to.be.revertedWith("BEP20: burn amount exceeds balance");
    });

    it("cant swap more than new dexe treasury", async () => {
      await oldDexe.connect(OWNER).mint(SECOND.address, wei(10 ** 10));
      await expect(swapper.connect(SECOND).swapAll()).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });
  });

  describe("setTokens()", () => {
    beforeEach(async () => {
      swapper.__Swapper_init(oldDexe.address, newDexe.address);
    });

    it("cant set token if not owner", async () => {
      await expect(swapper.connect(SECOND).setTokens(newDexe.address, oldDexe.address)).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("can set token if owner", async () => {
      await swapper.setTokens(newDexe.address, oldDexe.address);
    });
  });

  describe("proxy", () => {
    let erc1967: ERC1967Proxy;
    let proxy: Swapper;
    beforeEach(async () => {
      const ERC1967Proxy = await ethers.getContractFactory("ERC1967Proxy");
      erc1967 = await ERC1967Proxy.deploy(swapper.address, "0x");
      proxy = await ethers.getContractAt("Swapper", erc1967.address);
      await proxy.__Swapper_init(oldDexe.address, newDexe.address);
    });
    it("cant initialize twice", async () => {
      await expect(proxy.__Swapper_init(oldDexe.address, newDexe.address)).to.be.revertedWith(
        "Initializable: contract is already initialized"
      );
    });

    it("cant set new implementation by not owner", async () => {
      let swapper1 = await (await ethers.getContractFactory("Swapper")).deploy();
      await expect(proxy.connect(SECOND).upgradeTo(swapper1.address)).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("owner could set new implementation", async () => {
      expect(await proxy.getImplementation()).to.equal(swapper.address);
      let swapper1 = await (await ethers.getContractFactory("Swapper")).deploy();
      await proxy.upgradeTo(swapper1.address);
      expect(await proxy.getImplementation()).to.equal(swapper1.address);
    });

    it("owner could change ownership", async () => {
      expect(await proxy.owner()).to.equal(OWNER.address);
      await proxy.transferOwnership(SECOND.address);
      expect(await proxy.owner()).to.equal(SECOND.address);
    });

    it("new owner could upgrade", async () => {
      await proxy.transferOwnership(SECOND.address);
      let swapper1 = await (await ethers.getContractFactory("Swapper")).deploy();
      await expect(proxy.connect(OWNER).upgradeTo(swapper1.address)).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
      await proxy.connect(SECOND).upgradeTo(swapper1.address);
      expect(await proxy.getImplementation()).to.equal(swapper1.address);
    });

    it("not owner cant change ownership", async () => {
      await expect(proxy.connect(SECOND).transferOwnership(THIRD.address)).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
    });
  });

  describe("withdraw", () => {
    beforeEach(async () => {
      swapper.__Swapper_init(oldDexe.address, newDexe.address);

      await newDexe.connect(OWNER).mint(swapper.address, wei(10));
      await oldDexe.connect(OWNER).mint(swapper.address, wei(100));
    });

    it("could withdraw", async () => {
      await swapper.connect(OWNER).withdrawTokens([oldDexe.address, newDexe.address], [wei(100), wei(10)]);
      expect(await newDexe.balanceOf(OWNER.address)).to.equal(wei(10));
      expect(await oldDexe.balanceOf(OWNER.address)).to.equal(wei(100));
      expect(await newDexe.balanceOf(swapper.address)).to.equal(wei(0));
      expect(await oldDexe.balanceOf(swapper.address)).to.equal(wei(0));
    });

    it("cant withdraw if not owner", async () => {
      await expect(
        swapper.connect(SECOND).withdrawTokens([oldDexe.address, newDexe.address], [wei(100), wei(10)])
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("reverts if different array size", async () => {
      await expect(swapper.withdrawTokens([oldDexe.address, newDexe.address], [wei(100)])).to.be.revertedWith(
        "Swapper: arrays of different size"
      );
    });
  });
});
