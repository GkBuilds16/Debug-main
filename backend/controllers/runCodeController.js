import axios from "axios";

//////////////////////////////////////////////////
// CONSTANTS
//////////////////////////////////////////////////

const MAX_CODE_LENGTH = 10000;
const MAX_INPUT_LENGTH = 5000;
const JUDGE0_TIMEOUT = 15000;
const CPU_TIME_LIMIT = 5;
const MEMORY_LIMIT_KB = 128000;
const JUDGE0_API_URL = (process.env.JUDGE0_API_URL || "https://ce.judge0.com").replace(/\/$/, "");

//////////////////////////////////////////////////
// RUN CODE
//////////////////////////////////////////////////

export const runCode = async (req, res) => {
  try {

    const {
      code,
      language,
      input
    } = req.body;

    //////////////////////////////////////////////////
    // LANGUAGE MAP
    //////////////////////////////////////////////////

    const languageMap = {
      javascript: 63,
      python: 71,
      java: 62,
      cpp: 54,
      c: 50
    };

    //////////////////////////////////////////////////
    // VALIDATION
    //////////////////////////////////////////////////

    if (typeof code !== "string" || !code.trim() || typeof language !== "string") {
      return res.status(400).json({
        message: "Code and language are required"
      });
    }

    if (!languageMap[language]) {
      return res.status(400).json({
        message: "Unsupported language"
      });
    }

    //////////////////////////////////////////////////
    // CODE SIZE LIMIT
    //////////////////////////////////////////////////

    if (code.length > MAX_CODE_LENGTH) {
      return res.status(400).json({
        message: "Code exceeds maximum allowed size"
      });
    }

    //////////////////////////////////////////////////
    // INPUT SIZE LIMIT
    //////////////////////////////////////////////////

    if (input !== undefined && typeof input !== "string") {
      return res.status(400).json({ message: "Input must be text" });
    }

    if (input && input.length > MAX_INPUT_LENGTH) {
      return res.status(400).json({
        message: "Input exceeds maximum allowed size"
      });
    }

    //////////////////////////////////////////////////
    // JUDGE0 API
    //////////////////////////////////////////////////

    const response = await axios.post(
      `${JUDGE0_API_URL}/submissions?base64_encoded=false&wait=true`,
      {
        source_code: code,
        language_id: languageMap[language],
        stdin: input || "",
        cpu_time_limit: CPU_TIME_LIMIT,
        wall_time_limit: JUDGE0_TIMEOUT / 1000,
        memory_limit: MEMORY_LIMIT_KB
      },
      {
        timeout: JUDGE0_TIMEOUT
      }
    );

    //////////////////////////////////////////////////
    // RESPONSE
    //////////////////////////////////////////////////

    return res.status(200).json(response.data);

  } catch (err) {

    if (err.code === "ECONNABORTED") {

      return res.status(504).json({
        message: "Code execution timed out"
      });

    }

    console.error(
      "CODE EXECUTION ERROR:",
      err.message
    );

    return res.status(500).json({
      message: "Execution failed"
    });

  }
};
