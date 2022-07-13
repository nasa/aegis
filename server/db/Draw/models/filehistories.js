/*
CREATE TABLE file_histories(
    id SERIAL UNIQUE NOT NULL PRIMARY KEY,
    file_id INTEGER NOT NULL REFERENCES user_files(id),
    history_id INTEGER NOT NULL,
    time BIGINT NOT NULL,
    action_index INTEGER NOT NULL,
    history INT[]
) WITH (
    OIDS = FALSE
)
TABLESPACE pg_default;

ALTER TABLE file_histories
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
  history_id: {
    type: Sequelize.INTEGER,
    allowNull: false,
  },
  time: {
    type: Sequelize.BIGINT,
    allowNull: false,
  },
  action_index: {
    type: Sequelize.INTEGER,
    allowNull: false,
  },
  history: {
    type: Sequelize.DataTypes.ARRAY(Sequelize.DataTypes.INTEGER),
    allowNull: true,
  },
};

const options = {
  timestamps: false,
};

const sequelize = getMMGISSequelizeConnection();

// setup Filehistories model and its fields.
export const Filehistories = sequelize.define("file_histories", attributes, options);
