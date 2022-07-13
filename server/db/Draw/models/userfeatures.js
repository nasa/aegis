/*
CREATE TABLE user_features(
    id SERIAL UNIQUE NOT NULL PRIMARY KEY,
    file_id INTEGER NOT NULL REFERENCES user_files(id),
    level INTEGER,
    intent VARCHAR(50),
    properties JSON,
    geom geometry(GEOMETRY,4326)
) WITH (
    OIDS = FALSE
)
TABLESPACE pg_default;

ALTER TABLE user_files
    OWNER to postgres;

*/
/***********************************************************
 * Loading all required dependencies, libraries and packages
 **********************************************************/
import { Sequelize } from "sequelize";
import { getMMGISSequelizeConnection } from "server/db/connection";

const attributes = {
  file_id: {
    type: Sequelize.INTEGER,
    allowNull: false,
  },
  level: {
    type: Sequelize.INTEGER,
    unique: false,
    allowNull: false,
  },
  intent: {
    type: Sequelize.ENUM,
    values: [
      "roi",
      "campaign",
      "campsite",
      "trail",
      "signpost",
      "polygon",
      "line",
      "point",
      "text",
      "arrow",
    ],
    allowNull: true,
    defaultValue: null,
  },
  properties: {
    type: Sequelize.JSON,
    allowNull: true,
    defaultValue: {},
  },
  geom: {
    type: Sequelize.GEOMETRY,
    allowNull: true,
  },
};

const options = {
  timestamps: false,
};

const sequelize = getMMGISSequelizeConnection();

export const Userfeatures = sequelize.define("user_features", attributes, options);
