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

// CORS configuration
app.use(
	cors({
		origin: (origin, callback) => {
			if (origin === "https://yt-scriptwriter.netlify.app" || !origin) {
				callback(null, true);
			} else {
				callback(new Error("Not allowed by CORS"));
			}
		},
		methods: ["GET", "POST", "OPTIONS"],
		allowedHeaders: ["Content-Type", "x-api-key"],
	})
);
// Handle OPTIONS requests (preflight)
app.options("*", cors()); // Allow preflight across all routes

app.use(express.json());

// Rate limiting to prevent abuse
const limiter = rateLimit({
	windowMs: 10 * 60 * 1000, // 10 minutes
	max: 100, // Max 100 requests per IP
	message: "Too many requests, please try again later.",
});
app.use(limiter);

app.get("/api/health", (req, res) => {
	res.json({ status: "ok" });
});

app.post("/api/translate", async (req, res) => {
	try {
		console.log("Request body:", req.body); // Log the request body for debugging
		const {
			content,
			sourceLanguage,
			targetLanguage,
			additionalNotes,
			customPrompt,
		} = req.body;

		// Check if content is missing or empty
		if (!content || content.trim() === "") {
			return res
				.status(400)
				.json({ error: "Missing content in request." });
		}

		// Construct the custom prompt by replacing the placeholders
		const finalPrompt = customPrompt
			.replace("{sourceLanguage}", sourceLanguage)
			.replace("{additionalNotes}", additionalNotes)
			.replace("{text}", content);

		console.log("Using custom prompt:", finalPrompt);

		const model = "mixtral-8x7b-32768";

		console.log(`Using model: ${model}`);
		console.log("Final prompt content:", finalPrompt);

		// Send the final prompt to the Groq API
		const chatCompletion = await groq.chat.completions.create({
			model,
			messages: [{ role: "user", content: finalPrompt }],
			temperature: 0.7,
			max_tokens: 8192,
		});

		const responseText = chatCompletion.choices[0]?.message?.content || "";
		res.json({ translatedText: responseText }); // ✅ New
	} catch (error) {
		console.error(
			"Error calling Groq API:",
			error.response?.data || error.message
		);
		res.status(500).json({
			error: "An error occurred. Please try again later.",
		});
	}
});

app.post("/api/improve-script", async (req, res) => {
	try {
		console.log("Request body:", req.body);

		const { script, conditions, customPrompt } = req.body;

		// Validate input
		if (!script || script.trim() === "") {
			return res
				.status(400)
				.json({ error: "Missing script in request." });
		}

		// Construct the final prompt
		const finalPrompt = customPrompt
			? customPrompt
					.replace("{conditions}", conditions)
					.replace("{script}", script)
			: `Improve the following script based on these conditions: ${conditions}\n\n${script}`;

		console.log("Using custom prompt:", finalPrompt);

		const model = "mixtral-8x7b-32768";
		console.log(`Using model: ${model}`);

		// Call Groq API
		const chatCompletion = await groq.chat.completions.create({
			model,
			messages: [{ role: "user", content: finalPrompt }],
			temperature: 0.7,
			max_tokens: 8192,
		});

		const responseText = chatCompletion.choices[0]?.message?.content || "";
		res.json({ improvedScript: responseText }); // ✅ Send response
	} catch (error) {
		console.error(
			"Error calling Groq API:",
			error.response?.data || error.message
		);
		res.status(500).json({
			error: "An error occurred. Please try again later.",
		});
	}
});

async function callGroqAPI(prompt, model) {
	try {
		const response = await groq.chat.completions.create({
			model,
			messages: [{ role: "user", content: prompt }],
			temperature: 0.7,
			max_tokens: 8192,
		});

		return response.choices[0]?.message?.content || "No script generated";
	} catch (error) {
		console.error(
			"API call failed:",
			error.response?.data || error.message
		);
		throw new Error("Error calling the Groq API");
	}
}

// API route for generating the script
app.post("/api/generate-script", async (req, res) => {
	try {
		const { dialog, plot, genre, customPrompt } = req.body;

		// Validate required fields
		if (!dialog || !plot) {
			return res
				.status(400)
				.json({ error: "Dialog and plot are required" });
		}

		// Prepare variables for prompt template
		const promptVariables = {
			dialog,
			plot,
			genre: genre || "drama",
		};

		// Create prompt using custom template if provided
		const prompt = customPrompt
			? customPrompt.replace(
					/{(\w+)}/g,
					(match, variable) => promptVariables[variable] || match
			  )
			: `Generate a ${
					genre || "drama"
			  } script based on the following dialog and plot:

Dialog:
${dialog}

Plot:
${plot}

Please format it as a proper screenplay.`;

		// Call Groq API
		const generatedScript = await callGroqAPI(prompt, "mixtral-8x7b-32768");

		// Return the generated script
		res.json({ generatedScript });
	} catch (error) {
		console.error("Script generation error:", error);
		res.status(500).json({
			error: "An error occurred while generating the script.",
		});
	}
});
app.listen(PORT, () => {
	console.log(`Server running on port ${PORT}`);
});
