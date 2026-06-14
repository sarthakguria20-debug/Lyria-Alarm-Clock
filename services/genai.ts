import { GoogleGenAI, Modality } from "@google/genai";
import { WeatherData, WEATHER_CODES } from '../types';

// Models
const MODEL_TEXT = "gemini-3-flash-preview";
const MODEL_ID_FULL = "lyria-3-pro-preview";  // Full song (public preview name)
const MODEL_TTS = "gemini-2.5-flash-preview-tts";

export interface SongResult {
  audioBase64: string;
  lyrics: string;
  mimeType: string;
}

/**
 * Step 1: Generate a creative prompt for the music model based on context.
 */
export const generateMusicalPrompt = async (
  weather: WeatherData | null,
  location: string | null,
  agenda: string,
  localTime: Date,
  alarmTime: string
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  
  const weatherDesc = weather 
    ? `${weather.temperature}°C and ${WEATHER_CODES[weather.conditionCode] || 'clear'}`
    : "Unknown weather";

  const dateStr = localTime.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const timeStr = localTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const systemInstruction = `
    You are a world-class Music Director and Lyricist.
    Your goal is to compose a text prompt that generates a song to wake up the user.
    
    CRITICAL REQUIREMENT: The song MUST have lyrics.
    
    1. Analyze the input Context:
       - Weather & Location: Set the mood (e.g., Rain = cozy acoustic; Sun = energetic pop).
       - Date & Time: Weekend vs Workday vibes.
       - User's Agenda: Incorporate specific tasks into the lyrics.
       - Alarm Time: Mention the time explicitly.
       - Clothing: Suggest appropriate clothing.

    2. Output Structure:
       - First sentence: Describe the musical style, genre, tempo, and instruments.
       - Then, write "Lyrics:" followed by 4-8 lines of lyrics.
       - Rhyme scheme: AABB or ABAB. Simple and catchy.
  `;

  const userPrompt = `
    Context:
    - Date: ${dateStr}
    - Current Time: ${timeStr}
    - Wake Up Time: ${alarmTime}
    - Location: ${location || "Unknown"}
    - Weather: ${weatherDesc}
    - Agenda for the day: ${agenda || "No specific plans, just a regular day."}

    Generate the music prompt with lyrics now.
  `;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_TEXT,
      contents: { parts: [{ text: userPrompt }] },
      config: {
        systemInstruction: systemInstruction,
      }
    });

    return response.text || "An uplifting orchestral sunrise theme. Lyrics: Good morning to you, a brand new day is here.";
  } catch (error) {
    console.error("Text generation failed:", error);
    return "A gentle, rising ambient electronic track. Lyrics: Wake up slowly, the day begins.";
  }
};

/**
 * Step 2: Generate the actual music.
 * Uses the Lyria 3 Pro model with streaming for full song generation.
 * Falls back to standard TTS if the music model is overloaded/unavailable.
 */
export const generateSong = async (prompt: string, onProgress?: (msg: string) => void): Promise<SongResult> => {
  // ── Diagnostics ──
  const apiKey = process.env.GEMINI_API_KEY;
  const keyPreview = apiKey 
    ? `${apiKey.substring(0, 6)}...${apiKey.substring(apiKey.length - 4)} (${apiKey.length} chars)` 
    : "⚠️ MISSING / UNDEFINED";
  console.log(`[GenAI] ── Song Generation Start ──`);
  console.log(`[GenAI] API Key: ${keyPreview}`);
  console.log(`[GenAI] Primary Model: ${MODEL_ID_FULL}`);
  console.log(`[GenAI] Fallback Model: ${MODEL_TTS}`);
  console.log(`[GenAI] Prompt (first 200 chars): ${prompt.substring(0, 200)}`);

  if (onProgress) onProgress("Initializing Lyria model session...");
  
  const MAX_RETRIES = 5;
  const BASE_DELAY = 1000;
  let attempt = 0;

  // Attempt 1: Try the specialized Music Model (Lyria 3 Pro)
  while (attempt < MAX_RETRIES) {
    try {
      console.log(`[GenAI] Attempt ${attempt + 1}/${MAX_RETRIES} — calling ${MODEL_ID_FULL}...`);
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const promptText = `Generate a full-length track. \nContext: "${prompt}". \nGenerate lyrics with precise [seconds:] timing markers.`;

      const responseStream = await ai.models.generateContentStream({
        model: MODEL_ID_FULL,
        contents: promptText,
        config: {
          responseModalities: [Modality.AUDIO],
        },
      });

      let audioAccumulator = "";
      let textAccumulator = "";
      let mimeType = "audio/wav";
      let chunkCount = 0;

      for await (const chunk of responseStream) {
        const parts = chunk.candidates?.[0]?.content?.parts;
        if (!parts) {
          console.log(`[GenAI] Stream chunk received with no parts`);
          continue;
        }
        for (const part of parts) {
          if (part.inlineData?.data) {
            if (!audioAccumulator && part.inlineData.mimeType) {
              mimeType = part.inlineData.mimeType;
              console.log(`[GenAI] Audio MIME type detected: ${mimeType}`);
            }
            audioAccumulator += part.inlineData.data;
            chunkCount++;
            if (onProgress && chunkCount % 10 === 0) {
              onProgress(`Receiving audio stream... (${chunkCount} chunks)`);
            }
          }
          if (part.text) {
            textAccumulator += part.text;
          }
        }
      }
      
      if (!audioAccumulator) throw new Error("No audio data received from stream");

      const audioSizeMB = (audioAccumulator.length * 0.75 / 1024 / 1024).toFixed(1);
      console.log(`[GenAI] ✅ Success! Audio: ${audioSizeMB} MB (${mimeType}), ${chunkCount} chunks`);
      if (textAccumulator) console.log(`[GenAI] Lyrics received (${textAccumulator.length} chars):\n${textAccumulator.substring(0, 500)}`);
      if (onProgress) onProgress("Finalizing audio...");

      return { audioBase64: audioAccumulator, lyrics: textAccumulator, mimeType };

    } catch (error: any) {
      attempt++;

      // ── Structured error parsing ──
      const rawMessage = error?.message || error?.toString() || "Unknown error";
      let httpCode = "N/A";
      let apiStatus = "N/A";
      let apiMessage = rawMessage;

      // Try to extract structured error from JSON body
      try {
        const jsonMatch = rawMessage.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.error) {
            httpCode = String(parsed.error.code || "N/A");
            apiStatus = parsed.error.status || "N/A";
            apiMessage = parsed.error.message || rawMessage;
          }
        }
      } catch { /* not JSON, use raw */ }

      console.error(`[GenAI] ❌ Attempt ${attempt}/${MAX_RETRIES} FAILED`);
      console.error(`[GenAI]   HTTP Code: ${httpCode}`);
      console.error(`[GenAI]   Status:    ${apiStatus}`);
      console.error(`[GenAI]   Message:   ${apiMessage}`);
      console.error(`[GenAI]   Model:     ${MODEL_ID_FULL}`);
      console.error(`[GenAI]   Full error:`, error);

      const isOverloaded = rawMessage.includes("503") || 
                           rawMessage.includes("UNAVAILABLE") || 
                           rawMessage.includes("overloaded");
      const isPermission = rawMessage.includes("403") || 
                           rawMessage.includes("PERMISSION_DENIED");

      if (isPermission) {
        console.error(`[GenAI] 🔒 PERMISSION_DENIED — Your API key does not have access to model "${MODEL_ID_FULL}".`);
        console.error(`[GenAI]    This typically means:`);
        console.error(`[GenAI]    1. The model "${MODEL_ID_FULL}" is not enabled for your API key / project`);
        console.error(`[GenAI]    2. Your API key may need allowlisting for this EAP model`);
        console.error(`[GenAI]    3. Try switching to the public preview name: "lyria-3-pro-preview"`);
        break; // No point retrying a permission error
      }

      if (isOverloaded && attempt < MAX_RETRIES) {
        const delayMs = BASE_DELAY * Math.pow(2, attempt - 1); 
        const msg = `Model busy, retrying in ${delayMs/1000}s (Attempt ${attempt}/${MAX_RETRIES})...`;
        console.warn(`[GenAI] ⏳ ${msg}`);
        if (onProgress) onProgress(msg);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }
      
      console.warn(`[GenAI] Primary music model failed after ${attempt} attempts, switching to backup...`);
      break;
    }
  }

  // Attempt 2: Fallback to TTS (Gemini 2.5 Flash TTS)
  console.log(`[GenAI] ── Fallback: trying ${MODEL_TTS} ──`);
  if (onProgress) onProgress("Engaging backup vocal synthesis...");
  
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    console.log(`[GenAI] Calling ${MODEL_TTS} with Modality.AUDIO...`);

    const ttsResponse = await ai.models.generateContent({
      model: MODEL_TTS,
      contents: { 
        parts: [{ 
          text: `(Perform this text as an energetic rhythmic song) ${prompt}` 
        }] 
      },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Fenrir' },
          },
        },
      },
    });

    const ttsPart = ttsResponse.candidates?.[0]?.content?.parts?.[0];
    const ttsData = ttsPart?.inlineData?.data;
    const ttsMimeType = ttsPart?.inlineData?.mimeType || "audio/wav";

    console.log(`[GenAI] TTS response — has data: ${!!ttsData}, mime: ${ttsMimeType}, data length: ${ttsData?.length ?? 0} chars`);

    if (ttsData) {
      console.log(`[GenAI] ✅ TTS fallback succeeded (${(ttsData.length * 0.75 / 1024 / 1024).toFixed(1)} MB)`);
      return { audioBase64: ttsData, lyrics: "", mimeType: ttsMimeType };
    }

    // Log the full response structure if no data found
    console.error(`[GenAI] TTS returned no audio data. Full response structure:`, JSON.stringify({
      candidateCount: ttsResponse.candidates?.length,
      parts: ttsResponse.candidates?.[0]?.content?.parts?.map((p: any) => ({
        hasText: !!p.text,
        hasInlineData: !!p.inlineData,
        mimeType: p.inlineData?.mimeType,
        dataLength: p.inlineData?.data?.length,
      })),
    }, null, 2));

    throw new Error("Backup TTS generation returned no audio data");

  } catch (ttsError: any) {
    console.error(`[GenAI] ❌ TTS Fallback also failed:`);
    console.error(`[GenAI]   Error: ${ttsError?.message || ttsError}`);
    console.error(`[GenAI]   Full:`, ttsError);
    throw ttsError;
  }
};