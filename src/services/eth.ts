import config from "@/config.js";
import { ethers } from "ethers";
import { timeout } from "@/utils.js";
import konsole from "@/services/konsole.js";
import * as redis from "@/services/redis.js";
import assert from "assert";

let wsProvider: ethers.providers.BaseProvider;
let httpProvider: ethers.providers.BaseProvider;

const promises = [];

if (config.eth.wsRpcUrl) {
  promises.push(
    (async () => {
      konsole.log(["eth"], "Connecting to WS provider", {
        url: config.eth.wsRpcUrl!.toString(),
      });

      wsProvider = new ethers.providers.WebSocketProvider(
        config.eth.wsRpcUrl!.toString()
      );

      await timeout(5000, wsProvider.ready, "WS provider not ready");

      assert(
        (await wsProvider.getNetwork()).chainId === config.eth.chainId,
        "Chain ID mismatch"
      );

      konsole.info(["eth"], "WS provider connected");
    })()
  );

  promises.push(
    (async () => {
      console.log("Connecting to HTTP provider", {
        url: config.eth.httpRpcUrl.toString(),
      });

      httpProvider = new ethers.providers.JsonRpcProvider(
        config.eth.httpRpcUrl.toString()
      );

      await timeout(5000, httpProvider.ready, "HTTP provider not ready");

      assert(
        (await httpProvider.getNetwork()).chainId === config.eth.chainId,
        "Chain ID mismatch"
      );

      konsole.info(["eth"], "HTTP provider connected");
    })()
  );
} else {
  promises.push(
    (async () => {
      konsole.log(["eth"], "Connecting to HTTP+WS provider", {
        url: config.eth.httpRpcUrl.toString(),
      });

      httpProvider = new ethers.providers.JsonRpcProvider(
        config.eth.httpRpcUrl.toString()
      );

      wsProvider = httpProvider;

      await timeout(5000, httpProvider.ready, "HTTP+WS provider not ready");

      assert(
        (await httpProvider.getNetwork()).chainId === config.eth.chainId,
        "Chain ID mismatch"
      );

      konsole.info(["eth"], "HTTP+WS provider connected");
    })()
  );
}

await Promise.all(promises);

export { wsProvider, httpProvider };

export async function fetchBlockTimestamp(
  blockNumber: number
): Promise<number> {
  const redisKey = `${redis.prefix}block:${blockNumber}:timestamp`;
  const cached = await redis.client.get(redisKey);

  if (cached) {
    return parseInt(cached);
  }

  const block = await httpProvider.getBlock(blockNumber);
  await redis.client.set(redisKey, block.timestamp.toString());

  return block.timestamp;
}
