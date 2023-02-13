import config from "@/config.js";
import { subscribeToChainUpdates } from "./subscribeToChainUpdates.js";
import { syncContract } from "./syncContract.js";

export default function () {
  subscribeToChainUpdates();

  for (const contract of config.contracts) {
    syncContract(contract);
  }
}
