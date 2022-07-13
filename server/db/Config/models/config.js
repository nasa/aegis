import { Sequelize } from "sequelize";
import { getMMGISSequelizeConnection } from "server/db/connection";

const sequelize = getMMGISSequelizeConnection();

// setup User model and its fields.
export const Config = sequelize.define(
  "configs",
  {
    mission: {
      type: Sequelize.STRING,
      unique: false,
      allowNull: false,
    },
    config: {
      type: Sequelize.JSON,
      allowNull: true,
      defaultValue: {},
    },
    version: {
      type: Sequelize.DataTypes.INTEGER,
      unique: false,
      allowNull: false,
    },
  },
  {
    timestamps: true,
    updatedAt: false,
  }
);
