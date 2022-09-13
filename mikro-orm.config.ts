import { Options } from "@mikro-orm/core";
import { Mission } from "server/database/models/mission.model";
import { User } from "server/database/models/user.model";
import path from "path";

const config: Options = {
    dbName: "aegis",
    type: "postgresql",
    password: "postagresgetthemess",
    migrations: {
        path: path.join(__dirname, "./server/database/migrations"), // path to the folder with migrations
    },
    seeder: {
        path: path.join(__dirname, "./server/database/seeds"), // path to the folder with seed files
    },
    entitiesTs: [Mission, User],
    entities: [Mission, User],
    debug: process.env.DEBUG === "true" || process.env.DEBUG?.includes("db"),
};

export default config;