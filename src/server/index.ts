import express from "express";
import morgan from "morgan";
import cors from "cors";
import { yoga } from "./graphql.js";
import config from "@/config.js";
import konsole from "@/services/konsole.js";

export default function () {
  const app = express();

  app.use(morgan("short"));
  app.use(cors());
  app.use("/graphql", yoga);

  app.listen(config.server.port, config.server.host, () => {
    konsole.log([], `Server listening...`, {
      url: `http://${config.server.host}:${config.server.port}`,
    });
  });
}
