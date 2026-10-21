require('dotenv').config();

const app = require('./app');
const { connectDatabase } = require('./config/database');

async function startServer() {
  await connectDatabase();
  console.log('MongoDB connected successfully');

  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => {
    console.log(`TrustVault backend listening on port ${port}`);
  });
}

startServer().catch((error) => {
  const failure =
    error instanceof AggregateError
      ? 'MongoDB initialization failed'
      : 'MongoDB connection or initialization failed';
  console.error(
    `Unable to start TrustVault: ${failure}. Verify MONGODB_URI and database availability; connection details are withheld.`,
  );
  process.exitCode = 1;
});
