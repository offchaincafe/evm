import config from "@/config.js";
import { Redis, Callback, Result } from "ioredis";

// REFACTOR: Move this to a separate file.
const SET_MAX_SOURCE = /** Lua */ `
-- This is a Lua script that can be used with the EVAL command.
-- Sets KEY[1] to ARGV[1] if ARGV[1] is greater than KEY[1].
-- Returns the (new) value of KEY[1].
-- This script is used to implement the SETMAX command.

if redis.call("EXISTS", KEYS[1]) == 1 then
   local current = redis.call("GET", KEYS[1])

   if tonumber(current) > tonumber(ARGV[1]) then
      return current
   end
end

redis.call("SET", KEYS[1], ARGV[1])`.trim();

const client = new Redis(config.redisUrl.toString());

client.defineCommand("setMax", {
  numberOfKeys: 1,
  lua: SET_MAX_SOURCE,
});

declare module "ioredis" {
  interface RedisCommander<Context> {
    setMax(
      key: string,
      argv: string,
      callback?: Callback<string>
    ): Result<string, Context>;
  }
}

export const prefix = config.redisUrl.searchParams.get("prefix");

export { client };
