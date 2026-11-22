import { protect } from "../middleware/authMiddleware.js";

/** Adapt the host application's verified user document to Dev Mode's { id } contract. */
export const identity = (req, res, next) => protect(req, res, () => {
  const authenticatedUser = req.user;
  const id = authenticatedUser?._id || authenticatedUser?.id;

  if (!id) {
    return res.status(401).json({
      success: false,
      error: { code: "UNAUTHENTICATED", message: "Sign in is required." }
    });
  }

  req.user = {
    id: String(id),
    role: authenticatedUser.role
  };
  next();
});

// All signed-in users may create codebases. This remains a server-side check.
export const requireCreator = (req, res, next) => req.user?.id
  ? next()
  : res.status(401).json({
      success: false,
      error: { code: "UNAUTHENTICATED", message: "Sign in is required." }
    });
