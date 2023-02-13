import * as dotenv from "dotenv";
import { ethers } from "ethers";
import { readFileSync } from "fs";
import { toBuffer } from "./utils.js";

dotenv.config();

class Server {
  constructor(readonly host: string, readonly port: number) {}
}

class Eth {
  constructor(
    readonly chainId: number,
    readonly httpRpcUrl: URL,
    readonly wsRpcUrl: URL | undefined
  ) {}
}

export class Contract {
  constructor(readonly address: Buffer, readonly creationBlock: number) {}
}

class Config {
  constructor(
    readonly databaseUrl: URL,
    readonly redisUrl: URL,
    readonly server: Server,
    readonly eth: Eth,
    readonly contracts: Contract[]
  ) {}
}

function requireEnv(id: string): string {
  if (process.env[id]) return process.env[id]!;
  else throw `Missing env var ${id}`;
}

const contractsPath = requireEnv("CONTRACTS_PATH");
const contents = readFileSync(contractsPath);
let contracts = JSON.parse(contents.toString());

for (const contract of contracts) {
  if (!contract.address) throw `Missing address for contract ${contract.name}`;
  if (!ethers.utils.isAddress(contract.address))
    throw `Invalid contract address ${contract.address} for contract ${contract.name}`;
  contract.address = toBuffer(contract.address);

  if (!contract.creationBlock)
    throw `Missing creationBlock for contract ${contract.name}`;
  if (typeof contract.creationBlock !== "number" || contract.creationBlock < 1)
    throw `Invalid creationBlock ${contract.creationBlock} for contract ${contract.name}`;
}

const config = new Config(
  new URL(requireEnv("DATABASE_URL")),
  new URL(requireEnv("REDIS_URL")),
  new Server(requireEnv("SERVER_HOST"), parseInt(requireEnv("SERVER_PORT"))),
  new Eth(
    parseInt(requireEnv("ETH_CHAIN_ID")),
    new URL(requireEnv("ETH_HTTP_RPC_URL")),
    process.env["ETH_WS_RPC_URL"]
      ? new URL(requireEnv("ETH_WS_RPC_URL"))
      : undefined
  ),
  contracts as Contract[]
);

export default config;
