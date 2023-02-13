import { wsProvider } from "@/services/eth.js";
import * as redis from "@/services/redis.js";

export async function subscribeToChainUpdates() {
  wsProvider.on("block", async (blockNumber) => {
    await redis.client.setMax(
      `${redis.prefix}latestBlockNumber`,
      blockNumber.toString()
    );
  });
}
