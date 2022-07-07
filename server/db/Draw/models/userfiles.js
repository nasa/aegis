/*
CREATE TABLE user_files(
    id SERIAL UNIQUE NOT NULL PRIMARY KEY,
    file_owner VARCHAR(50) NOT NULL,
    file_owner_group STRING[],
    file_name VARCHAR(355) NOT NULL,
    file_description VARCHAR,
    is_master BOOLEAN NOT NULL DEFAULT false,
    intent VARCHAR(50),
    public CHAR(1) NOT NULL DEFAULT '0',
    hidden CHAR(1) NOT NULL DEFAULT '0',
    created_on TIMESTAMP NOT NULL,
    updated_on TIMESTAMP NOT NULL
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
import { getSequelizeConnection } from "server/db/connection";

const intents = ["roi", "campaign", "campsite", "trail", "signpost", "all"];

const attributes = {
  file_owner: {
    type: Sequelize.STRING,
    unique: false,
    allowNull: false,
  },
  file_owner_group: {
    type: Sequelize.DataTypes.ARRAY(Sequelize.DataTypes.STRING),
    unique: false,
    allowNull: true,
  },
  file_name: {
    type: Sequelize.STRING,
    unique: false,
    allowNull: false,
  },
  file_description: {
    type: Sequelize.DataTypes.STRING(10000),
    allowNull: true,
    defaultValue: "",
    unique: false,
  },
  is_master: {
    type: Sequelize.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    unique: false,
  },
  intent: {
    type: Sequelize.ENUM,
    values: intents,
    allowNull: true,
    defaultValue: null,
    unique: false,
  },
  public: {
    type: Sequelize.ENUM,
    values: ["0", "1"],
    allowNull: false,
    defaultValue: "0",
    unique: false,
  },
  hidden: {
    type: Sequelize.ENUM,
    values: ["0", "1"],
    allowNull: false,
    defaultValue: "0",
    unique: false,
  },
};

const options = {
  // don't add the timestamp attributes (updatedAt, createdAt)
  // timestamps: false,
  // don't forget to enable timestamps!
  timestamps: true,

  // I do want createdat, then true
  createdAt: "created_on",

  // I want updatedAt to actually be called update_on
  updatedAt: "updated_on",
};

const sequelize = getSequelizeConnection();

// setup Userfiles model and its fields.
export const Userfiles = sequelize.define("user_files", attributes, options);
