import Sequelize from "sequelize";

export function getSequelizeConnection() {
  // create a sequelize instance with our local postgres database information.
  const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASS, {
    host: process.env.DB_HOST,
    dialect: "postgres",
    logging: process.env.VERBOSE_LOGGING == "true" || false,
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
  });

  sequelize
    .authenticate()
    .then(() => {
      console.log("info", "Database connection has successfully been established.", "connection");
    })
    .catch((err) => {
      console.log(
        "infrastructure_error",
        "Unable to connect to the database.",
        "connection",
        null,
        err
      );
    });

  return sequelize;
}
