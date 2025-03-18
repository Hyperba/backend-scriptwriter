import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Groq } from "groq-sdk";
import rateLimit from "express-rate-limit";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

if (!GROQ_API_KEY) {
    console.error("Missing GROQ_API_KEY in environment variables.");
    process.exit(1);
}

const groq = new Groq({ apiKey: GROQ_API_KEY });

const allowedOrigins = [
    "https://yt-scriptwriter.netlify.app",
    "http://localhost:5173", 
];

app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

app.use(
    cors({
        origin: function (origin, callback) {
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                console.log("Blocked by CORS:", origin);
                callback(new Error("Not allowed by CORS"));
            }
        },
        methods: ["GET", "POST", "OPTIONS"],
        allowedHeaders: ["Content-Type", "x-api-key"],
        credentials: true,  // Allow credentials if needed
    })
);

// Ensure preflight requests are handled properly
app.options("*", (req, res) => {
    res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.sendStatus(200);
});

app.use(express.json());

const limiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 100,
    message: "Too many requests, please try again later.",
});
app.use(limiter);

app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
});

app.get("/api/keep-alive", (req, res) => {
    res.json({ message: "Server is active." });
});

async function callGroqAPI(prompt, model) {
    try {
        const response = await groq.chat.completions.create({
            model,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.7,
            max_tokens: 8192,
        });
        return response.choices[0]?.message?.content || "No response from AI";
    } catch (error) {
        console.error("Groq API error:", error.message);
        throw new Error("Error calling Groq API");
    }
}

app.post("/api/translate", async (req, res) => {
    try {
        const { content, sourceLanguage, targetLanguage, additionalNotes, customPrompt } = req.body;

        if (!content || content.trim() === "") {
            return res.status(400).json({ error: "Missing content in request." });
        }

        const finalPrompt = customPrompt
            .replace("{sourceLanguage}", sourceLanguage)
            .replace("{targetLanguage}", targetLanguage)
            .replace("{additionalNotes}", additionalNotes)
            .replace("{text}", content);

        const translatedText = await callGroqAPI(finalPrompt, "mixtral-8x7b-32768");
        res.json({ translatedText });
    } catch (error) {
        console.error("Translation error:", error.message);
        res.status(500).json({ error: "An error occurred while translating." });
    }
});

app.post("/api/improve-script", async (req, res) => {
    try {
        const { script, conditions, customPrompt } = req.body;

        if (!script || script.trim() === "") {
            return res.status(400).json({ error: "Missing script in request." });
        }

        const finalPrompt = customPrompt
            ? customPrompt.replace("{conditions}", conditions).replace("{script}", script)
            : `Improve the following script based on these conditions: ${conditions}\n\n${script}`;

        const improvedScript = await callGroqAPI(finalPrompt, "mixtral-8x7b-32768");
        res.json({ improvedScript });
    } catch (error) {
        console.error("Script improvement error:", error.message);
        res.status(500).json({ error: "An error occurred while improving the script." });
    }
});

app.post("/api/generate-script", async (req, res) => {
    try {
        const { dialog, plot, genre, customPrompt } = req.body;

        if (!dialog || !plot) {
            return res.status(400).json({ error: "Dialog and plot are required." });
        }

        const promptVariables = { dialog, plot, genre: genre || "drama" };

        const prompt = customPrompt
            ? customPrompt.replace(/{(\w+)}/g, (match, variable) => promptVariables[variable] || match)
            : `Generate a ${genre || "drama"} script based on the following dialog and plot:\n\nDialog:\n${dialog}\n\nPlot:\n${plot}\n\nPlease format it as a proper screenplay.`;

        const generatedScript = await callGroqAPI(prompt, "mixtral-8x7b-32768");
        res.json({ generatedScript });
    } catch (error) {
        console.error("Script generation error:", error.message);
        res.status(500).json({ error: "An error occurred while generating the script." });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
