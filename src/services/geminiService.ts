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
  existingDocument?: string;
  updateInstructions?: string;
  time?: string;
  description?: string;
  involvedParties?: string;
  immediateActions?: string;
  witnesses?: string;
  existingControls?: string;
  proposedControls?: string;
}

export async function generateQHSEDocument(params: QHSEParams) {
  let prompt = `
    You are a professional QHSE Consultant with 15 years of experience.
    Generate a full, professional ${params.type} document for:
    Company: ${params.companyName}
    Project: ${params.projectName}
    Location: ${params.location}
    Date: ${params.date}
    Format Style: ${params.formatStyle || 'Corporate Standard'}
  `;

  if (params.type === 'Incident Report') {
    prompt += `
    Time of Incident: ${params.time}
    Description of Incident: ${params.description}
    Involved Parties: ${params.involvedParties}
    Immediate Actions Taken: ${params.immediateActions}
    Witnesses: ${params.witnesses}
    `;
  } else if (params.type === 'Job Hazard Analysis (JHA)') {
    prompt += `
    Task: ${params.taskActivity}
    Hazards: ${params.hazards}
    Existing Controls: ${params.existingControls}
    Proposed Controls: ${params.proposedControls}
    Required PPE: ${params.ppe}
    Supervisor: ${params.supervisorName}
    `;
  } else {
    prompt += `
    Activity: ${params.taskActivity}
    Hazards: ${params.hazards}
    Workers: ${params.numWorkers}
    PPE: ${params.ppe}
    Supervisor: ${params.supervisorName}
    `;
  }

  if (params.existingDocument) {
    prompt += `
    
    IMPORTANT: The user has provided an EXISTING document. You must UPDATE and IMPROVE this existing document based on the parameters above and the specific instructions below.
    
    Update Instructions: ${params.updateInstructions || 'Update the document to match the provided parameters and improve its professional quality.'}
    
    Existing Document Content:
    ${params.existingDocument}
    `;
  } else {
    if (params.type === 'Incident Report') {
      prompt += `
      The document must include:
      - Incident Details (Date, Time, Location)
      - Description of Event
      - Involved Parties & Witnesses
      - Immediate Actions Taken
      - Root Cause Analysis (preliminary)
      - Corrective/Preventative Actions
      - Signatures/Approval
      `;
    } else if (params.type === 'Job Hazard Analysis (JHA)') {
      prompt += `
      The document must include:
      - Title Page & Metadata
      - Task Description
      - Step-by-Step Hazard Analysis Table (Task Steps, Hazards, Existing Controls, Proposed Controls, Risk Rating)
      - Required PPE
      - Signatures/Approval
      `;
    } else {
      prompt += `
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
      `;
    }
  }

  prompt += `
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

export interface PresentationParams {
  topic: string;
  audience: string;
  numSlides: string;
  keyPoints: string;
  formatStyle?: string;
  existingDocument?: string;
  updateInstructions?: string;
}

export async function generatePresentation(params: PresentationParams) {
  let prompt = `
    You are an expert Presentation Designer and Content Creator.
    Generate a professional presentation slide deck for:
    Topic: ${params.topic}
    Target Audience: ${params.audience}
    Number of Slides: ${params.numSlides || '10'}
    Key Points to Cover: ${params.keyPoints}
    Format Style: ${params.formatStyle || 'Professional'}
  `;

  if (params.existingDocument) {
    prompt += `
    
    IMPORTANT: The user has provided an EXISTING document or presentation. You must REDESIGN and IMPROVE this existing content into a professional slide deck based on the parameters above and the specific instructions below.
    
    Redesign Instructions: ${params.updateInstructions || 'Summarize and convert the provided document into a professional presentation.'}
    
    Existing Content:
    ${params.existingDocument}
    `;
  }

  prompt += `
    The output MUST be in Markdown format.
    Use "---" (three hyphens) to separate each slide.
    For each slide, include:
    - A clear, engaging Slide Title (using Markdown H2: ##)
    - Bullet points for the main content
    - Speaker Notes at the bottom of the slide (under a "Speaker Notes:" heading)

    Writing style: Concise, impactful, and tailored to the audience.
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
    
    CRITICAL INSTRUCTIONS FOR FORMATTING AND TABLES:
    - You MUST preserve all table structures, including nested tables and merged cells.
    - If you encounter tabular data, format it strictly as Markdown tables.
    - Ensure columns align correctly and cell data is not mixed up.
    - If a table has merged cells, represent the data logically within the Markdown table constraints (e.g., repeating the merged value or combining headers).
    - For nested tables, use HTML tables inside Markdown if necessary, or flatten them logically.
    - Maintain the hierarchy of headings (H1, H2, H3) to reflect the document structure.
    - Leverage advanced parsing techniques to better preserve complex formatting, including multi-column layouts, intricate tables, and custom fonts (by using appropriate markdown formatting like bold/italic/headers).
    - Ensure the output maintains structural integrity and readability.
    
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
