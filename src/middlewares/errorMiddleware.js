/**
 * Global error-handling middleware.
 * Must be the LAST middleware registered in index.js (after all routes).
 * Catches any error passed via next(err).
 */
const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || err.status || 500;

  if (process.env.NODE_ENV !== "production") {
    console.error(`[${new Date().toISOString()}] ${err.stack || err.message}`);
  }

  res.status(statusCode).json({
    success: false,
    error: err.message || "Internal Server Error",
    ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
  });
};

export default errorHandler;
