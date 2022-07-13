import Sequelize from "sequelize";

export function getMMGISSequelizeConnection() {
  // create a sequelize instance with our local postgres database information.
  const sequelize = new Sequelize(
    process.env.MMGIS_DB_NAME,
    process.env.MMGIS_DB_USER,
    process.env.MMGIS_DB_PASS,
    {
      host: process.env.MMGIS_DB_HOST,
      dialect: "postgres",
      logging: process.env.VERBOSE_LOGGING == "true" || false,
      pool: {
        max: 10,
        min: 0,
        acquire: 30000,
        idle: 10000,
      },
    }
  );

  sequelize
    .authenticate()
    .then(() => {
      console.log(
        "info",
        "MMGIS Database connection has successfully been established.",
        "connection"
      );
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

// export function getAEGISSequelizeConnection() {
//   // create a sequelize instance with our local postgres database information.
//   const sequelize = new Sequelize(
//     process.env.AEGIS_DB_NAME,
//     process.env.AEGIS_DB_USER,
//     process.env.AEGIS_DB_PASS,
//     {
//       host: process.env.AEGIS_DB_HOST,
//       dialect: "postgres",
//       logging: process.env.VERBOSE_LOGGING == "true" || false,
//       pool: {
//         max: 10,
//         min: 0,
//         acquire: 30000,
//         idle: 10000,
//       },
//     }
//   );

//   sequelize
//     .authenticate()
//     .then(() => {
//       console.log(
//         "info",
//         "AEGIS Database connection has successfully been established.",
//         "connection"
//       );
//     })
//     .catch((err) => {
//       console.log(
//         "infrastructure_error",
//         "Unable to connect to the database.",
//         "connection",
//         null,
//         err
//       );
//     });

//   return sequelize;
// }
