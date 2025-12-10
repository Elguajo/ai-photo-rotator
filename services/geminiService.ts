import { GoogleGenAI, Type, Modality, GenerateContentResponse } from "@google/genai";

export type ModelMode = 'standard' | 'pro';

// Function to create a fresh instance of GoogleGenAI using the current API_KEY.
// This is necessary because the user might select a key dynamically via window.aistudio.
const getAI = () => {
  if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable is not set");
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
    **Objective:** Analyze an input image to determine the main subject's orientation and then write three distinct, highly-detailed, three-paragraph prompts to generate the three *missing* canonical orientations ('front', 'side', 'top', 'back'). The subject MUST be placed on a plain white background.

    **Your process MUST follow these steps precisely:**

    **Step 1: Analyze and Identify.**
    - Examine the input image.
    - Determine which ONE of the four canonical orientations ('front', 'side', 'top', or 'back') the main subject most accurately represents.
    - State this orientation internally. For example: "The input image is a 'side' view."

    **Step 2: Determine the Missing Orientations.**
    - Based on your identification in Step 1, list the three remaining canonical orientations.
    - Example: If the input was 'side', the missing orientations are 'front', 'top', and 'back'.

    **Step 3: Write Three Distinct Prompts.**
    - For EACH of the three missing orientations identified in Step 2, write a unique and detailed prompt.
    - **YOU MUST NOT write a prompt for the orientation you identified in Step 1.** This is a critical rule.
    - Each prompt must describe isolating the subject and rendering it on a seamless white background.

    **Prompt Structure Requirements (for EACH of the three prompts):**
    - **Exactly Three Paragraphs:** Each prompt you write must consist of exactly three paragraphs.
    - **Paragraph 1 (Orientation & Staging):** Describe the precise new orientation. Command the AI to isolate the subject from its original background and place it on a solid, clean, seamless white background.
    - **Paragraph 2 (Lighting & Shadow):** Detail the lighting for the new orientation. Where should the key light be? How should shadows be cast on the white ground plane to create a sense of realism and volume?
    - **Paragraph 3 (Subject Details & Texture):** Describe the specific parts of the subject that are now visible from this new angle. Emphasize maintaining texture, material, and color consistency with the original image.`;
  }

  return `
    **Role:** You are a world-class virtual cinematographer AI.
    **Objective:** Analyze an input image to determine its camera Point of View (POV) and then write three distinct, highly-detailed, three-paragraph prompts to generate the three *missing* canonical POVs ('front', 'side', 'top', 'back').

    **Your process MUST follow these steps precisely:**

    **Step 1: Analyze and Identify.**
    - Examine the input image.
    - Determine which ONE of the four canonical POVs ('front', 'side', 'top', or 'back') it most accurately represents.
    - State this POV internally. For example: "The input image is a 'side' view."

    **Step 2: Determine the Missing POVs.**
    - Based on your identification in Step 1, list the three remaining canonical POVs.
    - Example: If the input was 'side', the missing POVs are 'front', 'top', and 'back'.

    **Step 3: Write Three Distinct Prompts.**
    - For EACH of the three missing POVs identified in Step 2, write a unique and detailed prompt.
    - **YOU MUST NOT write a prompt for the POV you identified in Step 1.** This is a critical rule.
    - Each prompt must describe moving the VIRTUAL CAMERA to the new position. The entire scene, including background and lighting, must change.

    **Prompt Structure Requirements (for EACH of the three prompts):**
    - **Exactly Three Paragraphs:** Each prompt you write must consist of exactly three paragraphs.
    - **Paragraph 1 (Camera & Composition):** Describe the new camera position, angle, and framing of the scene. How does the composition change? What is in the foreground/background now?
    - **Paragraph 2 (Lighting & Atmosphere):** Describe the new lighting scheme. Where is the key light coming from? How are shadows cast across the entire scene? What is the mood?
    - **Paragraph 3 (Subject & Scene Details):** Describe how the main subject appears from this new angle. What new details on the subject are visible? How does the background parallax shift? What new textures or reflections can be seen throughout the scene.`;
};

export const getRotationPrompts = async (base64Image: string, mimeType: string, isObjectRotationOnly: boolean, mode: ModelMode): Promise<string[]> => {
  const prompt = getPovPrompt(isObjectRotationOnly);
  const ai = getAI();
  
  // Select model based on mode
  const modelName = mode === 'pro' ? 'gemini-3-pro-preview' : 'gemini-2.5-flash';
  
  const response = await retryWithBackoff(() => ai.models.generateContent({
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
    
    // 1. Remove Markdown code blocks if present (e.g. ```json ... ```)
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
    console.log("Raw text:", response.text); // Helpful for debugging
    throw new Error("The AI failed to return valid rotation instructions. Please try a different image.");
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

  const imagePart = response.candidates?.[0]?.content?.parts?.find(part => part.inlineData);
  if (imagePart?.inlineData) {
    const newMimeType = imagePart.inlineData.mimeType;
    const newBase64 = imagePart.inlineData.data;
    return `data:${newMimeType};base64,${newBase64}`;
  }

  throw new Error("The AI did not return an image. It might not be able to process this request.");
};
