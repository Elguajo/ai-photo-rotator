import { GoogleGenAI, Type, Modality, GenerateContentResponse } from "@google/genai";

export type ModelMode = 'standard' | 'pro';

// Function to create a fresh instance of GoogleGenAI using the current API_KEY.
// This is necessary because the user might select a key dynamically via window.aistudio.
const getAI = () => {
  if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable is not set. If running locally, please check README.md for bundler configuration instructions.");
  }
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

// Helper function to retry operations on 503 errors
async function retryWithBackoff<T>(fn: () => Promise<T>, retries = 3, delay = 2000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    // Check for 503 status or "overloaded" message
    const isOverloaded = error?.status === 503 || 
                         error?.message?.includes('overloaded') || 
                         error?.message?.includes('503');
                         
    if (retries > 0 && isOverloaded) {
      console.warn(`Model overloaded (503). Retrying in ${delay}ms... (${retries} retries left)`);
      await new Promise(r => setTimeout(r, delay));
      return retryWithBackoff(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

const getPovPrompt = (isObjectRotationOnly: boolean): string => {
  if (isObjectRotationOnly) {
    return `
    **Role:** You are an expert 3D object analyst AI.
    **Task:** Analyze the input image to identify the subject's current orientation (front, side, top, or back). Then, generate three distinct, highly-detailed prompts for the **three missing** canonical orientations.

    **Requirements:**
    1. Identify the current orientation internally.
    2. Generate prompts ONLY for the three missing orientations.
    3. Each prompt must describe isolating the subject on a seamless white background.
    4. Each prompt must be detailed (consisting of exactly three paragraphs: Orientation/Staging, Lighting/Shadow, Subject Details).

    **Output:**
    Return ONLY a valid JSON object with a single key "prompts" containing the array of 3 prompt strings. Do not output any other text.
    `;
  }

  return `
    **Role:** You are a world-class virtual cinematographer AI.
    **Task:** Analyze the input image to determine its camera Point of View (POV) (front, side, top, or back). Then, generate three distinct, highly-detailed prompts for the **three missing** canonical POVs.

    **Requirements:**
    1. Identify the current POV internally.
    2. Generate prompts ONLY for the three missing POVs.
    3. Each prompt must describe moving the VIRTUAL CAMERA to the new position.
    4. Each prompt must be detailed (consisting of exactly three paragraphs: Camera/Composition, Lighting/Atmosphere, Subject/Scene Details).

    **Output:**
    Return ONLY a valid JSON object with a single key "prompts" containing the array of 3 prompt strings. Do not output any other text.
    `;
};

export const getRotationPrompts = async (base64Image: string, mimeType: string, isObjectRotationOnly: boolean, mode: ModelMode): Promise<string[]> => {
  const prompt = getPovPrompt(isObjectRotationOnly);
  const ai = getAI();
  
  // Select model based on mode
  const modelName = mode === 'pro' ? 'gemini-3-pro-preview' : 'gemini-2.5-flash';
  
  const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
    model: modelName,
    contents: {
      parts: [
        { inlineData: { data: base64Image, mimeType } },
        { text: prompt }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          prompts: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          }
        },
        required: ["prompts"]
      }
    }
  }));

  try {
    let jsonText = response.text || "";
    
    // 1. Remove Markdown code blocks if present
    jsonText = jsonText.replace(/```json/gi, '').replace(/```/g, '').trim();

    // 2. Locate the first '{' and last '}' to extract just the JSON object
    const firstBrace = jsonText.indexOf('{');
    const lastBrace = jsonText.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace >= firstBrace) {
      jsonText = jsonText.substring(firstBrace, lastBrace + 1);
    }
    
    const result = JSON.parse(jsonText);
    
    // Robust checks
    if (result && Array.isArray(result.prompts)) {
       // Filter out empty strings or non-string values just in case
       const validPrompts = result.prompts.filter((p: any) => typeof p === 'string' && p.length > 10);
       
       if (validPrompts.length >= 3) {
         return validPrompts.slice(0, 3);
       }
    }
    
    // Fallback: Check if the root result is the array itself (rare but possible with some model quirks)
    if (Array.isArray(result) && result.length >= 3) {
        return result.slice(0, 3).filter((p: any) => typeof p === 'string');
    }

  } catch (e) {
    console.error("Failed to parse JSON from Gemini:", e);
    console.log("Raw text:", response.text); 
  }

  console.error("Malformed Response Content:", response.text);
  throw new Error("Could not get valid rotation prompts from the AI. The response was malformed.");
};

export const generateRotatedImage = async (
  base64Image: string, 
  mimeType: string, 
  prompt: string, 
  mode: ModelMode,
  style: string = 'Realistic',
  aspectRatio: string = '1:1'
): Promise<string> => {
  const ai = getAI();
  
  // Select model based on mode
  // Pro: gemini-3-pro-image-preview
  // Standard: gemini-2.5-flash-image
  const modelName = mode === 'pro' ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image';
  
  // Modify prompt based on style
  let finalPrompt = prompt;
  if (style !== 'Realistic') {
    finalPrompt = `${prompt}\n\nIMPORTANT: Render this image in the style of: ${style}. Maintain the subject's identity but apply this art style strongly.`;
  }

  const response: GenerateContentResponse = await retryWithBackoff(() => ai.models.generateContent({
    model: modelName,
    contents: {
      parts: [
        { inlineData: { data: base64Image, mimeType } },
        { text: finalPrompt }
      ]
    },
    config: {
      // imageConfig supported by both models
      imageConfig: {
        aspectRatio: aspectRatio
      }
    },
  }));

  // Iterate through parts to find the image
  if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
              const newMimeType = part.inlineData.mimeType;
              const newBase64 = part.inlineData.data;
              return `data:${newMimeType};base64,${newBase64}`;
          }
      }
  }

  throw new Error("The AI did not return an image. It might not be able to process this request.");
};