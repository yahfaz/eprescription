// Vercel serverless entry point for the API.
//
// Vercel runs each service as a serverless function rather than a long-lived
// process, so we export the configured Express app directly instead of calling
// app.listen() (which lives in src/server.js for traditional hosting). The
// @vercel/node runtime adapts an Express app into a request handler.
import app from '../src/app.js';

export default app;
