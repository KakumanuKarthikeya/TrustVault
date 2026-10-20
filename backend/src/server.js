require('dotenv').config();

const app = require('./app');
const { connectDatabase } = require('./config/database');

async function startServer() {
  await connectDatabase();

  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => {
    console.log(`TrustVault backend listening on port ${port}`);
  });
}

startServer().catch((error) => {
  console.error(
    `Unable to start TrustVault: MongoDB connection failed (${error.name || 'Error'}). Check MONGODB_URI and Atlas network access.`,
  );
  process.exitCode = 1;
});
