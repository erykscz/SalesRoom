// Vercel Serverless Function entry point
// Wraps the Express app as a serverless handler

let app;

try {
  app = (await import('../backend/src/index.js')).default;
} catch (error) {
  console.error('Error importing app:', error);
  app = (req, res) => {
    res.status(500).json({ error: 'Server initialization failed', details: error.message });
  };
}

export default app;
