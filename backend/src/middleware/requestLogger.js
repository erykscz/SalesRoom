export function requestLogger(req, res, next) {
  const start = Date.now();
  const { method, url } = req;

  res.on('finish', () => {
    const duration = Date.now() - start;
    const { statusCode } = res;

    // Color coding for different status codes
    let statusColor = '\x1b[32m'; // Green for success
    if (statusCode >= 400 && statusCode < 500) {
      statusColor = '\x1b[33m'; // Yellow for client errors
    } else if (statusCode >= 500) {
      statusColor = '\x1b[31m'; // Red for server errors
    }

    console.log(
      `${statusColor}${method}\x1b[0m ${url} ${statusColor}${statusCode}\x1b[0m - ${duration}ms`
    );
  });

  next();
}
