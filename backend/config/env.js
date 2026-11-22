import dotenv from "dotenv";
import { validateRuntimeConfig } from "./validateEnvironment.js";

dotenv.config();
validateRuntimeConfig(process.env);

export default process.env;
