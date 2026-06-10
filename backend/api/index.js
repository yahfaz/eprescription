// Vercel serverless entrypoint for the backend service.
//
// Vercel runs the backend as a serverless function (via the @vercel/node
// builder declared in vercel.json) rather than a long-lived process, so we
// export the configured Express app instead of calling app.listen() — that
// lives in src/server.js for Docker / traditional hosting. The @vercel/node
// builder adapts an exported Express app into a request handler.
import app from '../src/app.js';

export default app;
