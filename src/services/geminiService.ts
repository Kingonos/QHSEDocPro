import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export interface QHSEParams {
  type: string;
  companyName: string;
  projectName: string;
  location: string;
  taskActivity: string;
  hazards: string;
  numWorkers: string;
  ppe: string;
  date: string;
  supervisorName: string;
  formatStyle?: string;
}

export async function generateQHSEDocument(params: QHSEParams) {
  const prompt = `
    You are a professional QHSE Consultant with 15 years of experience.
    Generate a full, professional ${params.type} document for:
    Company: ${params.companyName}
    Project: ${params.projectName}
    Location: ${params.location}
    Activity: ${params.taskActivity}
    Hazards: ${params.hazards}
    Workers: ${params.numWorkers}
    PPE: ${params.ppe}
    Date: ${params.date}
    Supervisor: ${params.supervisorName}
    Format Style: ${params.formatStyle || 'Corporate Standard'}

    The document must include:
    - Title Page
    - Purpose
    - Scope
    - Responsibilities
    - Procedures
    - Risk Table (if applicable)
    - Control Measures
    - PPE Requirements
    - References
    - Approval Page

    Ensure the formatting strictly follows the requested Format Style (${params.formatStyle || 'Corporate Standard'}).
    Writing style: Professional, human-like, clear, and natural. Avoid robotic or AI-sounding phrases.
    Format: Markdown.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
  });

  return response.text;
}

export interface ProjectParams {
  topic: string;
  level: string;
  formatStyle?: string;
}

export async function generateSchoolProject(params: ProjectParams) {
  const prompt = `
    You are a professional Academic Writer.
    Generate a natural, human-written academic project for:
    Topic: ${params.topic}
    Level: ${params.level}
    Format Style: ${params.formatStyle || 'APA'}

    The project must include:
    - Abstract
    - Table of Contents
    - Chapter One: Introduction
    - Chapter Two: Literature Review
    - Chapter Three: Methodology
    - Chapter Four: Results and Discussion
    - Chapter Five: Conclusion and Recommendation
    - References (in ${params.formatStyle || 'APA'} format)

    Ensure the citations and overall structure strictly follow the requested Format Style (${params.formatStyle || 'APA'}).
    Writing style: Human-written, simple English, natural flow, no robotic or AI phrases. Include real-life examples where relevant. Well-structured and plagiarism-free.
    Format: Markdown.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
  });

  return response.text;
}

export async function generatePermitToWork(params: any) {
  const prompt = `
    You are a professional QHSE Consultant.
    Generate a full, professional 'Permit to Work' document for:
    Company: ${params.companyName}
    Project: ${params.projectName}
    Location: ${params.location}
    Activity: ${params.taskActivity}
    Duration: ${params.duration}
    Authorized Personnel: ${params.authorizedPersonnel}
    Safety Precautions: ${params.safetyPrecautions}

    The document must include:
    - Permit Number & Date
    - Description of Work
    - Hazard Identification
    - Safety Precautions & Controls
    - PPE Requirements
    - Isolation/Lockout (if applicable)
    - Gas Testing (if applicable)
    - Authorization & Sign-off Section
    - Hand-back & Cancellation Section

    Writing style: Professional, human-like, clear, and natural.
    Format: Markdown.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
  });

  return response.text;
}

export async function extractTextFromPDF(content: string) {
  const prompt = `
    You are a professional Document Specialist and Data Extraction Expert.
    Extract the text from the following OCR/PDF content and format it into a clean, professional Markdown document.
    
    CRITICAL INSTRUCTIONS FOR TABLES:
    - You MUST preserve all table structures, including nested tables and merged cells.
    - If you encounter tabular data, format it strictly as Markdown tables.
    - Ensure columns align correctly and cell data is not mixed up.
    - If a table has merged cells, represent the data logically within the Markdown table constraints (e.g., repeating the merged value or combining headers).
    - For nested tables, use HTML tables inside Markdown if necessary, or flatten them logically.
    - Maintain the hierarchy of headings (H1, H2, H3) to reflect the document structure.
    
    Raw Content:
    ${content}

    Output: Clean Markdown.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: prompt,
  });

  return response.text;
}

export async function rewriteDocument(content: string, instruction: string) {
  const prompt = `
    You are a professional Document Editing Specialist.
    Rewrite or edit the following document based on these instructions: "${instruction}"

    Document Content:
    ${content}

    Writing style: Professional, human-like, clear, and natural. Maintain the original intent but improve flow, grammar, and professional tone.
    Format: Markdown.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
  });

  return response.text;
}
