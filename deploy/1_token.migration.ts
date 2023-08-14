import { Deployer, Logger } from "@dlsl/hardhat-migrate";
import { artifacts } from "hardhat";

const oldDexe = "0x039cb485212f996a9dbb85a9a75d898f94d38da6";
const newDexe = "0xffffffffffffffffffffffffffffffffffffffff";
const owner = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

const Swapper = artifacts.require("Swapper");
const Proxy = artifacts.require("ERC1967Proxy");

export = async (deployer: Deployer, logger: Logger) => {
  const logic = await deployer.deploy(Swapper);
  logger.logContracts(["Swapper logic", logic.address]);

  const proxy = await deployer.deploy(Proxy, logic.address, "0x");
  logger.logContracts(["Swapper proxy", proxy.address]);

  const swapper = await Swapper.at(proxy.address);
  logger.logTransaction(await swapper.__Swapper_init(oldDexe, newDexe), "Init Swapper");

  logger.logTransaction(await swapper.transferOwnership(owner), "Transfer ownership");
};
