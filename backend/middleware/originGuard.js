const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function originGuard(allowedOrigins) {
  const origins = new Set(allowedOrigins);
  return (req, res, next) => {
    const origin = req.get("origin");
    const allowed = !origin || origins.has(origin);
    console.info(JSON.stringify({
      event: "cors.origin",
      method: req.method,
      origin: origin || null,
      host: req.get("host") || null,
      allowed
    }));
    if (!SAFE_METHODS.has(req.method) && origin && !origins.has(origin)) {
      return res.status(403).json({ message: "Request origin is not allowed." });
    }
    return next();
  };
}
