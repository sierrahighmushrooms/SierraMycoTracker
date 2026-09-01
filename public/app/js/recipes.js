// Sierra Myco Lab - Advanced Multi-Mode Recipe & Hydration Engine
// Provides exact dry/water weight ratios, batch scaling, container presets,
// sterilization cycle estimations, custom recipe persistence, and direct PC push.

export const DEFAULT_RECIPES = {
  grain: [
    {
      id: 'grain_oats_no_soak',
      name: 'Whole Oats (No Soak / No Simmer)',
      category: 'grain',
      defaultMoisturePct: 50,
      minMoisturePct: 50,
      maxMoisturePct: 60,
      ingredients: [
        { name: 'Whole Oats (Dry)', ratio: 1.0, type: 'dry' },
        { name: 'Gypsum (Optional)', ratio: 0.015, type: 'additive' }
      ],
      description: 'Standard 1:1 dry oats to boiling water ratio (50% target hydration) for autoclave/PC bags.'
    },
    {
      id: 'grain_millet_no_soak',
      name: 'White Proso Millet (Direct Hydration)',
      category: 'grain',
      defaultMoisturePct: 50,
      minMoisturePct: 50,
      maxMoisturePct: 55,
      ingredients: [
        { name: 'Dry Millet', ratio: 1.0, type: 'dry' },
        { name: 'Gypsum', ratio: 0.01, type: 'additive' }
      ],
      description: 'Direct hydration small grain with high inoculation point density calibrated at 50% moisture.'
    },
    {
      id: 'grain_rye_berries',
      name: 'Rye Berries (Standard Simmer/Soak)',
      category: 'grain',
      defaultMoisturePct: 52,
      minMoisturePct: 50,
      maxMoisturePct: 58,
      ingredients: [
        { name: 'Dry Rye Grain', ratio: 1.0, type: 'dry' },
        { name: 'Gypsum', ratio: 0.02, type: 'additive' }
      ],
      description: 'Traditional laboratory grain standard with excellent nutrient profile.'
    },
    {
      id: 'grain_sorghum_milo',
      name: 'Milo / Grain Sorghum',
      category: 'grain',
      defaultMoisturePct: 50,
      minMoisturePct: 50,
      maxMoisturePct: 55,
      ingredients: [
        { name: 'Dry Milo / Sorghum', ratio: 1.0, type: 'dry' },
        { name: 'Gypsum', ratio: 0.015, type: 'additive' }
      ],
      description: 'Clean spherical grain with optimal moisture absorption calibrated at 50% hydration.'
    }
  ],
  bulk: [
    {
      id: 'bulk_cvg_standard',
      name: 'Standard CVG (Field Capacity 80-85%)',
      category: 'bulk',
      defaultMoisturePct: 80,
      minMoisturePct: 75,
      maxMoisturePct: 85,
      dryBase: [
        { name: 'Coco Coir (Dry Block)', ratio: 0.77 },
        { name: 'Vermiculite (Medium/Fine)', ratio: 0.18 },
        { name: 'Gypsum (Calcium Sulfate)', ratio: 0.05 }
      ],
      description: 'The golden standard fruiting substrate for dung-loving species at field capacity (80-85%).'
    },
    {
      id: 'bulk_masters_mix',
      name: "Master's Mix (50/50 Hardwood & Soy Hull)",
      category: 'bulk',
      defaultMoisturePct: 60,
      minMoisturePct: 55,
      maxMoisturePct: 68,
      dryBase: [
        { name: 'Hardwood Sawdust Fuel Pellets', ratio: 0.50 },
        { name: 'Soybean Hull Pellets', ratio: 0.50 }
      ],
      description: 'High-yield gourmet woodlover substrate for Lions Mane, Oysters, Shiitake (60% standard hydration).'
    },
    {
      id: 'bulk_straw_supplemented',
      name: 'Supplemented Chopped Straw',
      category: 'bulk',
      defaultMoisturePct: 72,
      minMoisturePct: 65,
      maxMoisturePct: 78,
      dryBase: [
        { name: 'Chopped Wheat Straw', ratio: 0.85 },
        { name: 'Wheat Bran', ratio: 0.10 },
        { name: 'Hydrated Lime / Gypsum', ratio: 0.05 }
      ],
      description: 'Fast colonizing substrate for Pleurotus (Oyster) varieties.'
    },
    {
      id: 'bulk_manure_blend',
      name: 'Composted Manure & Coir Blend',
      category: 'bulk',
      defaultMoisturePct: 75,
      minMoisturePct: 65,
      maxMoisturePct: 82,
      dryBase: [
        { name: 'Composted Cow/Horse Manure', ratio: 0.50 },
        { name: 'Coco Coir', ratio: 0.35 },
        { name: 'Vermiculite', ratio: 0.10 },
        { name: 'Gypsum', ratio: 0.05 }
      ],
      description: 'Nutrient-rich pasteurized bulk substrate for secondary decomposers.'
    }
  ],
  agar: [
    {
      id: 'agar_mea_standard',
      name: 'Standard MEA (Malt Extract Agar - 500ml Base)',
      category: 'agar',
      baseVolumeMl: 500,
      ingredientsPerBase: [
        { name: 'Agar-Agar Powder', amount: 10, unit: 'g' },
        { name: 'Light Malt Extract (LME)', amount: 10, unit: 'g' },
        { name: 'Yeast Nutrient (Optional)', amount: 0.5, unit: 'g' },
        { name: 'Water (Distilled)', amount: 500, unit: 'ml' }
      ],
      description: 'Standard 2% nutrient agar recipe for petri dish culture work.'
    },
    {
      id: 'agar_pda_potato',
      name: 'PDA (Potato Dextrose Agar - 500ml Base)',
      category: 'agar',
      baseVolumeMl: 500,
      ingredientsPerBase: [
        { name: 'Agar-Agar Powder', amount: 10, unit: 'g' },
        { name: 'Dextrose / Glucose', amount: 10, unit: 'g' },
        { name: 'Potato Flakes / Infusion', amount: 4, unit: 'g' },
        { name: 'Water (Distilled)', amount: 500, unit: 'ml' }
      ],
      description: 'Classic high-nutrient formulation for robust mycelial sectoring.'
    },
    {
      id: 'lc_honey_peptone',
      name: 'Honey & Peptone LC (500ml Base)',
      category: 'agar',
      baseVolumeMl: 500,
      ingredientsPerBase: [
        { name: 'Raw Honey / Karo Light Syrup', amount: 20, unit: 'g' },
        { name: 'Mycological Peptone', amount: 1, unit: 'g' },
        { name: 'Water (Distilled/RO)', amount: 500, unit: 'ml' }
      ],
      description: 'Clear, high-growth liquid culture broth for rapid syringe expansion.'
    },
    {
      id: 'lc_lme_standard',
      name: '0.4% Light Malt Extract Broth (500ml Base)',
      category: 'agar',
      baseVolumeMl: 500,
      ingredientsPerBase: [
        { name: 'Light Malt Extract (LME)', amount: 2, unit: 'g' },
        { name: 'Bacteriological Peptone', amount: 0.5, unit: 'g' },
        { name: 'Water (Distilled)', amount: 500, unit: 'ml' }
      ],
      description: 'Crystal-clear broth formulated to prevent caramelization during sterilization.'
    }
  ]
};

export const RECIPE_CONTAINER_PRESETS = [
  { id: 'unicorn_5lb', name: 'Unicorn Bag 5lb (Large Bulk)', defaultWetGrams: 2268, capacityPerPC: 4, type: 'bag', pcMinutes: 150 },
  { id: 'unicorn_3lb', name: 'Unicorn Bag 3lb (Medium Spawn)', defaultWetGrams: 1360, capacityPerPC: 6, type: 'bag', pcMinutes: 120 },
  { id: 'quart_jar', name: 'Quart Mason Jar (32oz)', defaultWetGrams: 650, capacityPerPC: 7, type: 'jar', pcMinutes: 90 },
  { id: 'pint_jar', name: 'Pint Mason Jar (16oz)', defaultWetGrams: 320, capacityPerPC: 10, type: 'jar', pcMinutes: 90 },
  { id: 'petri_500ml', name: 'Media Bottle 500ml (~25 Dishes)', defaultWetGrams: 500, capacityPerPC: 4, type: 'bottle', pcMinutes: 45 },
  { id: 'media_1000ml', name: 'Media Bottle 1000ml (~50 Dishes)', defaultWetGrams: 1000, capacityPerPC: 2, type: 'bottle', pcMinutes: 45 },
  { id: 'tub_monotub', name: 'MonoTub Bulk Load (12-15lb)', defaultWetGrams: 5440, capacityPerPC: 2, type: 'bulk', pcMinutes: 150 },
  { id: 'shoebox_6qt', name: 'Shoebox 6qt Substrate Load (4lb)', defaultWetGrams: 1814, capacityPerPC: 4, type: 'bulk', pcMinutes: 120 },
  { id: 'custom_weight', name: 'Custom Weight / Volume', defaultWetGrams: 1000, capacityPerPC: 4, type: 'custom', pcMinutes: 90 }
];

export const STORAGE_KEY_CUSTOM_RECIPES = 'myco_custom_recipes';

export function getCustomRecipes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CUSTOM_RECIPES);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.warn('Error reading custom recipes from storage:', err);
    return [];
  }
}

export function saveCustomRecipe(recipe) {
  try {
    const existing = getCustomRecipes();
    const idx = existing.findIndex(r => r.id === recipe.id);
    if (idx >= 0) {
      existing[idx] = recipe;
    } else {
      existing.push(recipe);
    }
    localStorage.setItem(STORAGE_KEY_CUSTOM_RECIPES, JSON.stringify(existing));
    return true;
  } catch (err) {
    console.error('Failed to save custom recipe:', err);
    return false;
  }
}

export function deleteCustomRecipe(id) {
  try {
    const existing = getCustomRecipes().filter(r => r.id !== id);
    localStorage.setItem(STORAGE_KEY_CUSTOM_RECIPES, JSON.stringify(existing));
    return true;
  } catch (err) {
    console.error('Failed to delete custom recipe:', err);
    return false;
  }
}