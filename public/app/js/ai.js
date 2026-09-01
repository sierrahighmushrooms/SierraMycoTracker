// MycoAI - Gemini 2.5 Flash API integration for the Sierra Myco Lab AI Assistant.
// Provides system prompt, active batch context extraction, API calls, and action execution.

import { db, saveItems } from './db.js';
import { GEMINI } from './config.js';
import { generateId, getMediumInitials, getStrainInitials, formatMMDDYY } from './utils.js';

// localStorage key for storing the user's Gemini API key
const GEMINI_KEY_STORAGE = 'myco_gemini_api_key';

// --- API Key Management ---
export function getStoredApiKey() {
  return localStorage.getItem(GEMINI_KEY_STORAGE) || '';
}

export function saveApiKey(key) {
  const trimmed = key.trim();
  if (!trimmed) return false;
  localStorage.setItem(GEMINI_KEY_STORAGE, trimmed);
  return true;
}

export function clearApiKey() {
  localStorage.removeItem(GEMINI_KEY_STORAGE);
}

export function hasApiKey() {
  const storedKey = getStoredApiKey();
  return storedKey.length > 0 || GEMINI.apiKey.length > 0;
}

// Get the effective API key (localStorage takes precedence over config)
function getEffectiveApiKey() {
  return getStoredApiKey() || GEMINI.apiKey;
}

// System prompt defining MycoAI's persona and behavior
export const SYSTEM_PROMPT = `
You are MycoAI, an expert mycology master cultivator and diagnostic assistant embedded in the Sierra Myco Lab app.

YOUR CORE RESPONSIBILITIES:
1. Provide practical, scientific, and actionable mycology advice (agar, LC, grain spawn, bulk substrate).
2. Direct advice using the user's ACTIVE CULTIVATION BATCHES provided in the context below. Reference specific Batch IDs, Strains, Mediums, and current Stages whenever applicable.
3. Prioritize sterile technique, proper field capacity, correct FAE vs. RH, and early contamination isolation.
4. If the user reports symptoms matching contamination (e.g., green powder, sour rot smell, grey webbing), immediately advise isolating the affected container away from their grow area.

STYLE & FORMATTING:
- Keep answers concise, direct, and formatted with clear Markdown lists/bolding for mobile screens.
- Maintain a purely scientific, educational, and cultivation-focused tone for gourmet and medicinal mushrooms.

ACTION EXECUTION (INVENTORY LOGGING):
If the user explicitly asks to ADD, LOG, CREATE, UPDATE, or HARVEST inventory items, you MUST include an ACTION_PAYLOAD JSON block in your response. The block must be wrapped in triple backticks with the language identifier "action_payload".

Format:
\`\`\`action_payload
{
  "action": "CREATE_ITEMS" | "UPDATE_STAGE" | "LOG_HARVEST",
  "data": [
    {
      "name": "Item display name (e.g., Golden Teacher Oat Jar)",
      "strain": "Strain name (e.g., Golden Teacher)",
      "mediumType": "Medium type (e.g., Grain (Oats), CVG Bulk, Liquid Culture, Agar)",
      "stage": "Current stage (Preparation, Inoculated, Colonizing, Fully Colonized, Fruiting, Ready to Use)",
      "containerType": "Container (e.g., Mason Jar, Grow Bag, Petri Dish, Monotub)",
      "quantity": 5
    }
  ]
}
\`\`\`

For UPDATE_STAGE actions, include the batchId field in each data object to identify which item to update.
For LOG_HARVEST actions, include the batchId and yieldGrams fields.

Always confirm the action in your text response before the ACTION_PAYLOAD block.
`;

// Extract active cultivation batch context for the AI
export function extractActiveBatchContext() {
  const activeItems = db.items.filter(item =>
    item.stage !== 'Archived' &&
    item.stage !== 'Spent' &&
    item.stage !== 'Contaminated'
  );

  const batchSummary = db.pcBatches.slice(0, 10).map(batch => {
    const batchItems = activeItems.filter(i => i.pcBatch === batch.batchId);
    return {
      batchId: batch.batchId,
      medium: batch.medium,
      date: batch.date,
      pcTime: batch.pcTime,
      activeItems: batchItems.length,
      stages: [...new Set(batchItems.map(i => i.stage))]
    };
  }).filter(b => b.activeItems > 0);

  const contaminatedItems = db.items.filter(i => i.stage === 'Contaminated');
  const contamSummary = contaminatedItems.slice(0, 5).map(i => ({
    id: i.id,
    label: i.label,
    contamType: i.contamType,
    contamVector: i.contamVector
  }));

  return {
    totalActiveContainers: activeItems.length,
    totalBatches: batchSummary.length,
    batches: batchSummary,
    recentContamination: contamSummary,
    stageBreakdown: {
      preparation: activeItems.filter(i => i.stage === 'Preparation').length,
      inoculated: activeItems.filter(i => i.stage === 'Inoculated').length,
      colonizing: activeItems.filter(i => i.stage === 'Colonizing').length,
      fullyColonized: activeItems.filter(i => i.stage === 'Fully Colonized').length,
      fruiting: activeItems.filter(i => i.stage === 'Fruiting').length,
      readyToUse: activeItems.filter(i => i.stage === 'Ready to Use').length
    }
  };
}

// Format batch context into a readable string for the AI prompt
export function formatBatchContext(context) {
  if (!context || context.totalActiveContainers === 0) {
    return 'No active cultivation batches currently tracked.';
  }

  let formatted = `ACTIVE CULTIVATION BATCHES:\n`;
  formatted += `Total Active Containers: ${context.totalActiveContainers}\n`;
  formatted += `Stage Breakdown: Prep(${context.stageBreakdown.preparation}), Inoc(${context.stageBreakdown.inoculated}), Colonizing(${context.stageBreakdown.colonizing}), Fully Col(${context.stageBreakdown.fullyColonized}), Fruiting(${context.stageBreakdown.fruiting}), Ready(${context.stageBreakdown.readyToUse})\n\n`;

  if (context.batches.length > 0) {
    formatted += `BATCH DETAILS:\n`;
    context.batches.forEach(b => {
      formatted += `- ${b.batchId}: ${b.medium} | PC'd ${b.date} (${b.pcTime} min) | ${b.activeItems} active items | Stages: ${b.stages.join(', ')}\n`;
    });
  }

  if (context.recentContamination.length > 0) {
    formatted += `\nRECENT CONTAMINATION (for diagnostic reference):\n`;
    context.recentContamination.forEach(c => {
      formatted += `- ${c.id} (${c.label}): ${c.contamType || 'Unknown'} | Vector: ${c.contamVector || 'Unknown'}\n`;
    });
  }

  return formatted;
}

// Call the Gemini 2.5 Flash API with the user prompt and batch context
export async function callGeminiAPI(userPrompt, activeBatchContext) {
  // Use provided context or extract fresh context
  const context = activeBatchContext || extractActiveBatchContext();
  const contextString = formatBatchContext(context);

  // Get effective API key (localStorage or config)
  const apiKey = getEffectiveApiKey();

  // Check if API key is configured
  if (!apiKey) {
    return getMockResponse(userPrompt, context);
  }

  try {
    const url = `${GEMINI.endpoint}/${GEMINI.model}:generateContent?key=${apiKey}`;

    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `${SYSTEM_PROMPT}\n\n---\n${contextString}\n---\n\nUSER QUESTION: ${userPrompt}`
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 1024
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Gemini API error:', errorData);
      if (response.status === 400 || response.status === 403) {
        return `⚠️ Invalid API key. Click the 🔑 icon in the header to update your Gemini API key.`;
      }
      return `⚠️ AI service error (${response.status}). Please try again later.`;
    }

    const data = await response.json();

    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      return data.candidates[0].content.parts[0].text;
    }

    return 'I received an unexpected response format. Please try again.';

  } catch (error) {
    console.error('Gemini API fetch error:', error);
    return `⚠️ Connection error: ${error.message}. Please check your internet connection.`;
  }
}

// Mock response fallback when API key is not configured
function getMockResponse(userPrompt, context) {
  const promptLower = userPrompt.toLowerCase();

  // Check for batch-related queries
  if (promptLower.includes('batch') || promptLower.includes('active') || promptLower.includes('status')) {
    if (context && context.totalActiveContainers > 0) {
      const batchLines = context.batches.map(b =>
        `• **${b.batchId}**: ${b.medium} (${b.activeItems} items, ${b.stages.join('/')})`
      ).join('\n');
      return `📊 **Your Active Batches:**\n${batchLines}\n\n**Total:** ${context.totalActiveContainers} containers tracked.\n\n_Note: Configure your Gemini API key in js/config.js for full AI responses._`;
    }
    return 'You don\'t have any active batches logged yet. Use the **PC Batch Log** button to create your first sterilization batch!\n\n_Note: Configure your Gemini API key in js/config.js for full AI responses._';
  }

  // Check for contamination-related queries
  if (promptLower.includes('contam') || promptLower.includes('mold') || promptLower.includes('trichoderma') || promptLower.includes('green')) {
    return `⚠️ **Contamination Protocol:**\n\n1. **ISOLATE IMMEDIATELY** - Move affected container away from grow area\n2. **Identify** - Green/black powder = Trichoderma; Sour smell = bacteria; Grey webbing = cobweb mold\n3. **Discard** - Do NOT open contaminated containers near your workspace\n4. **Review** - Check PC time, grain hydration, and inoculant cleanliness\n\n_Note: Configure your Gemini API key in js/config.js for personalized AI diagnostics._`;
  }

  // Check for recipe-related queries
  if (promptLower.includes('recipe') || promptLower.includes('cvg') || promptLower.includes('substrate')) {
    return `🧪 **CVG Recipe (6 quarts):**\n• 650g Coco Coir\n• 16qt Vermiculite\n• 100g Gypsum\n• ~4L Water (to field capacity)\n\n**Field Capacity Test:** Squeeze handful - only a few drops should release.\n\n_Note: Configure your Gemini API key in js/config.js for full AI responses._`;
  }

  // Check for liquid culture queries
  if (promptLower.includes('liquid culture') || promptLower.includes('lc')) {
    return `🧫 **Liquid Culture Recipe (500mL):**\n• 500mL Distilled Water\n• 1g Light Malt Extract\n• 10g Honey/Dextrose\n• 0.5g Peptone (optional)\n\n**Sterilization:** 30-45 min at 15 PSI. Use magnetic stir bar for faster colonization.\n\n_Note: Configure your Gemini API key in js/config.js for full AI responses._`;
  }

  // Default response
  return `🍄 **MycoAI Assistant**\n\nI can help with:\n• **Batch tracking** - Ask about your active batches\n• **Contamination** - Prevention and identification\n• **Recipes** - CVG, Master's Mix, LC\n• **Techniques** - G2G transfers, inoculation\n\nTry: "What are my active batches?" or "How do I prevent contamination?"\n\n_Note: Configure your Gemini API key in js/config.js for full AI responses._`;
}

// --- Action Execution (Function Calling / Conversational Inventory Logging) ---

// Parse and execute actions from AI response
export function processAIResponseActions(responseText) {
  const results = {
    cleanText: responseText,
    executedActions: []
  };

  // Find action_payload blocks in the response
  const actionBlockRegex = /```action_payload\s*([\s\S]*?)```/g;
  let match;

  while ((match = actionBlockRegex.exec(responseText)) !== null) {
    const jsonStr = match[1].trim();
    try {
      const payload = JSON.parse(jsonStr);
      if (payload && payload.action && payload.data) {
        const actionResult = executeAction(payload);
        results.executedActions.push(...actionResult);
        // Remove the action block from the display text
        results.cleanText = results.cleanText.replace(match[0], '').trim();
      }
    } catch (e) {
      console.error('Failed to parse ACTION_PAYLOAD:', e);
    }
  }

  return results;
}

// Execute a single action payload
function executeAction(payload) {
  const results = [];

  switch (payload.action) {
    case 'CREATE_ITEMS':
      results.push(...executeCreateItems(payload.data));
      break;
    case 'UPDATE_STAGE':
      results.push(...executeUpdateStage(payload.data));
      break;
    case 'LOG_HARVEST':
      results.push(...executeLogHarvest(payload.data));
      break;
    default:
      console.warn('Unknown action type:', payload.action);
  }

  return results;
}

// CREATE_ITEMS: Generate new inventory items
function executeCreateItems(data) {
  const results = [];
  const today = new Date().toLocaleDateString();
  const dateStr = formatMMDDYY(new Date());

  data.forEach(itemData => {
    const quantity = parseInt(itemData.quantity) || 1;
    const strain = itemData.strain || 'Unknown';
    const medium = itemData.mediumType || 'Unknown';
    const stage = itemData.stage || 'Preparation';
    const containerType = itemData.containerType || '';
    const baseName = itemData.name || `${strain} - ${medium}`;

    const mediumInitials = getMediumInitials(medium);
    const strainInitials = getStrainInitials(strain);
    const prefix = `${mediumInitials}-${strainInitials}-${dateStr}`;

    const generatedInRun = [];

    for (let i = 1; i <= quantity; i++) {
      // Generate unique ID
      let suffixNum = 1;
      let candidateId = '';
      while (true) {
        const testId = `${prefix}-${String(suffixNum).padStart(2, '0')}`;
        if (!db.items.find(item => item.id === testId) && !generatedInRun.includes(testId)) {
          candidateId = testId;
          generatedInRun.push(testId);
          break;
        }
        suffixNum++;
      }

      const newUuid = generateId();
      const newItem = {
        id: newUuid,
        code: candidateId,
        label: quantity > 1 ? `${baseName} (#${i}/${quantity})` : baseName,
        strain: strain,
        medium: medium,
        containerType: containerType,
        containerWeight: '',
        pcBatch: `AI-${dateStr}`,
        parentItemId: null,
        stage: stage,
        createdAt: today,
        breakAndShake: null,
        totalYield: 0,
        yields: [],
        contamType: null,
        contamVector: null,
        history: [{
          stage: stage,
          timestamp: new Date().toLocaleString(),
          notes: `Created via MycoAI chat assistant.`,
          env: ''
        }]
      };

      db.items.unshift(newItem);
    }

    results.push({
      type: 'CREATE_ITEMS',
      message: `✅ Created ${quantity} x ${baseName} in Inventory`,
      count: quantity
    });
  });

  saveItems();
  return results;
}

// UPDATE_STAGE: Update the stage of existing items
function executeUpdateStage(data) {
  const results = [];

  data.forEach(itemData => {
    const batchId = itemData.batchId || itemData.id;
    const newStage = itemData.stage;

    if (!batchId || !newStage) return;

    const item = db.items.find(i => i.id === batchId);
    if (item) {
      const oldStage = item.stage;
      item.stage = newStage;
      item.history.unshift({
        stage: newStage,
        timestamp: new Date().toLocaleString(),
        notes: `Stage updated via MycoAI (from ${oldStage}).`,
        env: ''
      });

      results.push({
        type: 'UPDATE_STAGE',
        message: `✅ Updated ${batchId} stage: ${oldStage} → ${newStage}`,
        itemId: batchId
      });
    } else {
      results.push({
        type: 'UPDATE_STAGE',
        message: `⚠️ Item ${batchId} not found`,
        itemId: batchId,
        error: true
      });
    }
  });

  if (results.some(r => !r.error)) {
    saveItems();
  }
  return results;
}

// LOG_HARVEST: Record yield for an item
function executeLogHarvest(data) {
  const results = [];

  data.forEach(itemData => {
    const batchId = itemData.batchId || itemData.id;
    const yieldGrams = parseFloat(itemData.yieldGrams) || 0;

    if (!batchId || yieldGrams <= 0) return;

    const item = db.items.find(i => i.id === batchId);
    if (item) {
      item.yields = item.yields || [];
      item.yields.push(yieldGrams);
      item.totalYield = item.yields.reduce((a, b) => a + b, 0);
      item.history.unshift({
        stage: 'Harvest',
        timestamp: new Date().toLocaleString(),
        notes: `Harvest logged via MycoAI: ${yieldGrams}g`,
        env: ''
      });

      results.push({
        type: 'LOG_HARVEST',
        message: `✅ Logged ${yieldGrams}g harvest for ${batchId} (Total: ${item.totalYield}g)`,
        itemId: batchId
      });
    } else {
      results.push({
        type: 'LOG_HARVEST',
        message: `⚠️ Item ${batchId} not found`,
        itemId: batchId,
        error: true
      });
    }
  });

  if (results.some(r => !r.error)) {
    saveItems();
  }
  return results;
}

// Save chat message to localStorage for persistence
export function saveChatMessage(role, text) {
  const chatHistory = JSON.parse(localStorage.getItem('myco_ai_chat')) || [];
  chatHistory.push({
    role,
    text,
    timestamp: new Date().toISOString()
  });
  // Keep only last 50 messages
  if (chatHistory.length > 50) {
    chatHistory.shift();
  }
  localStorage.setItem('myco_ai_chat', JSON.stringify(chatHistory));
}

// Load chat history from localStorage
export function loadChatHistory() {
  return JSON.parse(localStorage.getItem('myco_ai_chat')) || [];
}

// Clear chat history
export function clearChatHistory() {
  localStorage.removeItem('myco_ai_chat');
}