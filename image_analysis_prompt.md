# User Image Analysis Prompt

## Overview
This document contains the AI prompt used by the ImageEmbedder service for analyzing user-provided images and suggesting optimal placements in educational videos.



## Prompt Template

```javascript
private static getUserImageAnalysisPrompt = (userImage: UserProvidedImage, dialogueEntries: any[], topic: string) => `
Analyze this SPECIFIC user-provided image for placement in an educational video about "${topic}":

ACTUAL UPLOADED IMAGE DETAILS:
- Image Label: "${userImage.label}"
- Image Description: "${userImage.description || 'No description provided'}"
- Image ID: "${userImage.id}"

CRITICAL: You must ONLY analyze placement suggestions for THIS SPECIFIC IMAGE. The user has explicitly labeled this image as "${userImage.label}" and provided description "${userImage.description || 'No description'}". Focus your analysis on how well this image matches the user's intended concept, NOT on any assumptions about the actual image content.

Available dialogue segments:
${dialogueEntries.map((entry: any, index: number) =>
  `${index + 1}. [${entry.startTime.toFixed(1)}s-${entry.endTime.toFixed(1)}s] ${entry.character || 'Speaker'}: "${entry.text}"`
).join('\n')}

ANALYSIS GUIDELINES:
1. ONLY suggest placements for the image with label "${userImage.label}"
2. The user has labeled this image as "${userImage.label}" - assume this label is accurate and find dialogue that matches this concept
3. Look for dialogue segments that discuss concepts related to "${userImage.label}" or "${userImage.description || ''}"
4. If the dialogue mentions "${userImage.label}" or closely related terms, this is highly relevant
5. Consider educational value: would showing this image help explain the concept being discussed?
6. Score relevance based on how well the dialogue content matches the user's label and description
7. If this image label/description doesn't match any dialogue content, it may still be relevant if the user intended it for the topic "${topic}"
8. Score relevance honestly: 10 = perfect match with dialogue, 5-7 = good match, 1-4 = weak match, 0 = no clear connection
9. For alternativeIndices, provide MAXIMUM 3-5 backup options

EDUCATIONAL PLACEMENT STRATEGY:
- Images work best when placed during discussions of the concept they represent
- If the dialogue mentions the image's label or description, that's the ideal placement
- Consider the broader topic "${topic}" - images related to the main topic are generally valuable

Return your analysis focusing on how well THIS SPECIFIC user-labeled image matches the dialogue content about "${topic}". Trust the user's labeling and find the best educational placement.
`;
```

## Response Schema (Zod)

```javascript
const analysisSchema = z.object({
  bestDialogueIndex: z.number().min(1).max(dialogueEntries.length).describe(`Index of best matching dialogue (1-based, must be between 1 and ${dialogueEntries.length})`),
  relevanceScore: z.number().min(0).max(10).describe("Relevance score 0-10"),
  reasoning: z.string().describe("Detailed explanation for placement choice"),
  isRelevant: z.boolean().describe("Whether image should be included"),
  alternativeIndices: z.array(z.number().min(1).max(dialogueEntries.length)).max(5).describe(`Alternative dialogue indices (1-based, each between 1 and ${dialogueEntries.length}, maximum 5 alternatives)`)
});
```

## Key Features

### 1. **User-Centric Analysis**
- Focuses on user's explicit labeling and description
- Treats user-provided labels as authoritative
- Avoids assumptions about actual image content

### 2. **Educational Context**
- Evaluates how well images support learning objectives
- Considers timing within dialogue flow
- Balances specificity vs. topic relevance

### 3. **Flexible Matching**
- Direct label matches get highest priority
- Topic-related images are still valuable
- Provides multiple placement alternatives

### 4. **Scoring System**
- **10**: Perfect match with dialogue content
- **5-7**: Good conceptual match
- **1-4**: Weak or tangential connection
- **0**: No clear educational value

## Example Usage

**Input:**
- Topic: "How OpenAI Nvidia Oracle Are Rewiring the AI World"
- User Image Label: "Oracle then uses that money to buy forty billion in Nvidia GPUs for the Stargate project"
- Dialogue Entry: "AI infrastructure. Oracle" (at 119.23s)

**Expected Output:**
```javascript
{
  bestDialogueIndex: 11,
  relevanceScore: 9,
  reasoning: "The user-provided image is labeled 'Oracle then uses that money to buy forty billion in Nvidia GPUs for the Stargate project'. Dialogue segment 11, 'AI infrastructure. Oracle', provides the strongest direct match. The image's content explicitly refers to Oracle acquiring Nvidia GPUs for a project, which directly contributes to 'AI infrastructure.'",
  isRelevant: true,
  alternativeIndices: [7, 9, 10]
}
```

## Integration Notes

1. **Dialogue Format**: Expects dialogue entries with `startTime`, `endTime`, `character`, and `text` properties
2. **Index Handling**: Uses 1-based indexing for AI (converted to 0-based for array access)
3. **Score Normalization**: AI returns 0-10 scale, normalized to 0-1 for frontend display
4. **Validation**: Includes bounds checking and fallback logic for invalid AI responses

## Error Handling

- Invalid dialogue indices default to index 0
- Missing or malformed AI responses trigger fallback logic
- Empty dialogue arrays are handled gracefully
- Network timeouts use cached or basic timing

## Performance Considerations

- Prompt length scales with number of dialogue entries
- AI processing time varies with dialogue complexity
- Includes timeout handling for reliability
- Supports caching of analysis results
based on ass and system prompt create new better more accurate plan with better timestamps  json do not change json format